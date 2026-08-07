-- ============================================================================
-- Le vocabulaire du registre, aligné sur ce que le code écrit réellement
-- Date : 2026-08-08
--
-- DÉFAUT GRAVE, introduit par mes migrations du 7 août et découvert par
-- accident en tentant un crédit de test.
--
-- `token_ledger.reason` porte une contrainte de valeurs :
--
--   signup_grant, purchase, generation, refund, admin, correction
--
-- Or le code écrit depuis le 7 août quatre raisons absentes de cette liste :
--
--   subscription_grant   revenuecat-webhook, à chaque INITIAL_PURCHASE et
--                        RENEWAL d'abonnement
--   refund_clawback      revoke_purchase_tokens, sur remboursement
--   refund_reversed      revenuecat-webhook, sur REFUND_REVERSED
--   debit_shortfall      debit_generation_tokens, quand le solde ne couvre pas
--
-- Chacune lève une violation de contrainte à l'exécution. La plus coûteuse est
-- la première : **le premier achat d'abonnement réel aurait échoué**.
-- `increment_token_balance` aurait levé, le webhook aurait renvoyé 400,
-- RevenueCat aurait réessayé et échoué autant de fois — et le client aurait été
-- débité sans recevoir un seul token. Aucun test ne l'a vu parce qu'aucun
-- abonnement n'a encore été vendu : le défaut n'existait que sur le chemin de
-- l'argent, celui qu'on ne parcourt jamais en développement.
--
-- La leçon, consignée ici parce qu'elle se répétera : ajouter une valeur à une
-- colonne contrainte n'échoue ni à la compilation, ni au déploiement, ni aux
-- tests — seulement le jour où le chemin s'exécute pour de vrai.
--
-- On énumère donc le vocabulaire complet, avec ce que chaque raison signifie et
-- qui l'écrit. `admin_grant` s'y ajoute : l'octroi manuel depuis le poste
-- d'administration, qui n'existait pas et dont l'absence bloquait tout test dès
-- le solde épuisé.
-- ============================================================================

BEGIN;

ALTER TABLE public.token_ledger DROP CONSTRAINT IF EXISTS token_ledger_reason_check;

ALTER TABLE public.token_ledger ADD CONSTRAINT token_ledger_reason_check
  CHECK (reason = ANY (ARRAY[
    -- Crédits
    'signup_grant'::text,        -- 10 tokens offerts, reserve_generation
    'purchase'::text,            -- pack de tokens, revenuecat-webhook
    'subscription_grant'::text,  -- versement d'abonnement, revenuecat-webhook
    'refund_reversed'::text,     -- remboursement annulé par le magasin
    'admin_grant'::text,         -- octroi manuel depuis l'administration
    -- Débits
    'generation'::text,          -- débit d'un rendu, debit_generation_tokens
    'refund_clawback'::text,     -- reprise après remboursement
    'refund'::text,              -- hérité, conservé pour les lignes anciennes
    -- Marqueurs à delta nul
    'debit_shortfall'::text,     -- le solde ne couvrait pas le débit
    -- Interventions
    'admin'::text,               -- hérité
    'correction'::text           -- réconciliation manuelle
  ]));

COMMENT ON COLUMN public.token_ledger.reason IS
  'Vocabulaire fermé, aligné sur ce que le code écrit. Toute nouvelle valeur '
  'DOIT être ajoutée à token_ledger_reason_check dans la même migration que le '
  'code qui l''écrit : une valeur manquante ne casse ni la compilation ni les '
  'tests, seulement l''exécution — et sur le chemin du paiement, cela veut dire '
  'un client débité sans contrepartie.';

COMMIT;

-- ============================================================================
-- VÉRIFICATION — exercer chaque raison écrite par le code, puis annuler.
-- À rejouer après toute modification du vocabulaire.
--
--   begin;
--     insert into public.token_ledger (user_id, delta, reason, source, balance_after)
--     select u.id, 0, r, 'purchased_balance', 0
--       from auth.users u,
--            unnest(array['signup_grant','purchase','subscription_grant',
--                         'refund_reversed','admin_grant','generation',
--                         'refund_clawback','debit_shortfall']) r
--      where u.email = 'quentinbeau@gmail.com';
--   rollback;
-- ============================================================================
