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
// MOMENT ARCHETYPES (VIBRANT / GROUP / HIGH ENERGY)
// ==========================================
const MOMENT_ARCHETYPES = [
  "GROUP MOMENTUM: A dynamic wide shot of a pack of participants (3+) moving together, capturing the scale and shared energy of the event.",
  "SHARED JOY: A candid, mid-action close-up of a group of participants (3+) smiling or cheering while performing the activity.",
  "THE START/SURGE: The high-energy moment of a group crossing a timing mat or moving through a scenic section, conveying speed and excitement.",
  "CAMARADERIE: Participants engaging with each other (high-fives, running shoulder-to-shoulder) or acknowledging the crowd/volunteers with enthusiasm.",
  "SCENIC ACTION: A group of athletes framed against the most beautiful landmark or landscape feature of the location, bathed in bright light."
];

// ==========================================
// DATA FIELDS MAP (INCLUDES NEW COLUMNS)
// ==========================================
const CONTEXT_FIELDS = [
  "city", "organiser", "firstEdition", "lastEdition", "mode", "theme",
  "swimType", "swimmingLocation", "swimCutoff", "dayTemp",
  "cyclingElevation", "cyclingSurface", "cycleType",
  "runningElevation", "runningSurface", "numberOfparticipants" // Specific column name
];

