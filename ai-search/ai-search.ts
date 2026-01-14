import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MISTRAL_API_URL = 'https://api.mistral.ai/v1'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const startTime = performance.now()

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const MISTRAL_API_KEY = Deno.env.get('MISTRAL_API_KEY')!

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
    const { query } = await req.json()

    // 1. Parallel Execution: Embedding (Critical) vs Filters (Enhancement)
    const [embeddingRes, filterRes] = await Promise.allSettled([
      fetch(`${MISTRAL_API_URL}/embeddings`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MISTRAL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'mistral-embed', input: [query.replace(/\n/g, ' ')] })
      }),
      extractSmartFilters(query, MISTRAL_API_KEY)
    ])

    // 2. Process Embedding
    if (embeddingRes.status === 'rejected' || !embeddingRes.value.ok) {
        throw new Error("Mistral Embedding API failed")
    }
    const embeddingData = await embeddingRes.value.json()
    const vector = embeddingData.data[0].embedding

    // 3. Process Filters (Optimistic Fallback)
    let filters = { type: null, location: null, location_category: 'Broad', months: null }
    if (filterRes.status === 'fulfilled' && filterRes.value) {
        filters = filterRes.value
    }

    // 4. Decide on Location Logic
    // If location is specific (City), use SQL filter. 
    // If Broad (Region), pass NULL and let Vector Search handle it.
    const sqlLocationFilter = filters.location_category === 'Specific' ? filters.location : null

    const { data: results, error } = await supabase.rpc('search_races_hybrid', {
      query_embedding: vector,
      filter_type: filters.type,
      filter_location: sqlLocationFilter,
      filter_months: filters.months,
      match_threshold: 0.35,
      match_count: 15
    })

    if (error) throw error

    const latency = Math.round(performance.now() - startTime)
    
    return new Response(JSON.stringify({ 
        results, 
        metadata: { ...filters, latency_ms: latency } 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, headers: corsHeaders 
    })
  }
})

// Lightweight Filter Extraction
async function extractSmartFilters(query: string, apiKey: string) {
    const today = new Date()
    const prompt = `System: JSON only. Today: ${today.toDateString()}.
    Extract: 
    - type: Running/Cycling/Triathlon/Swimming
    - location: Name of place
    - location_category: 'Specific' if City/State, 'Broad' if Region/Country/Description
    - months: Array of full month names based on query relative to today.
    User: "${query}"`

    try {
        const res = await fetch(`${MISTRAL_API_URL}/chat/completions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'mistral-small-latest',
                messages: [{ role: 'user', content: prompt }],
                response_format: { type: "json_object" },
                temperature: 0,
                max_tokens: 150
            })
        })
        const data = await res.json()
        return JSON.parse(data.choices[0].message.content)
    } catch (e) {
        return null
    }
}
