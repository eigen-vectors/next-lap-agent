import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ==========================================
// CONFIGURATION
// ==========================================
const MISTRAL_MODEL = "mistral-large-latest";
const NANO_GEN_URL = "https://api.nanobananaapi.ai/api/v1/nanobanana/generate";
const NANO_STATUS_URL = "https://api.nanobananaapi.ai/api/v1/nanobanana/record-info";
const BUCKET_NAME = "event-images";
const TABLE_NAME = "event_images"; 
const MAX_QUEUE_DEPTH = 5;

// ==========================================
// MOMENT ARCHETYPES (DERIVED FROM REFERENCE IMAGES)
// ==========================================
const MOMENT_ARCHETYPES = [
  "THE PACK SURGE: A telephoto compression shot of a dense group of 3+ athletes running toward the camera, capturing the intensity of a mass start or busy course section.",
  "SHARED TRIUMPH: A candid, medium shot of two or three participants interacting mid-race or post-race (high-fives, arm-in-arm, laughing), emphasizing camaraderie.",
  "THE SCENIC ISOLATION: A wide environmental shot where the athlete is a small figure embedded in a majestic landscape (forest, mountain, or open water), emphasizing scale.",
  "DYNAMIC TRANSITION: (Specific to Multisport) A chaotic but focused shot of athletes moving between disciplines—exiting water, grabbing bikes, or starting the run.",
  "THE GRITTY CLIMB: A low-angle shot emphasizing the steepness of terrain or the difficulty of an obstacle, focusing on the athlete's determination and physical exertion.",
  "WATER LEVEL ACTION: (Specific to Swim/Tri) A camera split-shot or surface-level angle showing the chaos of open water swimming—splashes, arms, and bright swim caps."
];

// ==========================================
// DATA FIELDS MAP
// ==========================================
const CONTEXT_FIELDS = [
  "city", "organiser", "firstEdition", "lastEdition", "mode", "theme",
  "swimType", "swimmingLocation", "swimCutoff", "dayTemp",
  "cyclingElevation", "cyclingSurface", "cycleType",
  "runningElevation", "runningSurface", "numberOfparticipants"
];

