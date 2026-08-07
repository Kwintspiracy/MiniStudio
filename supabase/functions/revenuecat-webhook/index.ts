import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// SEC-002: Environment-based CORS origins (no wildcard in production)
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").filter(Boolean);
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS[0] : "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// SEC-001: RevenueCat Webhook Authorization Secret
const REVENUECAT_WEBHOOK_SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");

// ============================================================================
// BAREMES DE TOKENS — source unique de verite
//
// Le versement, la reprise sur remboursement et la restitution apres annulation
// de remboursement lisent tous ces deux tables. Les avoir en double, c'est se
// garantir qu'une reprise finira par ne pas correspondre au versement qu'elle
// annule. Les libelles affiches (PaywallDrawer, paywall) doivent suivre.
//
// GRILLE, arretee le 2026-08-07. Cout fournisseur au pire — tout en Pro, soit
// 0,030 $ le token — et revenu net a 70,8 % (TVA 20 % puis commission Apple) :
//
//   Pack    14,99 $ /  100 tokens  →  0,150 $/token  →  marge 71,8 %
//   Mensuel  5,99 $ /   60 par mois →  0,0998 $/token →  marge 57,6 %
//   Annuel  53,88 $ /  720 d'un coup → 0,0748 $/token →  marge 43,4 %
//
// L'echelle est deliberement decroissante : plus l'engagement est long, moins
// le token coute. L'ancienne grille faisait l'inverse — le pack revenait a
// 0,090 $ le token contre 0,0998 $ pour le mensuel, ce qui rendait
// l'abonnement mensuel strictement dominé par le pack.
//
// L'annuel verse ses 720 tokens a l'achat plutot que 60 par mois : RENEWAL ne
// se declenche qu'une fois par an, et il n'y a pas de pg_cron sur ce projet
// pour recharger. Ce versement d'avance n'est tenable que parce que
// revoke_purchase_tokens existe : sans reprise sur remboursement, il suffirait
// de tout consommer puis de se faire rembourser par Apple.
// ============================================================================
const SUBSCRIPTION_TOKENS_BY_PRODUCT: Record<string, number> = {
  "pro_monthly": 60,
  "pro_annual": 720,
};

