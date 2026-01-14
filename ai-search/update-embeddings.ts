import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MISTRAL_API_URL = 'https://api.mistral.ai/v1'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const MISTRAL_KEY = Deno.env.get('MISTRAL_API_KEY')!

  // Fetch all rows (Pagination may be needed if > 1000 rows)
  const { data: rows, error } = await supabase
    .from('Races Database')
    .select('*')
  
  if (error || !rows) return new Response("Error fetching rows", { status: 500 })

  console.log(`Starting weekly update for ${rows.length} rows...`)
  let updatedCount = 0

  for (const row of rows) {
    // 1. Enrich Data for Broad Search
    let geoContext = ""
    if (row.city && ['Goa', 'Mumbai', 'Chennai', 'Kochi'].includes(row.city)) geoContext += " Coastal Sea Beach"
    if (row.city && ['Manali', 'Leh', 'Ladakh'].includes(row.city)) geoContext += " Himalayas Mountain High Altitude"
    if (row.country === 'India') geoContext += " South Asia"

    // 2. Construct Rich Text
    const text = `Event: ${row.event}. Sport: ${row.type} ${row.triathlonType || ''}. Location: ${row.city}, ${row.region}, ${row.country}. Time: ${row.month}. Difficulty: ${row.difficultyLevel}. Features: ${row.scenic || ''} ${geoContext}`.replace(/\n/g, ' ')

    try {
        // 3. Generate Embedding
        const res = await fetch(`${MISTRAL_API_URL}/embeddings`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${MISTRAL_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'mistral-embed', input: [text] })
        })
        
        if (!res.ok) continue

        const data = await res.json()
        const vector = data.data[0].embedding

        // 4. Update Database
        await supabase
            .from('Races Database')
            .update({ embedding: vector })
            .eq('primaryKey', row.primaryKey)
        
        updatedCount++

    } catch (e) {
        console.error(`Failed for ${row.event}`, e)
    }
  }

  return new Response(JSON.stringify({ updated: updatedCount, total: rows.length }), {
    headers: { "Content-Type": "application/json" }
  })
})