// ==========================================
// MASTER SYSTEM PROMPT (HIGH-FIDELITY ANALYSIS)
// ==========================================
const MASTER_SYSTEM_PROMPT = `
## HIGH-FIDELITY SPORTS PHOTOJOURNALISM — MASTER PROMPT
### SYSTEM / IMAGE PROMPT

Generate **one single image** with **ZERO TEXT**.

The image must be a **Masterpiece of Sports Documentary Photography**.
It must look exactly like a shot from Reuters, Getty Images Sport, or a high-end event gallery.
**AESTHETIC:** Authentic, Textured, Dynamic, Unstaged.
**PROHIBITED:** AI-smoothness, plastic skin, impossible physics, oversaturated "cartoon" colors.

---

## 1. VISUAL STYLE & CAMERA
* **Camera:** Canon EOS R3 or Nikon Z9.
* **Lens:** 
    * For Groups/Crowds: 85mm or 70-200mm (Telephoto compression).
    * For Trail/Scenery: 35mm (Environmental context).
* **Shutter:** High speed (1/1000s) to freeze sweat, water droplets, and dirt kicking up.
* **Color Grade:** Natural, slightly desaturated earth tones for trails; vibrant but realistic colors for urban runs. **No HDR filters.**

---

## 2. EVENT CONTEXT (LOGIC & PHYSICS)
* **Event:** {EVENT_NAME}
* **Type:** {EVENT_TYPE}
* **Location Data:**
{DETAILED_CONTEXT}

---

## 3. STRICT VISUAL RULES BY ACTIVITY TYPE (MANDATORY)

**IF EVENT IS 'TRAIL', 'ULTRA', or 'HIKING':**
*   **Gear:** Hydration vests (Salomon style), trail shoes with grip, buffs/headbands, GPS watches.
*   **Vibe:** Gritty, endurance, isolation, muddy legs.
*   **Environment:** Forests, mountains, misty hills, dirt paths. NO ASPHALT.
*   **Lighting:** Soft, diffused, morning mist or golden hour.

**IF EVENT IS 'FUN RUN', '5K', or 'CHARITY':**
*   **Gear:** Cotton t-shirts (often matching charity colors), costumes (bunny ears/tutus if applicable), less technical gear.
*   **Vibe:** Pure joy, laughter, high-fives, holding hands. Less competitive.
*   **Environment:** Urban parks, paved paths, safety barriers.
*   **Lighting:** Bright, sunny, high-key.

**IF EVENT IS 'TRIATHLON' or 'DUATHLON':**
*   **Gear:** ONE-PIECE TRI-SUITS (tight fitting). No baggy shorts. Sunglasses. Race belts.
*   **Context:** If swimming: Wetsuits (unless tropical), bright silicone caps, goggles. If cycling: Aero helmets, road bikes, water bottles behind saddle.
*   **Environment:** Transition zones (bike racks), open water (lakes/sea), clean tarmac roads.

**IF EVENT IS 'OBSTACLE' or 'MUD RUN':**
*   **Visuals:** MUD. Everywhere. On faces, clothes, legs.
*   **Action:** Climbing, crawling, splashing.
*   **Gear:** Tight compression wear (black/dark usually), headbands.

**IF EVENT IS 'SWIMRUN' or 'AQUATHLON':**
*   **Specifics:** Athletes wearing wetsuits cut above the knee + running shoes + pull buoys strapped to legs.
*   **Action:** Exiting water onto rocks, or running on trails in wetsuits.

---

## 4. SCENE SELECTION
Generate the image based on this archetype:
**{SELECTED_ARCHETYPE}**

**ADAPTATION:**
You must adapt the archetype to the **Specific Logic** defined in Section 3.
(e.g., If "The Pack Surge" is selected for a "Trail Run", show a line of runners on a narrow dirt path, not a wide road).

---

## 5. HUMAN PRESENCE & CROWD LOGIC
* **Crowd Density:** Use 'numberOfparticipants' to decide.
    * High (>2000): Background should be filled with other blurred runners.
    * Low (<200): Background is nature/scenery.
* **Diversity:** Natural mix of ages and ethnicities suitable for the location.
* **Expressions:** 
    * Short distance = Smiles, shouting, energy.
    * Long distance = Focus, grit, mouth breathing, determination.

---

## 6. ABSOLUTE PROHIBITIONS
* **NO TEXT** (Bib numbers must be blurry/illegible).
* **NO** "Gym" settings (must be outdoors).
* **NO** impossible gear (e.g., swimming with a bike helmet).
* **NO** solo runners for mass events (must imply competition).
* **NO** over-editing or "magical" lighting.

**OUTPUT INSTRUCTION:**
Write a precise, photographer-centric prompt describing the subject, action, gear, lighting, and lens. Output ONLY the raw prompt text.
`;

// ==========================================
// HELPERS
// ==========================================
function getCleanFilename(text: string): string {
  return text.replace(/[^a-zA-Z0-9\s-_]/g, '').trim().replace(/\s+/g, '_');
}

function delay(ms: number) {
  return new Promise( resolve => setTimeout(resolve, ms) );
}

function extractUrlSmartly(data: any): string | null {
  let url = data.resultImageUrl || data.imageUrl || data.url;
  if (url) return url;
  
  let responseObj = data.response;
  if (typeof responseObj === 'string') {
    try { responseObj = JSON.parse(responseObj); } catch (e) {}
  }
  
  if (responseObj && typeof responseObj === 'object') {
    return responseObj.resultImageUrl || 
           responseObj.url || 
           (Array.isArray(responseObj.images) ? responseObj.images[0] : null);
  }
  return null;
}

