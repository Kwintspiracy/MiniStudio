import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";

// SEC-002: Environment-based CORS origins (no wildcard in production)
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").filter(Boolean);
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS[0] : "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// SEC-001: RevenueCat Webhook Authorization Secret
const REVENUECAT_WEBHOOK_SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // SEC-001: Verify RevenueCat Authorization Header
    const authHeader = req.headers.get("Authorization");
    
    if (REVENUECAT_WEBHOOK_SECRET) {
      // If a secret is configured, verify it matches
      if (!authHeader || authHeader !== `Bearer ${REVENUECAT_WEBHOOK_SECRET}`) {
        console.error("[Webhook] Unauthorized: Invalid or missing Authorization header");
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log("[Webhook] Authorization verified");
    } else {
      // Warn if no secret is configured (should be set in production)
      console.warn("[Webhook] WARNING: REVENUECAT_WEBHOOK_SECRET not configured. Webhook is not secured!");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    console.log("[Webhook] RevenueCat event received:", body.event?.type);

    const { event } = body;
    if (!event) throw new Error("No event found in body");

    const userId = event.app_user_id;
    const type = event.type; // INITIAL_PURCHASE, RENEWAL, CANCELLATION, NON_RENEWING_PURCHASE
    const productId = event.product_id;
    const purchasedAtMs = event.purchased_at_ms;

    if (!userId) {
       console.log("[Webhook] No app_user_id, skipping. (Keep-alive ping?)");
       return new Response(JSON.stringify({ received: true }), {
         headers: { ...corsHeaders, "Content-Type": "application/json" },
       });
    }

    // 1. Handle Subscriptions (INITIAL_PURCHASE, RENEWAL, EXPIRATION, CANCELLATION)
    if (["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION"].includes(type)) {
      const { error } = await supabaseClient
        .from("user_entitlements")
        .upsert({
          user_id: userId,
          is_pro: true,
          subscription_status: 'active',
          updated_at: new Date(purchasedAtMs).toISOString(),
          revenue_cat_id: event.original_app_user_id
        }, { onConflict: "user_id" });

      if (error) throw error;
      console.log(`[Webhook] Updated user ${userId} to Pro (Active)`);
    }

    if (["EXPIRATION", "CANCELLATION", "PRODUCT_CHANGE"].includes(type)) {
       if (type === "EXPIRATION") {
          const { error } = await supabaseClient
            .from("user_entitlements")
            .update({
              is_pro: false,
              subscription_status: 'expired',
              updated_at: new Date().toISOString()
            })
            .eq("user_id", userId);
            
          if (error) throw error;
          console.log(`[Webhook] User ${userId} - Subscription Expired`);
       }
       
       if (type === "CANCELLATION") {
          const { error } = await supabaseClient
            .from("user_entitlements")
            .update({
              subscription_status: 'canceled_pending_expiration',
              updated_at: new Date().toISOString()
            })
            .eq("user_id", userId);
          if (error) console.error("[Webhook] Error updating cancellation status:", error);
       }
    }

    // 2. Handle Token Packs (NON_RENEWING_PURCHASE)
    if (type === "NON_RENEWING_PURCHASE") {
      // Determine token amount from Product ID
      let tokensToAdd = 0;
      if (productId.includes("tokens_200")) tokensToAdd = 200;
      if (productId.includes("tokens_50")) tokensToAdd = 50;
      if (productId.includes("token_pack")) tokensToAdd = 50;
      if (productId.includes("tokens_10")) tokensToAdd = 10;

      if (tokensToAdd > 0) {
        // SEC-003: Use atomic increment via RPC to prevent race conditions
        const { data, error } = await supabaseClient.rpc('increment_token_balance', {
          p_user_id: userId,
          p_tokens: tokensToAdd
        });

        if (error) {
          console.error("[Webhook] RPC increment_token_balance error:", error);
          throw error;
        }
        
        console.log(`[Webhook] Added ${tokensToAdd} tokens to user ${userId}. New Balance: ${data}`);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[Webhook] Error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
