import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// --- Configuration ---
const MISTRAL_API_URL = 'https://api.mistral.ai/v1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// --- Interfaces ---
interface RequestPayload {
  query: string
}

interface ExtractedFilters {
  sport: string | null
  location: string | null
  distance: string | null
  intent: string
}

interface SearchResult {
  id: number
  title: string
  description: string
  sport: string
  location: string
  date: string
  similarity: number
}

// --- Main Handler ---
serve(async (req) => {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = performance.now()

  try {
    // 2. Environment & Client Setup
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const MISTRAL_API_KEY = Deno.env.get('MISTRAL_API_KEY')
    const MISTRAL_MODEL_ID = Deno.env.get('MISTRAL_MODEL') || 'mistral-small' // Default if env missing

    if (!SUPABASE_URL || !SERVICE_ROLE || !MISTRAL_API_KEY) {
      throw new Error('Missing Supabase URL, Service Role Key, or Mistral API Key')
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

    // 3. Parse Input
    const body = await req.json() as RequestPayload
    const userQuery = body.query

    if (!userQuery || typeof userQuery !== 'string') {
      throw new Error('Invalid input: "query" string is required.')
    }

    console.log(`Processing search for: "${userQuery}"`)

    // 4. Parallel AI Operations (Embedding + Extraction)
    // We run these in parallel to reduce total latency
    const [embeddingVector, extractedFilters] = await Promise.all([
      generateMistralEmbedding(userQuery, MISTRAL_API_KEY),
      extractFiltersWithMistral(userQuery, MISTRAL_API_KEY, MISTRAL_MODEL_ID)
    ])

    // 5. Execute Hybrid Search via Supabase RPC
    // Note: We are searching the "Races Database" table via the RPC function
    const { data: searchResults, error: dbError } = await supabase.rpc(
      'search_races', 
      {
        query_embedding: embeddingVector,
        filter_sport: extractedFilters.sport,
        filter_location: extractedFilters.location,
        match_threshold: 0.4, // Adjust based on desired strictness
        match_count: 10
      }
    )

    if (dbError) {
      console.error('Database RPC Error:', dbError)
      throw new Error(`Database search failed: ${dbError.message}`)
    }

    const endTime = performance.now()

    // 6. Construct Response
    const response = {
      results: searchResults || [],
      metadata: {
        interpreted_query: extractedFilters,
        processing_time_ms: Math.round(endTime - startTime),
        model_used: MISTRAL_MODEL_ID
      }
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error('Edge function error:', error)
    
    return new Response(
      JSON.stringify({
        error: error.message || 'Internal Server Error',
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500, // Return 500 for server errors
      }
    )
  }
})

// --- Helper: Generate Embeddings (Mistral) ---
async function generateMistralEmbedding(text: string, apiKey: string): Promise<number[]> {
  const cleanText = text.replace(/\n/g, ' ').trim()
  
  const response = await fetch(`${MISTRAL_API_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'mistral-embed', // Standard Mistral embedding model
      input: [cleanText]
    })
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Mistral Embedding API Error: ${response.status} - ${errText}`)
  }

  const data = await response.json()
  // Mistral-embed returns 1024 dimensions
  return data.data[0].embedding
}

// --- Helper: Extract Filters (Mistral Chat) ---
async function extractFiltersWithMistral(
  query: string, 
  apiKey: string, 
  modelId: string
): Promise<ExtractedFilters> {
  
  const systemPrompt = `
    You are a precise search query parser for a database named "Races Database".
    Your task is to extract structured filters from a user's natural language search.

    Fields to extract:
    - sport: 'Running', 'Cycling', 'Triathlon', 'Swimming' (Normalize to these values)
    - location: The city or region mentioned (e.g., "South India", "Bangalore", "Texas")
    - distance: Short descriptions or specific distances (e.g., "5k", "Marathon", "Short")
    - intent: A brief summary of what the user is looking for.

    Rules:
    1. If a field is not mentioned, return null.
    2. Normalize sports to the provided list if possible.
    3. Return ONLY valid JSON. No markdown formatting.

    Example Input: "I want a marathon in South India"
    Example Output: { "sport": "Running", "location": "South India", "distance": "Marathon", "intent": "Find marathons in South India" }
  `

  try {
    const response = await fetch(`${MISTRAL_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        temperature: 0.1, // Low temperature for deterministic extraction
        response_format: { type: "json_object" }
      })
    })

    if (!response.ok) {
      console.warn('Mistral Chat API failed, falling back to empty filters.')
      return { sport: null, location: null, distance: null, intent: query }
    }

    const data = await response.json()
    const content = data.choices[0].message.content
    
    // Parse the JSON response
    return JSON.parse(content)

  } catch (error) {
    console.error('Filter extraction error:', error)
    // Fallback: return no filters so vector search still runs on the raw text
    return { sport: null, location: null, distance: null, intent: query }
  }
}
