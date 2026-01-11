import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 1. Authenticate User
        const supabaseClient = createClient(
            // Supabase API URL - Env var automatically injected
            Deno.env.get('SUPABASE_URL') ?? '',
            // Supabase Anon Key - Env var automatically injected
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            // Create client with Auth context execution
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        const authHeader = req.headers.get('Authorization');
        console.log(`[Edge] Incoming Auth Header: ${authHeader ? (authHeader.substring(0, 15) + '...') : 'MISSING'}`);

        const token = authHeader?.replace('Bearer ', '') ?? '';
        // console.log(`[Edge] Validating token: ${token.substring(0, 10)}...`);

        const {
            data: { user },
            error: authError
        } = await supabaseClient.auth.getUser(token)

        if (!user) {
            console.error(`[Edge] Unauthorized: ${authError?.message}`);
            return new Response(JSON.stringify({ error: `Unauthorized: ${authError?.message}` }), { status: 401, headers: corsHeaders })
        }

        // 2. Parse Request
        const { prompt, baseImage, model, action } = await req.json()

        console.log(`[Edge] Request received. Model: ${model || 'unknown'}, PromptLen: ${prompt?.length}, User: ${user.id}`);

        if (!prompt) {
            return new Response("Missing prompt", { status: 400, headers: corsHeaders })
        }

        // 3. User Entitlements (Simplified for Debugging)
        const costUnits = 1;

        // 4. API Key Check
        const apiKey = Deno.env.get('GOOGLE_API_KEY')
        if (!apiKey) {
            console.error("[Edge] API Key missing in environment variables");
            return new Response(JSON.stringify({ error: "Server Configuration Error: API Key missing" }), { status: 200, headers: corsHeaders })
        }

        const genAI = new GoogleGenerativeAI(apiKey);

        // --- UPDATED MODEL HANDLING ---
        // User provided docs confirm 'gemini-2.5-flash-image' and 'gemini-3-pro-image-preview' are valid.
        // We will respect the requested model string.
        const targetModel = model || 'gemini-2.5-flash-image';

        console.log(`[Edge] Using Model: ${targetModel}`);

        const aiModel = genAI.getGenerativeModel({
            model: targetModel,
            generationConfig: {
                // Explicitly set modalities if needed, though default usually works.
                // Docs say default is ['Text', 'Image'].
                // Removed responseMimeType: "application/json" as it is not supported by Nano Banana models
            }
        });

        // Construct parts
        const parts = []
        if (baseImage) {
            // baseImage is expected to be { mimeType: '...', data: 'base64...' }
            parts.push({ inlineData: { mimeType: baseImage.mimeType, data: baseImage.data } })
        }
        parts.push({ text: prompt })

        let result;
        try {
            // Generate logic
            result = await aiModel.generateContent({
                contents: [{ role: 'user', parts: parts }],
            });
        } catch (genError) {
            console.error("[Edge] Gemini API Error:", genError);
            const message = genError instanceof Error ? genError.message : String(genError);
            return new Response(JSON.stringify({ error: `Gemini API Error: ${message}` }), { status: 200, headers: corsHeaders });
        }

        const response = await result.response;
        console.log("[Edge] Gemini Response received.");

        // 5. Extract Output
        let generatedData = "";
        try {
            const candidateParts = response.candidates?.[0]?.content?.parts;
            if (candidateParts) {
                for (const part of candidateParts) {
                    // Check for inlineData (image)
                    if (part.inlineData && part.inlineData.data) {
                        generatedData = part.inlineData.data;
                        break;
                    }
                    // Check for text
                    if (part.text) {
                        generatedData += part.text;
                    }
                }
            }

            if (!generatedData) {
                try { generatedData = response.text(); } catch (_e) { /* Fallback attempt - ignore if text() fails */ }
            }
        } catch (parseError) {
            console.error("[Edge] Parsing Error:", parseError);
        }

        if (!generatedData) {
            console.error("[Edge] No content extracted from response:", JSON.stringify(response));
            return new Response(JSON.stringify({ error: "AI returned no content. (Model may have refused)" }), { status: 200, headers: corsHeaders });
        }

        // 6. Log Usage
        try {
            await supabaseClient
                .from('generation_logs')
                .insert({
                    user_id: user.id,
                    model_used: targetModel,
                    cost_units: costUnits,
                    action_type: action || 'generate'
                });
        } catch (logError) {
            console.error("[Edge] Logging Error:", logError);
        }

        return new Response(JSON.stringify({ output: generatedData }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        console.error("[Edge] Critical Uncaught Error:", error);
        const message = error instanceof Error ? error.message : "Internal Server Error";
        return new Response(JSON.stringify({ error: message }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
