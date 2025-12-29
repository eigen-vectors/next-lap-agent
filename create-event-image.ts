import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
 
// ==========================================
// CONFIGURATION
// ==========================================
const MISTRAL_MODEL = "mistral-large-latest";
const NANO_GEN_URL = "https://api.nanobananaapi.ai/api/v1/nanobanana/generate";
const NANO_STATUS_URL = "https://api.nanobananaapi.ai/api/v1/nanobanana/record-info";
const BUCKET_NAME = "event-images";
const TABLE_NAME = "event_images"; 
const MAX_QUEUE_DEPTH = 100;

// ==========================================
// SCENE DEFINITIONS (FOR RANDOMIZATION)
// ==========================================
const SCENE_VARIANTS = [
  "A runner adjusting gear",
  "A partially empty stretch of course implying an ongoing race",
  "An aid-station setup with no people present",
  "A volunteer or local person interacting naturally with the environment",
  "A runner seen from behind or at a distance, off-center",
  "A quiet, in-between moment between effort phases"
];
 
// ==========================================
// MASTER SYSTEM PROMPT
// ==========================================
const MASTER_SYSTEM_PROMPT = `
## REALISTIC EVENT IMAGE — MASTER PROMPT (STRICT API TEMPLATE)
### SYSTEM / IMAGE PROMPT
 
Generate **one single image** with **ZERO TEXT**.
 
The image must resemble a **real, unstaged photograph** taken during an actual running event.
It must **not** appear cinematic, illustrative, stylized, hyper-detailed, or AI-generated.
If the image appears *designed*, *epic*, *perfect*, or *dramatic*, it is invalid.
 
---
 
## 1. EVENT CONTEXT (INTERNAL VARIABLES ONLY)
* **Event name (internal reference only):** {EVENT_NAME}
* **Location / region:** Infer based on event name
* **Terrain type:** Infer based on event name
* **Climate / season:** Infer based on event name
 
These variables affect realism only. They must **never** appear as text or signage in the image.
 
---
 
## 2. SCENE SELECTION (MANDATORY ASSIGNMENT)
You must generate the image based on this specific selected moment:
 
**{SELECTED_SCENE}**
 
Do not deviate from this selected scene. Do not combine it with other tropes.
 
---
 
## 3. ENVIRONMENT RULES (REAL WORLD ONLY)
* Geography must match location accurately
* Natural clutter required: cracks, dust, leaves, uneven ground
* No exaggerated landscapes or fantasy scenery
 
---
 
## 4. HUMAN PRESENCE
* 0–3 people maximum
* Ordinary posture, natural fatigue, sweat, dirt allowed
* No posing, no direct eye contact
* Practical, mismatched clothing
 
---
 
## 5. LIGHTING — CRITICAL AI SUPPRESSION
* Natural daylight only (Overcast or flat light preferred)
* Soft, inconsistent shadows
* Minor exposure flaws acceptable
* STRICTLY PROHIBITED: Golden hour, Dramatic contrast, Stylized lighting
 
---
 
## 6. CAMERA BEHAVIOR (DOCUMENTARY)
* Single-camera realism (35mm or 50mm equivalent)
* Eye-level or casually offset angle
* Minor motion blur allowed
* PROHIBITED: Drone shots, Ultra-wide distortion, Telephoto compression
 
---
 
## 7. COLOR & TEXTURE DISCIPLINE
* Muted, location-appropriate colors
* No saturation boost, No HDR
* Light grain acceptable
* If the image looks *clean* or *polished*, it fails.
 
---
 
## 8. ABSOLUTE PROHIBITIONS
* NO TEXT of any kind
* NO race banners, arches, signage, flags, boards
* NO logos or readable branding
* NO symmetry
* NO cinematic fog, mist, god rays
 
---
 
## 9. SUCCESS CRITERION (ENFORCE)
The final image must resemble a candid photograph from a real race archive.
Ordinary. Imperfect. Believable. Real.
 
**OUTPUT INSTRUCTION:**
Based on the instructions above, write the final, high-fidelity prompt for the image generator. 
Do not output markdown. Do not output explanations. Output ONLY the raw prompt text.
`;
 