const TOKEN_PACK_MAP: Record<string, number> = {
  "tokens_100": 100,
  // Identifiants herites, conserves pour qu'un achat passe par un ancien
  // binaire ne reste pas sans versement. Rien n'est publie a ce jour, donc
  // aucun de ceux-la ne devrait plus apparaitre.
  "tokens_150": 150,
  "tokens_200": 200,
  "tokens_50": 50,
  "token_pack": 50,
  "tokens_10": 10,
};

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

    // Reference de la transaction du magasin. C'est elle qui relie un versement
    // de tokens a l'achat qui l'a produit, donc qui rend la reprise possible en
    // cas de remboursement. On retombe sur l'id d'evenement si le magasin n'en
    // fournit pas : mieux vaut une reference imparfaite qu'aucune.
    const txnRef: string | null =
      event.transaction_id || event.original_transaction_id || event.id || null;

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

      // Versement des tokens d'abonnement.
      //
      // L'annuel recevait 40 tokens comme le mensuel. Or RENEWAL ne se declenche
      // qu'une fois par an sur un abonnement annuel : l'abonne payait 53,88 $ et
      // recevait 40 tokens pour douze mois, alors que la fiche annonce
      // « 40 Tokens/mo ». Il en recoit maintenant les 480 promis, verses d'un
      // coup a l'achat et a chaque reconduction.
      //
      // Ce versement d'avance n'est tenable que parce que revoke_purchase_tokens
      // existe : sans reprise sur remboursement, il suffirait de tout consommer
      // puis de se faire rembourser par Apple.
      if (["INITIAL_PURCHASE", "RENEWAL"].includes(type)) {
          const tokens = SUBSCRIPTION_TOKENS_BY_PRODUCT[productId];
          if (tokens) {
              const { error: tokenError } = await supabaseClient.rpc('increment_token_balance', {
                p_user_id: userId,
                p_tokens: tokens,
                p_ref_text: txnRef,
                p_reason: 'subscription_grant',
              });
              if (tokenError) {
                 console.error("[Webhook] Failed to add Pro tokens:", tokenError);
                 throw tokenError;
              } else {
                 console.log(`[Webhook] Added ${tokens} Pro tokens to user ${userId} (${productId})`);
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
          // ECON-010 — distinguer une resiliation d'un remboursement.
          //
          // RevenueCat emet CANCELLATION dans les deux cas. Seul cancel_reason
          // les separe : CUSTOMER_SUPPORT signale un remboursement effectif
          // (Apple, Google, Amazon ou facturation web), les autres valeurs
          // — UNSUBSCRIBE, BILLING_ERROR, PRICE_INCREASE… — signalent une
          // resiliation ordinaire, ou l'abonne garde ce qu'il a paye.
          //
          // Confondre les deux couterait dans un sens comme dans l'autre :
          // reprendre sur une resiliation volerait un client honnete, ne pas
          // reprendre sur un remboursement paierait la note d'un abus.
          const cancelReason = event.cancel_reason || event.cancellation_reason;
          const isRefund = ["CUSTOMER_SUPPORT", "DEVELOPER_INITIATED"].includes(cancelReason);

          // CANCELLATION couvre aussi le remboursement d'un pack de tokens, qui
          // n'est pas un abonnement. Toucher aux champs d'abonnement dans ce cas
          // retirerait son statut Pro a un abonne qui s'est simplement fait
          // rembourser un achat ponctuel — il perdrait ce qu'il paie encore.
          const isSubscriptionProduct = productId in SUBSCRIPTION_TOKENS_BY_PRODUCT;

          if (isSubscriptionProduct) {
            const patch: Record<string, unknown> = {
              subscription_status: isRefund ? 'refunded' : 'canceled_pending_expiration',
              updated_at: new Date().toISOString(),
            };
            // Une resiliation ordinaire laisse l'acces actif jusqu'a l'echeance ;
            // seul EXPIRATION le coupera. Un remboursement le coupe tout de suite.
            if (isRefund) patch.is_pro = false;

            const { error } = await supabaseClient
              .from("user_entitlements").update(patch).eq("user_id", userId);
            if (error) console.error("[Webhook] Error updating cancellation status:", error);
          }

          if (isRefund && txnRef) {
             const { data: clawback, error: clawbackError } = await supabaseClient
               .rpc('revoke_purchase_tokens', { p_user_id: userId, p_ref_text: txnRef });
             if (clawbackError) {
                console.error("[Webhook] Clawback failed:", clawbackError);
                throw clawbackError;
             }
             // Le manquant est la mesure de ce que l'abus a reellement coute :
             // des tokens verses, consommes, et rembourses par-dessus.
             console.log(`[Webhook] Refund clawback for ${userId} (${txnRef}):`, clawback);
          } else if (isRefund) {
             console.error(`[Webhook] Refund for ${userId} but no transaction reference — tokens NOT revoked`);
          }
       }
    }

    // Un remboursement annule laisse l'abonne sans ses tokens : on les remet.
    // Evenement propre a l'App Store.
    if (type === "REFUND_REVERSED") {
      if (productId in SUBSCRIPTION_TOKENS_BY_PRODUCT) {
        const { error } = await supabaseClient
          .from("user_entitlements")
          .update({ is_pro: true, subscription_status: 'active', updated_at: new Date().toISOString() })
          .eq("user_id", userId);
        if (error) console.error("[Webhook] Error restoring reversed refund:", error);
      }

      const restored = SUBSCRIPTION_TOKENS_BY_PRODUCT[productId] ?? TOKEN_PACK_MAP[productId] ?? 0;
      if (restored > 0 && txnRef) {
        const { error: regrantError } = await supabaseClient.rpc('increment_token_balance', {
          p_user_id: userId,
          p_tokens: restored,
          // Reference distincte : l'idempotence par transaction refuserait
          // sinon le nouveau versement, la premiere ligne existant deja.
          p_ref_text: `${txnRef}:reversed`,
          p_reason: 'refund_reversed',
        });
        if (regrantError) {
          console.error("[Webhook] Failed to restore tokens after refund reversal:", regrantError);
          throw regrantError;
        }
        console.log(`[Webhook] Restored ${restored} tokens to ${userId} after refund reversal`);
      }
    }

    // 2. Handle Token Packs (NON_RENEWING_PURCHASE)
    if (type === "NON_RENEWING_PURCHASE") {
      const tokensToAdd = TOKEN_PACK_MAP[productId] ?? 0;

      if (tokensToAdd > 0) {
        // SEC-003: Use atomic increment via RPC to prevent race conditions.
        // Idempotency is enforced by the global guard at the top of the handler,
        // and now also per store transaction inside increment_token_balance.
        const { data, error } = await supabaseClient.rpc('increment_token_balance', {
          p_user_id: userId,
          p_tokens: tokensToAdd,
          p_ref_text: txnRef,
          p_reason: 'purchase',
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
