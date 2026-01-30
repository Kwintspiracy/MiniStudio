import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.21.0'

// SEC-002: Environment-based CORS origins (no wildcard in production)
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").filter(Boolean);
const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS[0] : '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper to fetch full paint inventory
// Replaced by Client-side injection to avoid conflicts and token usage
// async function fetchPaints(supabaseClient: any) { ... }



Deno.serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 1. Authenticate User
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        let isAborted = false;
        req.signal.addEventListener('abort', () => {
            isAborted = true;
        });

        const authHeader = req.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '') ?? '';
        
        const {
            data: { user },
            error: authError
        } = await supabaseClient.auth.getUser(token)

        if (!user) {
            return new Response(JSON.stringify({ error: `Unauthorized: ${authError?.message}` }), { status: 401, headers: corsHeaders })
        }

        // 2. Parse Request
        const { prompt, baseImage, model, action, useArtDirector } = await req.json()

        console.log(`[Edge] Request: Model=${model}, ArtDirector=${useArtDirector}, User=${user.id}`);

        if (!prompt) {
            return new Response("Missing prompt", { status: 400, headers: corsHeaders })
        }

        // 3a. Authorize Generation
        const { data: authData, error: authCheckError } = await supabaseClient.rpc('authorize_generation', {
            p_user_id: user.id,
            p_model: model || 'gemini-2.5-flash-image'
        });

        if (authCheckError) {
            console.error("[Edge] Auth RPC Error:", authCheckError);
            return new Response(JSON.stringify({ error: "System Error: Unable to verify limits." }), { status: 500, headers: corsHeaders });
        }

        if (authData && authData.allowed === false) {
             let errorMessage = "Limit Reached.";
             
             if (authData.message) {
                 errorMessage = `Limit Reached: ${authData.message}`;
             } else if (authData.usage !== undefined && authData.limit !== undefined) {
                 errorMessage = `Limit Reached. You have used ${authData.usage}/${authData.limit} ${authData.limit_type || 'generations'} this month.`;
             } else {
                 errorMessage = "Limit Reached. You have exhausted your daily free tokens or monthly quota.";
             }

             return new Response(JSON.stringify({ 
                 error: errorMessage
             }), { status: 403, headers: corsHeaders });
        }

        // 4. API Key Check
        const apiKey = Deno.env.get('GOOGLE_API_KEY')
        if (!apiKey) {
            return new Response(JSON.stringify({ error: "Server Configuration Error: API Key missing" }), { status: 200, headers: corsHeaders })
        }
        const genAI = new GoogleGenerativeAI(apiKey);

        const targetModel = model || 'gemini-2.5-flash-image';
        console.log(`[Edge] Executing Final Generation. Model: ${targetModel}`);
        
        const aiModel = genAI.getGenerativeModel({ model: targetModel });

        const parts = []
        if (baseImage) {
            parts.push({ inlineData: { mimeType: baseImage.mimeType, data: baseImage.data } })
        }
        parts.push({ text: prompt + "\n\nIMPORTANT: Return ONLY the generated image." })

        let result;
        try {
            result = await aiModel.generateContent({
                contents: [{ role: 'user', parts: parts }],
            });
        } catch (genError) {
            console.error("[Edge] Gemini API Error:", genError);
            const message = genError instanceof Error ? genError.message : String(genError);
            
            // Pass 503 status/Overloaded specifically to client
            if (message.includes("503") || message.includes("overloaded")) {
                 return new Response(JSON.stringify({ 
                     error: "Google Servers Overloaded", 
                     details: "The AI model is currently at capacity. Please try again in a moment.",
                     code: "OVERLOADED"
                 }), { status: 503, headers: corsHeaders });
            }

            return new Response(JSON.stringify({ error: `Gemini API Error: ${message}` }), { status: 200, headers: corsHeaders });
        }

        if (!result) {
             return new Response(JSON.stringify({ error: "Gemini API failed." }), { status: 200, headers: corsHeaders });
        }

        const response = await result.response;
        
        // 5. Extract Output
        let generatedData = "";
        try {
            const candidateParts = response.candidates?.[0]?.content?.parts;
            if (candidateParts) {
                for (const part of candidateParts) {
                    if (part.inlineData && part.inlineData.data) {
                        generatedData = part.inlineData.data;
                        break;
                    }
                    if (part.text) {
                        generatedData += part.text;
                    }
                }
            }
            if (!generatedData) {
                try { generatedData = response.text(); } catch (_e) { /* Ignore text parse error */ }
            }
        } catch (parseError) {
            console.error("[Edge] Parsing Error:", parseError);
        }

        if (!generatedData) {
            return new Response(JSON.stringify({ error: "AI returned no content." }), { status: 200, headers: corsHeaders });
        }

        // 6. Log Usage (Pro = 2 tokens, Basic/Flash = 1 token)
        if (!isAborted && !req.signal.aborted) {
            const isPro = targetModel.includes('pro') || targetModel.includes('2.5-flash-preview');
            const tokenCost = isPro ? 2 : 1;
            
            await supabaseClient.from('generation_logs').insert({
                user_id: user.id,
                model_used: targetModel,
                cost_units: tokenCost,
                action_type: action || 'generate'
            });
        }

        return new Response(JSON.stringify({ output: generatedData }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        console.error("[Edge] Critical Uncaught Error:", error);
        return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
