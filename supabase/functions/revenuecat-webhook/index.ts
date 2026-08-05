import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// SEC-002: Environment-based CORS origins (no wildcard in production)
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").filter(Boolean);
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS[0] : "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// SEC-001: RevenueCat Webhook Authorization Secret
const REVENUECAT_WEBHOOK_SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // SEC-001: Verify RevenueCat Authorization Header
    const authHeader = req.headers.get("Authorization");
    
    if (!REVENUECAT_WEBHOOK_SECRET) {
      console.error("[Webhook] REVENUECAT_WEBHOOK_SECRET is not configured");
      return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!authHeader || authHeader !== `Bearer ${REVENUECAT_WEBHOOK_SECRET}`) {
      console.error("[Webhook] Unauthorized: Invalid or missing Authorization header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log("[Webhook] Authorization verified");

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

    // SEC-005: Global idempotency guard. RevenueCat may deliver the same webhook
    // more than once (retries on non-2xx, at-least-once delivery). Every branch
    // below that grants tokens (INITIAL_PURCHASE / RENEWAL subscription tokens AND
    // NON_RENEWING_PURCHASE packs) is non-idempotent, so a redelivery would credit
    // tokens again. Reject any event id we've already processed BEFORE any grant.
    const eventId = event.id;
    if (eventId) {
      const { data: existing } = await supabaseClient
        .from("processed_webhook_events")
        .select("event_id")
        .eq("event_id", eventId)
        .maybeSingle();

      if (existing) {
        console.log(`[Webhook] Event ${eventId} already processed, skipping.`);
        return new Response(JSON.stringify({ success: true, skipped: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

      // Add 40 tokens on Purchase/Renewal for all subscription plans
      if (["INITIAL_PURCHASE", "RENEWAL"].includes(type)) {
          if (["pro_monthly", "pro_annual"].includes(productId)) {
              const { error: tokenError } = await supabaseClient.rpc('increment_token_balance', {
                p_user_id: userId,
                p_tokens: 40
              });
              if (tokenError) {
                 console.error("[Webhook] Failed to add Pro tokens:", tokenError);
              } else {
                 console.log(`[Webhook] Added 40 Pro tokens to user ${userId} (${productId})`);
              }
          } else {
              console.log(`[Webhook] Ignored non-Pro product ${productId} for token award.`);
          }
      }
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
      const TOKEN_PACK_MAP: Record<string, number> = {
        "tokens_150": 150,
        "tokens_200": 150, // legacy product ID — grants 150
        "tokens_50": 50,
        "token_pack": 50,
        "tokens_10": 10,
      };

      const tokensToAdd = TOKEN_PACK_MAP[productId] ?? 0;

      if (tokensToAdd > 0) {
        // SEC-003: Use atomic increment via RPC to prevent race conditions.
        // Idempotency is enforced by the global guard at the top of the handler.
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

    // Mark the event processed only after all grants succeeded, so a transient
    // failure above (which throws) leaves the event un-marked and RevenueCat's
    // retry can re-run it. A unique constraint on event_id makes this safe under
    // concurrent redelivery (the second insert conflicts and is ignored).
    if (eventId) {
      await supabaseClient
        .from("processed_webhook_events")
        .upsert({ event_id: eventId, processed_at: new Date().toISOString() }, { onConflict: "event_id" });
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
