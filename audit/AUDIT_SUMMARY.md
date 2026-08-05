# MiniStudio — Synthèse d'audit

**Date :** 2026-08-05 · **Périmètre :** branche `payment` + état déployé du projet Supabase `gmbhkvpcebnwnzygcedi`
**Autorité retenue :** la production, corroborée par le dépôt. **19 findings** : 5 P0, 8 P1, 5 P2, 1 P3.

---

## Verdict

**MiniStudio est un produit techniquement abouti dont la sécurité repose sur du code qui n'a jamais été déployé.**

Le durcissement a bien été fait — révocation des RPC serveur, déplacement de la clé PoYo en schéma
privé, idempotence des webhooks, gardes `auth.uid()` sur les fonctions de crédit. Ces travaux sont
réels et vérifiés comme actifs en production. Mais trois défaillances majeures viennent toutes de la
même cause : **rien ne vérifie que ce qui tourne est ce qui est écrit.** Un correctif de sécurité
écrit le 1ᵉʳ mars n'a jamais été déployé. Une clé retirée du code n'a jamais été révoquée. Vingt-quatre
migrations vivent en production sans exister dans le dépôt.

Le calendrier joue en votre faveur : **un seul utilisateur réel, aucun achat jamais traité, 390
générations toutes issues du compte propriétaire.** Tout est corrigeable avant exposition. Cette
fenêtre se referme au lancement.

---

## Les cinq risques principaux, en clair

**1. Le webhook PoYo est ouvert à Internet.** `SEC-001` — La fonction déployée n'a *aucune*
authentification : ni contrôle d'en-tête, ni vérification de jeton. Une requête anonyme obtient 200
et atteint la base avec les droits `service_role`. Le code qui l'authentifie existe dans votre dépôt
depuis le 1ᵉʳ mars ; la fonction n'a pas été redéployée depuis le 30 janvier. Prouvé par exécution,
avec témoin négatif sur le webhook voisin qui, lui, répond 401.

**2. La clé `service_role` de la base partagée est en clair dans l'historique git de MiniPainterDB —
et elle fonctionne encore.** `CROSS-001` — Committée dans le commit initial, y compris comme clé du
client React Native, retirée depuis mais jamais révoquée. Validité prouvée sans jamais l'utiliser :
elle porte le même `iat` que la clé `anon` que la Management API rapporte active. Elle contourne
toute RLS : soldes, prompts, images, e-mails, données réelles de MiniPainterDB, et la clé API PoYo.
Valide jusqu'en 2035.

**3. Aucune modération de contenu, sur un service qui accepte des photos.** `SAFETY-001` — Recherche
exhaustive du dépôt : une seule correspondance, un commentaire sur une boucle. Pas de détection
CSAM, pas de filtrage des visages, pas de modération de prompt, pas de signalement, pas de
vérification d'âge, pas de procédure d'incident. C'est le seul risque de cet audit qu'un correctif
rétroactif ne répare pas.

**4. La réservation de crédits ne réserve rien — démontré en production.** `ECON-002` — Cinq appels
séquentiels sur un compte à **1 token** : **cinq réservations accordées**, la fonction retournant
elle-même `remaining_balance` de `0` à `−4`. Elle calcule le solde négatif, le renvoie au client, et
accorde quand même. En production, 0,45 $ de PoYo dépensés pour 0,09 $ de droits.

**5. Tokens gratuits illimités — démontré en production.** `ECON-003` — Le contrôle anti-farming
(`device_tokens`) ne s'applique qu'aux comptes **anonymes**. Un compte inscrit reçoit 10 tokens
chaque fois que sa ligne `user_entitlements` est absente, et **son device n'est jamais enregistré**.
Or `delete-account` supprime cette ligne en cascade. Quatre cycles supprimer/recréer testés :
**10 tokens à chaque fois**. `device_tokens` est vide depuis six mois malgré 390 générations — la
donnée le disait déjà.

*(Les points 4 et 5 se composent : un compte peut se recréer indéfiniment pour 10 tokens, puis
dépenser au-delà de ces 10 tokens sans jamais être refusé.)*

**Et une exposition de coût sans borne.** `COST-001` + `AI-003` — Aucun plafond de dépense, aucune
limite de débit pour les comptes authentifiés. **5 clés PoYo** en rotation × 5 req/min =
36 000 générations/jour × 0,090 $ = **~3 240 $/jour**. Aucune alerte : la première information serait
la facture. Et au coût réel relevé sur votre console, la configuration de production est **à marge
négative sur deux des trois offres** au taux de commission standard.

---

## Si vous ne faites que trois choses

1. **Tourner le secret JWT — mais dans le bon ordre.** Migrer les deux applications vers la clé
   *publishable* déjà provisionnée sur le projet, publier les builds, **puis** tourner. Une rotation
   immédiate invaliderait aussi la clé `anon` figée dans `app.json` et casserait toutes les
   installations. Puis tourner la clé PoYo, compromise par dérivation.
2. **Fermer le webhook PoYo — mais pas en redéployant le fichier du dépôt.** Il est *fail-closed*, et
   vos 379 générations aboutissent précisément parce que la version déployée n'exige rien. Établir
   d'abord si PoYo émet un en-tête d'authentification configurable. Sinon, un `callback_url` porteur
   d'un jeton par tâche. Un redéploiement naïf échangerait un P0 de sécurité contre une panne totale
   des générations, avec facturation PoYo maintenue.
