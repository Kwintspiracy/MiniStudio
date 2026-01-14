import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        global: {
          headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        },
      }
    );

    const body = await req.json();
    console.log("RevenueCat Webhook received:", JSON.stringify(body));

    const { event } = body;
    if (!event) throw new Error("No event found in body");

    const userId = event.app_user_id;
    const type = event.type; // INITIAL_PURCHASE, RENEWAL, CANCELLATION, NON_RENEWING_PURCHASE
    const productId = event.product_id;
    const purchasedAtMs = event.purchased_at_ms;

    if (!userId) {
       console.log("No app_user_id, skipping. (Keep-alive ping?)");
       return new Response(JSON.stringify({ received: true }), {
         headers: { ...corsHeaders, "Content-Type": "application/json" },
       });
    }

    // 1. Handle Subscriptions (INITIAL_PURCHASE, RENEWAL, EXPIRATION, CANCELLATION)
    if (["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION"].includes(type)) {
      // Check if it's a "Pro" product
      // Ideally, we check entitlement id, but RC webhook payload structure varies.
      // We assume if it's a subscription event, it's Pro for now, or check product ID mapping.
      
      const { error } = await supabaseClient
        .from("user_entitlements")
        .upsert({
          user_id: userId,
          is_pro: true,
          subscription_status: 'active',
          updated_at: new Date(purchasedAtMs).toISOString(),
          revenue_cat_id: event.original_app_user_id // or similar
        }, { onConflict: "user_id" });

      if (error) throw error;
      console.log(`Updated user ${userId} to Pro (Active)`);
    }

    if (["EXPIRATION", "CANCELLATION", "PRODUCT_CHANGE"].includes(type)) {
       // BE CAREFUL: "CANCELLATION" might mean "Turned off auto-renew" but still active until end of period.
       // RevenueCat sends "EXPIRATION" when it actually expires.
       // If type is EXPIRATION, revoke access.
       
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
          console.log(`User ${userId} - Subscription Expired`);
       }
       
       // Just update status text for others
       if (type === "CANCELLATION") {
         // This usually means "Voluntary Cancellation" (auto-renew off)
         // We do not revoke access yet.
         const { error } = await supabaseClient
            .from("user_entitlements")
            .update({
              subscription_status: 'canceled_pending_expiration',
              updated_at: new Date().toISOString()
            })
            .eq("user_id", userId);
          if (error) console.error("Error updating status:", error);
       }
    }

    // 2. Handle Token Packs (NON_RENEWING_PURCHASE)
    if (type === "NON_RENEWING_PURCHASE") {
      // Determine token amount from Product ID
      let tokensToAdd = 0;
      if (productId.includes("tokens_200")) tokensToAdd = 200;
      if (productId.includes("tokens_50")) tokensToAdd = 50; // Legacy / Fallback
      if (productId.includes("token_pack")) tokensToAdd = 50; // Legacy fallback
      
      // Dev helper for smaller packs if you ever make them
      if (productId.includes("tokens_10")) tokensToAdd = 10;

      if (tokensToAdd > 0) {
        // Use RPC to increment atomically (optional, but cleaner)
        // Or just read-update-write if we trust the single event stream.
        // Let's use a raw RPC call if we had one, but we don't.
        // We accept a tiny race condition risk or use a SQL function.
        // Let's try to do it via a custom RPC or just a direct update + increment.

        // Retrieve current balance first
        const { data: userLink, error: fetchError } = await supabaseClient
          .from("user_entitlements")
          .select("purchased_balance")
          .eq("user_id", userId)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') { // Ignore "not found"
            throw fetchError;
        }

        const currentBalance = userLink?.purchased_balance || 0;
        const newBalance = currentBalance + tokensToAdd;

        const { error } = await supabaseClient
          .from("user_entitlements")
          .upsert({
            user_id: userId,
            purchased_balance: newBalance,
            updated_at: new Date().toISOString()
          }, { onConflict: "user_id" });

        if (error) throw error;
        console.log(`Added ${tokensToAdd} tokens to user ${userId}. New Balance: ${newBalance}`);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Webhook error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