// ==========================================
// HELPERS
// ==========================================
function getCleanFilename(text: string): string {
  // Sanitize filename
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
 
// ==========================================
// MAIN SERVE HANDLER
// ==========================================
Deno.serve(async (req) => {
  // 1. Environment Variables - FIXED NAMES
  const URL = Deno.env.get('SUPABASE_URL')!; 
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const MISTRAL_KEY = Deno.env.get('IMAGE_PROMPT_GENERATION')!;
  const NANOBANANA_KEY = Deno.env.get('NANOBANANAAPI')!;
 
  // Initialize Client
  const supabase = createClient(URL, SERVICE_ROLE);
 
  // Get recursion depth from header (for queue tracking)
  const recursionDepth = parseInt(req.headers.get('x-recursion-depth') || '0');
  console.log(`[Queue] Processing request (depth: ${recursionDepth})`);
 
  // Safety: Prevent infinite loops
  if (recursionDepth >= MAX_QUEUE_DEPTH) {
    console.error(`[Queue] Max recursion depth reached: ${recursionDepth}`);
    return new Response(JSON.stringify({ 
      error: 'Max queue depth reached',
      recursionDepth 
    }), { status: 500 });
  }
 
  // 2. Fetch ONE pending event
  const { data: rows, error: dbError } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('task_status', 'pending')
    .limit(1);
 
  if (dbError) {
    return new Response(JSON.stringify({ error: dbError }), { status: 500 });
  }
 
  if (!rows || rows.length === 0) {
    console.log('[Queue] No pending tasks. Queue empty.');
    return new Response(JSON.stringify({ 
      message: "No pending tasks.",
      recursionDepth 
    }), { status: 200 });
  }
 
  const row = rows[0];
  const festivalName = row.festival_name; 
 
  console.log(`[Queue] Processing festival: ${festivalName} (ID: ${row.id})`);
 
  // 3. Mark as Processing & Set Start Time
  await supabase.from(TABLE_NAME).update({ 
    task_status: 'processing',
    generation_started_at: new Date().toISOString(),
    error_message: null
  }).eq('id', row.id);
 
  try {
    // ------------------------------------------
    // STEP 0: RANDOM SCENE SELECTION
    // ------------------------------------------
    // Randomly select one scene from the array
    const selectedScene = SCENE_VARIANTS[Math.floor(Math.random() * SCENE_VARIANTS.length)];
    console.log(`[Queue] Selected Scene: "${selectedScene}"`);

    // ------------------------------------------
    // STEP 1: MISTRAL PROMPT GENERATION
    // ------------------------------------------
    // Inject both Event Name and the Randomly Selected Scene
    let formattedPrompt = MASTER_SYSTEM_PROMPT.replace("{EVENT_NAME}", festivalName);
    formattedPrompt = formattedPrompt.replace("{SELECTED_SCENE}", selectedScene);
    
    const mistralResp = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${MISTRAL_KEY}`, 
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        messages: [{ role: "user", content: formattedPrompt }],
        temperature: 0.7
      })
    });
 
    if (!mistralResp.ok) throw new Error(`Mistral API Error: ${mistralResp.statusText}`);
    
    const mistralJson = await mistralResp.json();
    let promptText = mistralJson.choices[0].message.content.trim().replace(/^"|"$/g, '');
 
    // SAVE PROMPT TO DB
    await supabase.from(TABLE_NAME).update({ 
      generation_prompt: promptText 
    }).eq('id', row.id);
 
    // ------------------------------------------
    // STEP 2: NANOBANANA SUBMISSION
    // ------------------------------------------
    const nanoSubmit = await fetch(NANO_GEN_URL, {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${NANOBANANA_KEY}`, 
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({ 
        prompt: promptText, 
        type: "TEXTTOIAMGE", 
        numImages: 1 
      })
    });
 
    const nanoJson = await nanoSubmit.json();
    if (nanoJson.code !== 200) throw new Error(`Nanobanana Submit Failed: ${nanoJson.msg}`);
    const taskId = nanoJson.data.taskId;
 
    // ------------------------------------------
    // STEP 3: POLLING
    // ------------------------------------------
    let imageUrl = null;
    for (let i = 0; i < 6; i++) { 
      await delay(10000); // 10s wait
      const sResp = await fetch(`${NANO_STATUS_URL}?taskId=${taskId}`, {
        headers: { "Authorization": `Bearer ${NANOBANANA_KEY}` }
      });
      const sJson = await sResp.json();
      const data = sJson.data || {};
      
      if (data.status === 1 || data.successFlag === 1) {
        imageUrl = extractUrlSmartly(data);
        if (imageUrl) break;
      } else if (data.status === 2 || data.status === 3) {
        throw new Error("Nanobanana reported generation failure.");
      }
    }
 
    if (!imageUrl) throw new Error("Polling timed out.");
 
    // ------------------------------------------
    // STEP 4: UPLOAD TO STORAGE
    // ------------------------------------------
    const imgResp = await fetch(imageUrl);
    const imgBlob = await imgResp.blob();
    const cleanName = getCleanFilename(festivalName);
    const filePath = `events/${cleanName}/${Date.now()}.png`; 
 
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, imgBlob, { 
        contentType: 'image/png', 
        upsert: true 
      });
 
    if (uploadError) throw new Error(`Storage Upload Error: ${uploadError.message}`);
 
    const { data: pUrl } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);
 
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
    // STEP 6: CHECK FOR MORE PENDING & SELF-INVOKE
    // ------------------------------------------
    const { count } = await supabase
      .from(TABLE_NAME)
      .select('*', { count: 'exact', head: true })
      .eq('task_status', 'pending');
 
    console.log(`[Queue] Remaining pending tasks: ${count}`);
 
    // Self-invoke if more work exists and under recursion limit
    if (count && count > 0 && recursionDepth < MAX_QUEUE_DEPTH) {
      console.log(`[Queue] Triggering next task (depth: ${recursionDepth + 1})`);
      
      // Fire-and-forget self-invocation
      fetch(`${URL}/functions/v1/generate-event-image`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SERVICE_ROLE}`,
          'x-recursion-depth': (recursionDepth + 1).toString()
        }
      }).catch(err => {
        console.error('[Queue] Self-invocation failed:', err);
      });
    } else if (count === 0) {
      console.log('[Queue] 🎉 All tasks completed!');
    }
 
    return new Response(JSON.stringify({ 
      success: true, 
      festival: festivalName,
      scene: selectedScene,
      url: pUrl.publicUrl,
      remaining: count,
      recursionDepth
    }), {
        headers: { "Content-Type": "application/json" }
    });
 
  } catch (err: any) {
    // ------------------------------------------
    // STEP 7: ERROR HANDLING
    // ------------------------------------------
    console.error(`[Queue] ❌ Failed: ${festivalName}`, err);
    
    await supabase.from(TABLE_NAME).update({ 
      task_status: 'failed',
      error_message: err.message
    }).eq('id', row.id);
 
    // Still check for more tasks (don't block queue on single failure)
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
      }).catch(err => {
        console.error('[Queue] Self-invocation failed:', err);
      });
    }
 
    return new Response(JSON.stringify({ 
      error: err.message,
      festival: festivalName,
      recursionDepth
    }), { status: 500 });
  }
});