3. **Mettre en place la détection CSAM avant le lancement public.** *Hash matching* sur l'upload,
   avant tout appel fournisseur, plus une procédure de signalement écrite. Ajouter un refus des
   photos de visages : cohérent avec la promesse produit — vous peignez des figurines — et cela
   supprime la classe de risque la plus lourde.

---

## Ce qui va bien, et qu'il faut préserver

Un audit qui ne relève que des défauts décrit mal son objet.

- **Les RPC de crédit sont correctement autorisées.** `reserve_generation`, `confirm_generation` et
  `release_generation` portent toutes une garde `auth.uid()` stricte, vérifiée sur les corps live.
- **La révocation de juillet est bien active.** `increment_token_balance`, `get_available_poyo_key`,
  `complete_poyo_job`, `authorize_generation` sont hors de portée des rôles clients — vérifié via
  `has_function_privilege`.
- **Le solde n'est pas modifiable par un client.** `user_entitlements` n'a aucune politique RLS
  d'écriture. C'est le bon design.
- **La clé PoYo est en schéma `private`**, inaccessible à `anon` comme à `authenticated`.
- **Les 11 RPC d'administration sont toutes gardées** par `is_admin()` — vérifiées une par une.
- **Aucun secret n'est récupérable de l'historique de MiniStudio** : 55 commits scannés
  intégralement, uniquement des lectures de variables d'environnement.
- **L'idempotence du webhook RevenueCat est correcte** : garde globale avant tout octroi, marquage
  après succès, index unique sur `event_id`.
- **La fidélité colorimétrique est réelle** : les valeurs `hex` sont bien transmises au modèle, pas
  seulement les noms.
- **Les index de base sont bien posés** : index partiel sur `status='reserved'`, index composites sur
  `(user_id, created_at)` et `(client_ip, created_at)`.
- **Une garde SSRF existe** sur les URL d'images sources, avec allowlist d'hôtes.

---

## Ce que cet audit n'a pas couvert

Énoncé sans atténuation.

- **`ECON-001` (course sous concurrence) n'est toujours pas prouvé, malgré le test exécuté.**
  Les 8 appels parallèles ont tous réussi, mais leurs `remaining_balance` forment une suite
  strictement décroissante `0 → −7` : c'est la signature d'une **exécution sérialisée**, pas d'une
  course. Plus important : **la course est expérimentalement inisolable tant qu'`ECON-002` existe**,
  puisque le résultat observable est identique avec ou sans verrou. Elle ne deviendra un défaut
  distinct qu'une fois la soustraction des réservations rétablie — raison pour laquelle le verrou
  doit être posé dans la **même migration**, sans attendre de preuve supplémentaire. Le finding reste
  `Likely` et son P0 est signalé comme tel.
- **Aucune mesure de performance n'a été réalisée.** Ni bundle, ni LCP, ni INP. `PERF-001` est
  `Likely`. Le **slider de couleur erratique** signalé n'a pas été diagnostiqué : il exige une mesure
  et l'écran de 1 834 lignes qui le contient n'a pas été lu.
- **Trois écrans majeurs restent non lus** : `app/(studio)/index.tsx` (1 834 l.),
  `app/paywall.tsx` (493 l.), `app/signin.tsx` (607 l.).
- **Aucune source externe n'a été consultée** : ni la documentation PoYo, ni les tarifs réels, ni une
  facture, ni App Store Connect, ni Play Console. Toute la Phase 5 (TVA, CGU, droit de rétractation)
  et l'analyse de marge en dépendent et restent ouvertes.
- **Le webhook RevenueCat n'a pas été rejoué** : il exige un secret que je n'ai pas et n'ai pas
  demandé.
- **Aucun test d'accessibilité** n'a été conduit.
- **Le dépôt MiniPainterDB n'a été inspecté que pour la frontière partagée** : sa sécurité propre
  n'est pas dans le périmètre.

**Couverture : 96 des 158 contrôles du Coverage Ledger.** Le détail, avec le motif de chaque
`BLOCKED`, est dans `AUDIT_COVERAGE.md`.

---

## Où lire la suite

| Fichier | Contenu |
|---|---|
| `AUDIT_FINDINGS.md` | Les 19 findings au format complet, avec preuves et falsifications |
| `AUDIT_FINDINGS.csv` | Table exploitable |
| `AUDIT_MONEY.md` | Carte de l'argent, marge par modèle, perte maximale sur 24 h |
| `AUDIT_SAFETY.md` | Modération, exposition juridique, propriété intellectuelle |
| `AUDIT_CROSS_APP.md` | Frontière MiniStudio ↔ MiniPainterDB, propagation de `LOGIC-001` |
| `AUDIT_COVERAGE.md` | Coverage Ledger + les quatre passes de clôture |
| `REMEDIATION_PLAN.md` | Trois vagues séquencées, avec dépendances |
| `EVOLUTION_ROADMAP.md` | Trajectoire produit et architecture |
| `PHASE0_INVENTORY.md` | Inventaire, cartes, hypothèses, questions ouvertes |
