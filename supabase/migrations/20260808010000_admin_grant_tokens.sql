-- ============================================================================
-- Octroi manuel de tokens depuis le poste d'administration
-- Date : 2026-08-08
--
-- Il n'existait aucun moyen de créditer un compte. Conséquences concrètes :
--
--   - le titulaire, à court de tokens, ne pouvait plus tester sa propre
--     application ; il a fallu une écriture manuelle en base pour le débloquer ;
--   - un client lésé — génération échouée, remboursement partiel, geste
--     commercial — n'avait aucune voie de compensation.
--
-- Pourquoi pas simplement faire créditer la simulation d'achat : `__DEV__` est
-- un drapeau du client. Un chemin de crédit qu'il commande est une fontaine à
-- tokens dès qu'on sait recompiler l'application, ou simplement modifier la
-- variable dans un bundle. L'octroi doit venir du serveur et être réservé à
-- l'administration, comme tout le reste du chemin de l'argent.
--
-- Bornes délibérées :
--   - 1 à 1000 tokens par appel. Au-delà, c'est une erreur de frappe plus
--     probablement qu'une intention ;
--   - une note obligatoire, parce qu'un crédit sans motif est indéfendable six
--     mois plus tard ;
--   - inscription au registre ET au journal d'audit. Le registre pour que le
--     solde reste réconciliable, le journal pour savoir QUI a crédité.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_grant_tokens(
  p_user_id uuid,
  p_amount  integer,
  p_note    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_new_balance int; v_email text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 1000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_amount',
      'message', 'Entre 1 et 1000 tokens par octroi.');
  END IF;

  IF p_note IS NULL OR btrim(p_note) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'note_required',
      'message', 'Indiquez le motif de l''octroi.');
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF v_email IS NULL AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  -- Passe par la fonction normale : le registre et l'idempotence par référence
  -- restent gérés au même endroit. La référence porte l'horodatage pour qu'un
  -- second octroi au même compte ne soit pas confondu avec le premier.
  v_new_balance := public.increment_token_balance(
    p_user_id, p_amount,
    'admin-grant-' || to_char(now(), 'YYYYMMDDHH24MISSMS'),
    'admin_grant');

  INSERT INTO public.admin_audit_log (actor, action, details)
  VALUES (auth.uid(), 'tokens_granted',
          jsonb_build_object('user_id', p_user_id, 'email', v_email,
                             'amount', p_amount, 'note', btrim(p_note),
                             'balance_after', v_new_balance));

  RETURN jsonb_build_object('success', true, 'amount', p_amount,
    'balance_after', v_new_balance);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_grant_tokens(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_tokens(uuid, integer, text) TO authenticated, service_role;

COMMIT;