function buildDetailedContext(row: any): string {
  let contextLines: string[] = [];

  for (const field of CONTEXT_FIELDS) {
    const snakeField = field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    const lowerField = field.toLowerCase();
    
    // Check specific variations for participants column
    const value = row[field] || row[snakeField] || row[lowerField] || row[field.replace(/ /g, '_')] || row['numberOfParticipants'] || row['participants'];

    if (value !== null && value !== undefined && value !== "") {
      const label = field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
      contextLines.push(`* **${label}:** ${value}`);
    }
  }

  if (contextLines.length === 0) return "No additional detailed data provided.";
  return contextLines.join("\n");
}

// ==========================================
// MAIN SERVE HANDLER
// ==========================================
Deno.serve(async (req) => {
  // 1. Environment Variables
  const URL = Deno.env.get('SUPABASE_URL')!; 
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const MISTRAL_KEY = Deno.env.get('IMAGE_PROMPT_GENERATION')!;
  const NANOBANANA_KEY = Deno.env.get('NANOBANANAAPI')!;

  // Initialize Client
  const supabase = createClient(URL, SERVICE_ROLE);

  // Queue Depth
  const recursionDepth = parseInt(req.headers.get('x-recursion-depth') || '0');
  console.log(`[Queue] Processing request (depth: ${recursionDepth})`);

  if (recursionDepth >= MAX_QUEUE_DEPTH) {
    return new Response(JSON.stringify({ error: 'Max queue depth reached', recursionDepth }), { status: 500 });
  }

  // 2. Fetch Pending Task
  const { data: rows, error: dbError } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .or('task_status.eq.pending,and(task_status.eq.failed,retry_count.lt.3)')
    .order('task_status', { ascending: true }) 
    .order('retry_count', { ascending: true }) 
    .limit(1);

  if (dbError) {
    return new Response(JSON.stringify({ error: dbError }), { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ message: "No pending tasks.", recursionDepth }), { status: 200 });
  }

  const row = rows[0];
  const festivalName = row.festival_name || row.festivalName || "Unknown Event";
  const activityType = row.type || row.activity_type || "Running";
  const isRetry = row.task_status === 'failed';
  const currentRetryCount = row.retry_count || 0;

  console.log(`[Queue] Processing: ${festivalName} | Type: ${activityType} | ID: ${row.id}`);

  // 3. Mark Processing
  await supabase.from(TABLE_NAME).update({ 
    task_status: 'processing',
    generation_started_at: new Date().toISOString(),
    error_message: null,
    retry_count: isRetry ? currentRetryCount + 1 : currentRetryCount
  }).eq('id', row.id);

  try {
    // ------------------------------------------
    // STEP 0: CONTEXT & ARCHETYPE
    // ------------------------------------------
    const detailedContext = buildDetailedContext(row);
    
    // Select archetype
    const selectedArchetype = MOMENT_ARCHETYPES[Math.floor(Math.random() * MOMENT_ARCHETYPES.length)];
    console.log(`[Queue] Context built. Selected Archetype: "${selectedArchetype}"`);

    // ------------------------------------------
    // STEP 1: MISTRAL PROMPT GENERATION
    // ------------------------------------------
    let formattedPrompt = MASTER_SYSTEM_PROMPT.replace("{EVENT_NAME}", festivalName);
    formattedPrompt = formattedPrompt.replace("{EVENT_TYPE}", activityType);
    formattedPrompt = formattedPrompt.replace("{SELECTED_ARCHETYPE}", selectedArchetype);
    formattedPrompt = formattedPrompt.replace("{DETAILED_CONTEXT}", detailedContext);
    
    const mistralResp = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${MISTRAL_KEY}`, 
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        messages: [{ role: "user", content: formattedPrompt }],
        temperature: 0.65 // Balanced creativity and strict adherence
      })
    });

    if (!mistralResp.ok) throw new Error(`Mistral API Error: ${mistralResp.statusText}`);
    
    const mistralJson = await mistralResp.json();
    let promptText = mistralJson.choices[0].message.content.trim().replace(/^"|"$/g, '');

    // Save Prompt
    await supabase.from(TABLE_NAME).update({ generation_prompt: promptText }).eq('id', row.id);

    // ------------------------------------------
    // STEP 2: NANOBANANA GENERATION
    // ------------------------------------------
    const nanoSubmit = await fetch(NANO_GEN_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${NANOBANANA_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: promptText, type: "TEXTTOIAMGE", numImages: 1 })
    });

    const nanoJson = await nanoSubmit.json();
    if (nanoJson.code !== 200) throw new Error(`Nanobanana Submit Failed: ${nanoJson.msg}`);
    const taskId = nanoJson.data.taskId;

    // ------------------------------------------
    // STEP 3: POLLING
    // ------------------------------------------
    let imageUrl = null;
    for (let i = 0; i < 6; i++) { 
      await delay(10000);
      const sResp = await fetch(`${NANO_STATUS_URL}?taskId=${taskId}`, {
        headers: { "Authorization": `Bearer ${NANOBANANA_KEY}` }
      });
      const sJson = await sResp.json();
      const data = sJson.data || {};
      
      if (data.status === 1 || data.successFlag === 1) {
        imageUrl = extractUrlSmartly(data);
        if (imageUrl) break;
      } else if (data.status === 2 || data.status === 3) {
        throw new Error("Nanobanana generation failed.");
      }
    }

    if (!imageUrl) throw new Error("Polling timed out.");

    // ------------------------------------------
    // STEP 4: STORAGE UPLOAD
    // ------------------------------------------
    const imgResp = await fetch(imageUrl);
    const imgBlob = await imgResp.blob();
    const cleanName = getCleanFilename(festivalName);
    const filePath = `events/${cleanName}/${Date.now()}.png`; 

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, imgBlob, { contentType: 'image/png', upsert: true });

    if (uploadError) throw new Error(`Storage Upload Error: ${uploadError.message}`);

    const { data: pUrl } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);

    // ------------------------------------------
    // STEP 5: MARK COMPLETED
    // ------------------------------------------
    await supabase.from(TABLE_NAME).update({
      image_url: pUrl.publicUrl,
      image_generated: true,
      task_status: 'completed'
    }).eq('id', row.id);

    console.log(`[Queue] ✅ Completed: ${festivalName}`);

    // ------------------------------------------
    // STEP 6: SELF-INVOKE (RECURSION)
    // ------------------------------------------
    const { count } = await supabase
      .from(TABLE_NAME)
      .select('*', { count: 'exact', head: true })
      .eq('task_status', 'pending');

    if (count && count > 0 && recursionDepth < MAX_QUEUE_DEPTH) {
      console.log(`[Queue] Triggering next (Remaining: ${count})`);
      fetch(`${URL}/functions/v1/generate-event-image`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SERVICE_ROLE}`,
          'x-recursion-depth': (recursionDepth + 1).toString()
        }
      }).catch(err => console.error('Self-invocation failed:', err));
    }

    return new Response(JSON.stringify({ 
      success: true, 
      festival: festivalName,
      url: pUrl.publicUrl 
    }), { headers: { "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error(`[Queue] ❌ Failed: ${festivalName}`, err);
    
    const newRetryCount = isRetry ? currentRetryCount + 1 : currentRetryCount + 1;
    const shouldRetry = newRetryCount < 3;
    
    await supabase.from(TABLE_NAME).update({ 
      task_status: shouldRetry ? 'failed' : 'permanently_failed',
      retry_count: newRetryCount,
      error_message: `${shouldRetry ? 'Retrying' : 'Failed'}: ${err.message}`
    }).eq('id', row.id);

    const { count } = await supabase
      .from(TABLE_NAME)
      .select('*', { count: 'exact', head: true })
      .eq('task_status', 'pending');

    if (count && count > 0 && recursionDepth < MAX_QUEUE_DEPTH) {
      fetch(`${URL}/functions/v1/generate-event-image`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SERVICE_ROLE}`, 'x-recursion-depth': (recursionDepth + 1).toString() }
      }).catch(console.error);
    }

    return new Response(JSON.stringify({ error: err.message, retryCount: newRetryCount }), { status: 500 });
  }
});