// ==========================================
// MASTER SYSTEM PROMPT (PHOTOREALISM / VIBRANT)
// ==========================================
const MASTER_SYSTEM_PROMPT = `
## VIBRANT COMMERCIAL SPORTS PHOTOGRAPHY — MASTER PROMPT
### SYSTEM / IMAGE PROMPT

Generate **one single image** with **ZERO TEXT**.

The image must be a **Photorealistic, High-Definition Photograph**.
It must resemble a professional shot from a sports magazine or commercial brand campaign (Nike/Adidas style).
**MOOD:** Bright, Energetic, Positive, Celebrating Fitness.

---

## 1. STYLE & AESTHETIC (STRICT REALISM)
* **Medium:** Digital Photography (DSLR).
* **Look:** Sharp focus, high shutter speed (freezing action), distinct textures (skin pores, fabric weave, sweat, water droplets).
* **ABSOLUTELY PROHIBITED:** Illustration, 3D Render, Painting, Cartoon, Anime, AI-Art style, blurriness, distortion.
* **If the image looks "fake" or "painted," it is invalid.**

---

## 2. EVENT CONTEXT (VARIABLES)
* **Event:** {EVENT_NAME}
* **Activity:** {EVENT_TYPE}
* **Location:** Infer from event name or city data.

**DETAILED CONTEXT DATA:**
{DETAILED_CONTEXT}

**INSTRUCTION:** Use the data above to ground the image in reality:
* **City:** Backgrounds must match the specific architecture/nature of the '{city}'.
* **Temperature:** If 'dayTemp' is high, show sun glare, sweat, sunglasses. If low, show clear crisp air.
* **Surface:** 'runningSurface'/'cyclingSurface' dictates the ground texture (Asphalt vs Dirt vs Grass).
* **Participants:** Use 'numberOfparticipants' to determine crowd density.

---

## 3. SCENE SELECTION
Generate the image based on this archetype:
**{SELECTED_ARCHETYPE}**

**ADAPTATION RULES:**
* **Running:** Group mid-stride, smiling, bib numbers visible (but unreadable text), running shoes.
* **Swimming:** Wet skin, splashes frozen in time, goggles, swim caps, bright water.
* **Cycling:** Sharp bikes, helmets, lycra kits, motion blur on wheels only.
* **Triathlon:** Dynamic transition or action.

---

## 4. HUMAN PRESENCE & ENERGY
* **Subject Count:** **Minimum 3 people**. Group shots are mandatory.
* **Expressions:** Genuine smiles, laughter, determination, focus. **NO SUFFERING.**
* **Vibe:** Camaraderie, friendship, shared achievement.
* **Diversity:** Natural mix of genders/ethnicities appropriate for the location.
* **Clothing:** Bright, colorful, professional athletic gear.

---

## 5. LIGHTING & COLOR
* **Lighting:** Bright Natural Daylight. Sun flares, backlighting, or high-key lighting allowed.
* **Colors:** Vivid, Saturated, Life-like. Pop the colors of the jerseys and nature.
* **Shadows:** Soft and natural. No dark, moody, or "gritty" shadows.

---

## 6. ABSOLUTE PROHIBITIONS
* NO TEXT, SIGNAGE, LOGOS, or WATERMARKS.
* NO distorted faces or hands.
* NO litter, trash, or dirty environments.
* NO sadness, injury, or exhaustion.
* NO solo subjects (must imply a race/event).

**OUTPUT INSTRUCTION:**
Write a highly detailed, **photorealistic prompt** describing camera lens, lighting, and textures. Output ONLY the raw prompt text.
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

// Robust context builder from your previous code
function buildDetailedContext(row: any): string {
  let contextLines: string[] = [];

  for (const field of CONTEXT_FIELDS) {
    // Check for both camelCase (from image) and snake_case (standard DB) keys
    const snakeField = field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    // Check space vs underscore for "Number of Participants"
    const lowerField = field.toLowerCase();
    
    // Value retrieval priority: Exact match -> Snake Case -> Lowercase
    const value = row[field] || row[snakeField] || row[lowerField] || row[field.replace(/ /g, '_')];

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
    console.error(`[Queue] Max recursion depth reached: ${recursionDepth}`);
    return new Response(JSON.stringify({ error: 'Max queue depth reached', recursionDepth }), { status: 500 });
  }

  // 2. Fetch ONE pending event (or failed that can be retried)
  // USING THE ROBUST LOGIC FROM YOUR PREVIOUS CODE
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
    console.log('[Queue] No pending tasks. Queue empty.');
    return new Response(JSON.stringify({ message: "No pending tasks.", recursionDepth }), { status: 200 });
  }

  const row = rows[0];
  const festivalName = row.festival_name || row.festivalName || "Unknown Event";
  
  // Logic to determine activity type (defaults to Running if not specified)
  const activityType = row.type || row.activity_type || "Running";
  
  const isRetry = row.task_status === 'failed';
  const currentRetryCount = row.retry_count || 0;

  console.log(`[Queue] Processing: ${festivalName} | Type: ${activityType} | ID: ${row.id}`);

  // 3. Mark as Processing & Set Start Time
  await supabase.from(TABLE_NAME).update({ 
    task_status: 'processing',
    generation_started_at: new Date().toISOString(),
    error_message: null,
    retry_count: isRetry ? currentRetryCount + 1 : currentRetryCount
  }).eq('id', row.id);

  try {
    // ------------------------------------------
    // STEP 0: CONTEXT & ARCHETYPE PREP
    // ------------------------------------------
    const detailedContext = buildDetailedContext(row);
    console.log(`[Queue] Context built: ${detailedContext.substring(0, 50)}...`);

    // Select a VIBRANT archetype
    const selectedArchetype = MOMENT_ARCHETYPES[Math.floor(Math.random() * MOMENT_ARCHETYPES.length)];
    console.log(`[Queue] Selected Archetype: "${selectedArchetype}"`);

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
        temperature: 0.75 // Slightly higher for creativity in "Vibrant" mode
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
    // STEP 6: SELF-INVOKE (QUEUE PROCESSING)
    // ------------------------------------------
    const { count } = await supabase
      .from(TABLE_NAME)
      .select('*', { count: 'exact', head: true })
      .eq('task_status', 'pending');

    console.log(`[Queue] Remaining pending tasks: ${count}`);

    if (count && count > 0 && recursionDepth < MAX_QUEUE_DEPTH) {
      console.log(`[Queue] Triggering next task (depth: ${recursionDepth + 1})`);
      fetch(`${URL}/functions/v1/generate-event-image`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SERVICE_ROLE}`,
          'x-recursion-depth': (recursionDepth + 1).toString()
        }
      }).catch(err => console.error('[Queue] Self-invocation failed:', err));
    } else if (count === 0) {
      console.log('[Queue] 🎉 All tasks completed!');
    }

    return new Response(JSON.stringify({ 
      success: true, 
      festival: festivalName,
      type: activityType,
      url: pUrl.publicUrl,
      remaining: count
    }), { headers: { "Content-Type": "application/json" } });

  } catch (err: any) {
    // ------------------------------------------
    // STEP 7: ROBUST ERROR HANDLING (From 444-line code)
    // ------------------------------------------
    console.error(`[Queue] ❌ Failed: ${festivalName}`, err);
    
    // Determine retry logic
    const newRetryCount = isRetry ? currentRetryCount + 1 : currentRetryCount + 1;
    const shouldRetry = newRetryCount < 3;
    
    // Update DB with appropriate status
    await supabase.from(TABLE_NAME).update({ 
      task_status: shouldRetry ? 'failed' : 'permanently_failed',
      retry_count: newRetryCount,
      error_message: shouldRetry 
        ? `Attempt ${newRetryCount}/3 failed: ${err.message}`
        : `Failed after 3 attempts: ${err.message}`
    }).eq('id', row.id);
    
    console.log(`[Queue] ${shouldRetry ? `Will retry (${newRetryCount}/3)` : 'Max retries reached - permanently failed'}`);

    // CONTINUE QUEUE even if this one failed
    const { count } = await supabase
      .from(TABLE_NAME)
      .select('*', { count: 'exact', head: true })
      .eq('task_status', 'pending');

    if (count && count > 0 && recursionDepth < MAX_QUEUE_DEPTH) {
      console.log(`[Queue] Continuing despite failure. Remaining: ${count}`);
      fetch(`${URL}/functions/v1/generate-event-image`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SERVICE_ROLE}`,
          'x-recursion-depth': (recursionDepth + 1).toString()
        }
      }).catch(err => console.error('[Queue] Self-invocation failed:', err));
    }

    return new Response(JSON.stringify({ error: err.message, retryCount: newRetryCount }), { status: 500 });
  }
});
