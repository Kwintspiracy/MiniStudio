# MiniStudio — Audit, Phase 0 : Inventaire et base de couverture

**Date d'exécution :** 2026-08-05
**Auditeur :** staff-level, sept spécialités (sécurité applicative, intégrité des revenus, fraude, pipeline IA, T&S/modération, performance, produit/UX)
**Périmètre :** branche `payment` de `D:\APPS\MiniStudio`, plus l'état déployé du projet Supabase `gmbhkvpcebnwnzygcedi`
**Statut :** Phase 0 terminée. Aucune conclusion d'audit n'est émise ici — ceci est une carte du terrain.

> **Règle de lecture.** Rien dans ce document n'est un *finding*. Les éléments marqués `PISTE` sont des hypothèses nées de l'inventaire, à falsifier en Phase 1+ selon la norme de preuve 2B. Les éléments marqués `FAIT (Classe C)` sont des observations de l'état déployé, vérifiées par requête sur la base live.

---

## 0. Bloc de contexte — complété et **corrigé**

Le bloc fourni contenait plusieurs faits périmés. Corrections établies par inspection directe, avec la source de la correction.

```
REPO PATH:              D:\APPS\MiniStudio                                    ✅ confirmé
REPO REMOTE:            https://github.com/Kwintspiracy/MiniStudio.git        ✅ confirmé
VISIBILITÉ REMOTE:      PUBLIC   ← confirmé par `gh repo view` (Classe C/D)
BRANCHE PAR DÉFAUT:     main     ← confirmé (`origin/HEAD -> origin/main`, gh defaultBranchRef)
FORKS:                  0
DERNIER PUSH REMOTE:    2026-03-04T15:45:44Z  ← le remote n'a PAS reçu les
                        durcissements de juillet/août. Le code public est
                        l'état PRÉ-durcissement.
SISTER REPO:            D:\APPS\MiniPainterDB (base Supabase partagée)         ⚠️ non inspecté en Phase 0
PLATFORM:               Windows / PowerShell                                   ✅ confirmé

*** LE PRODUIT VIT SUR `payment`. *** ✅ confirmé
  main    — dernier commit 2026-01-03 (e1b7c49), snapshot Expo obsolète.
  payment — dernier commit 2026-03-04 (b815ee5).
            ⚠️ MAIS le working tree local est très en avance sur ce commit
            (voir §0bis). L'audit doit porter sur le working tree, pas sur HEAD.

STACK (front) — CORRIGÉE :
  ❌ annoncé : Expo SDK 52 / React Native 0.76 / expo-router v4
  ✅ réel    : Expo ~54.0.31 / React Native 0.81.5 / expo-router ~6.0.21
               React 19.1.0 / NativeWind 4.1.23 / Tailwind 3.4 / TypeScript 5.9
               Source : package.json:21,40,45,48,46,58,64
  Cibles : iOS, Android, Web (react-native-web 0.21)

STACK (back):           Supabase Edge Functions (Deno) + RPC Postgres
                        (plpgsql, SECURITY DEFINER)
MIGRATIONS — CORRIGÉES :
  ❌ annoncé : 44 migrations
  ✅ réel    : 45 fichiers .sql suivis par git
             + 4 fichiers .sql NON SUIVIS (non commités)
             + 68 migrations appliquées sur la base live
             → 24 migrations live n'ont AUCUN fichier dans ce dépôt (§0ter)

DATABASE:               ref `gmbhkvpcebnwnzygcedi`, nom du projet : **"MiniPaintsDB"**
                        Postgres 17.6.1, région us-west-2, ACTIVE_HEALTHY
                        Partagée avec MiniPainterDB. ✅ confirmé
AUTH PROVIDER:          Supabase Auth (email, Google, Apple) + anonymes ✅
PAYMENT PROCESSOR:      RevenueCat ✅ (pro_monthly, pro_annual,
                        tokens_10/50/150/200, token_pack)
AI PROVIDERS — PRÉCISÉ :
  Provider actif en production : **poyo** (app_config.primary_provider='poyo')
  Modèle PoYo actif en production : **nano-banana-pro-edit**
  Fallback Google : **DÉSACTIVÉ** (app_config.fallback_enabled='false')
  ⚠️ Le modèle Google whitelisté côté edge est `gemini-3.1-flash-image-preview`,
     seul modèle du barème MODEL_COSTS, au coût fixe de 1 token.
JOB / QUEUE:            table `generation_jobs`, machine à états
                        reserve → confirm / release / complete_poyo_job ✅
EDGE FUNCTIONS — CORRIGÉES :
  ❌ annoncé : 4 fonctions (generate-miniature 776 LOC, poyo-webhook,
               revenuecat-webhook, send-feedback)
  ✅ réel déployé : 5 fonctions ACTIVE
     - generate-miniature   v49  verify_jwt=TRUE   (dépôt : 887 lignes)
     - revenuecat-webhook   v18  verify_jwt=false  (dépôt : 194 lignes)
     - poyo-webhook         v6   verify_jwt=false  (dépôt : 118 lignes)
     - delete-account       v11  verify_jwt=false  ← **AUCUNE SOURCE DANS LE DÉPÔT**
     - send-feedback : présente dans le dépôt, **NON DÉPLOYÉE**
ADMIN PORTAL:           app/admin/ dans la MÊME app Expo
                        app/admin/index.tsx = 1 557 lignes (+127 non commitées)
                        Restreint à Platform.OS === 'web' (app/admin/_layout.tsx:6)
```

---

## 0bis. ⚠️ Découverte structurante : le code existe en **trois états divergents**

C'est le fait le plus important de la Phase 0. Il conditionne la validité de toute conclusion ultérieure, et il faut le trancher avant la Phase 1.

| # | État | Contenu | Ce qu'il représente |
|---|---|---|---|
| **A** | `origin/payment` (GitHub, **public**) | commit `b815ee5`, 2026-03-04 | Le code **public**. Pré-durcissement. Ne contient aucune des mitigations de juillet/août. |
| **B** | Working tree local | A + 27 fichiers modifiés (+715/−216) + 4 migrations non suivies | Le travail de durcissement du **2026-07-14**, jamais commité. |
| **C** | Production (Supabase live) | 68 migrations, edge functions v49/v18/v11 | Ce qui tourne réellement. Contient B **et** une seconde campagne (2026-07-31 → 08-02) absente de A comme de B. |

**Conséquences immédiates :**

1. Auditer `HEAD` produirait un rapport faux — il décrirait des failles déjà corrigées en production.
2. Auditer le working tree produirait un rapport incomplet — il manquerait 24 migrations live.
3. **Le dépôt public expose la version vulnérable du raisonnement serveur.** Un lecteur du dépôt apprend l'architecture des crédits, les noms de RPC, les branches du webhook et les octrois gratuits — dans leur forme non durcie.

**Décision d'audit retenue :** l'autorité est **l'état C (production)**, corroborée par B pour le code client (que la prod ne peut pas fournir : le bundle mobile est chez les utilisateurs). Toute divergence A/B/C sera rapportée comme finding de dérive à part entière (§2B.7).

---

## 0ter. Dérive dépôt ↔ base : mesurée

68 migrations appliquées, 49 fichiers locaux. **24 migrations live sans fichier dans ce dépôt** :

| Version live | Nom | Origine probable |
|---|---|---|
| 20260312134659 | `add_delete_account_cascade` | MiniPainterDB |
| 20260629015642 | `poyo_model_config` | MiniStudio — correspond au fichier local `20260628000000` (**version différente**) |
| 20260629020328 | `poyo_model_full_whitelist` | MiniStudio — **aucun fichier local** |
| 20260629020912 | `poyo_log_model_used` | MiniStudio — correspond au local `20260629000000` (**version différente**) |
| 20260712134852 | `webhook_idempotency_unique` | MiniStudio — correspond au local `20260711000000` (**version différente**) |
| 20260713020309 | `revoke_server_only_rpcs` | MiniStudio — correspond au local `20260608000000` (**version différente**) |
| 20260731091802/091827 | `sec001_fix_admin_guards_part1/2` | MiniPainterDB |
| 20260731091911 | `sec001_revoke_anon_execute` | MiniPainterDB |
| 20260731092136 | `sec001_get_provider_config_revoke_only` | touche **MiniStudio** |
| 20260731094309 | `logic001_populate_product_type` | MiniPainterDB (LOGIC-001) |
| 20260731094406 | `logic001_category_aware_matching` | MiniPainterDB (LOGIC-001) |
| 20260731094631 | `data002_replaced_by_and_lineage` | MiniPainterDB |
| 20260731094900 | `logic001_duncan_classification` | MiniPainterDB |
| 20260731134812 | `data007_authz006_hygiene_and_config` | mixte |
| 20260731135109 | `perf006_full_columns_in_matching` | MiniPainterDB |
| 20260731144607 | `sec009_exclude_anonymous_sessions` | mixte |
| 20260801144602 | `a1_move_poyo_api_keys_to_private_schema` | **MiniStudio** (clé PoYo) |
| 20260801144610 | `a2_revoke_studio_credit_rpcs_from_anon` | **MiniStudio** (RPC crédits) |
| 20260801154153 | `wave9_matching_name_exclusion_and_type_scope` | MiniPainterDB |
| 20260802043918 | `wave10_find_matching_paints_batch` | MiniPainterDB |
| 20260802071848 | `wave11_covering_scope_for_highlights` | MiniPainterDB |
| 20260802095439 | `wave12_reclassify_auxiliary_products_as_technical` | MiniPainterDB |
| 20260802152839 | `exclude_discontinued_from_matches` | MiniPainterDB |

Un fichier local n'a jamais été appliqué : `supabase/migrations/fix_quentin_limit.sql` (sans horodatage, donc invisible pour la CLI Supabase).

`PISTE` — **La sécurité de MiniStudio est modifiée par le programme de remédiation d'une autre application** (`a1_`, `a2_`, `sec001_get_provider_config_revoke_only`), sans trace dans ce dépôt. C'est la frontière de confiance inter-applications, en action. À instruire en Phase 1.

---

## 1. Recensement des fichiers

Fichiers suivis par git sur `payment`, `node_modules`/`dist`/`build`/`.git` exclus.

| Type | Fichiers | Lignes |
|---|---:|---:|
| `.tsx` | 40 | 11 768 |
| `.ts` | 32 | 4 884 |
| `.sql` | 45 (+4 non suivis) | 5 566 |
| `.js` | 3 | 114 |
| `.md` | 19 | 4 933 |
| `.svg` | 24 | — |
| `.png` | 12 | — |
| `.json` | 12 | — |
| Autres | `.csv`, `.css`, `.ps1`, `.txt`, `.bak`, `.gitkeep`, `.gitignore`, `.lock`, 8 fichiers `supabase/.temp/` | — |

**Total code source (ts/tsx/sql/js) : 120 fichiers, 22 332 lignes.** L'annonce de « ~21 500 LOC » est donc juste.

### Les 20 plus gros fichiers

| Lignes | Fichier | Rôle |
|---:|---|---|
| 1 834 | `app/(studio)/index.tsx` | Écran principal — orchestre la génération |
| 1 557 | `app/admin/index.tsx` | Portail admin complet |
| 887 | `supabase/functions/generate-miniature/index.ts` | **Épine dorsale argent** |
| 701 | `src/context/AuthContext.tsx` | Session, anonymes, liaison de comptes |
| 607 | `app/signin.tsx` | Connexion |
| 557 | `supabase/migrations/20260225100000_security_hardening.sql` | |
| 529 | `src/components/PaywallDrawer.tsx` | |
| 520 | `src/services/geminiService.ts` | **Appelant client du pipeline** |
| 500 | `src/components/PaintExplorerModal.tsx` | Pont vers les peintures partagées |
| 493 | `app/paywall.tsx` | |
| 478 | `app/settings.tsx` | |
| 462 | `supabase/migrations/20260201000000_unified_token_pool.sql` | `authorize_generation` |
| 386 | `app/camera.tsx` | Capture — point d'entrée des uploads |
| 362 | `src/components/WelcomeOnboarding.tsx` | |
| 360 | `supabase/migrations/20260130100000_poyo_integration.sql` | |
| 359 | `src/components/Icons.tsx` | |
| 352 | `app/signup.tsx` | |
| 334 | `src/utils/paintFilter.ts` | |
| 294 | `supabase/migrations/20260201030000_device_persistent_tokens.sql` | Octroi gratuit |
| 290 | `src/services/promptService.ts` | |

### Fichiers non suivis, pertinents pour l'audit

- `supabase/migrations/20260608000000_revoke_server_only_rpcs.sql` (84 l.)
- `supabase/migrations/20260628000000_poyo_model_config.sql` (72 l.)
- `supabase/migrations/20260629000000_poyo_log_model_used.sql` (71 l.)
- `supabase/migrations/20260711000000_webhook_idempotency_unique.sql` (34 l.)
- `.agents/skills/auth-screens/*` (5 fichiers de documentation)
- `design-tokens/tokens.json`, `.codex/config.toml`
- `supabase/functions/generate-miniature/index.ts.bak` ← **fichier de sauvegarde commité** (hygiène)

---

## 2. Inventaire des dépendances

**Directes :** 46 (44 prod, 4 dev). **Arbre total : 912 paquets** (847 prod, 40 dev, 23 optionnels).

### `npm audit` — 30 vulnérabilités

| Sévérité | Nombre |
|---|---:|
| Critique | **2** |
| Haute | **10** |
| Modérée | 17 |
| Basse | 1 |

**Critiques :** `shell-quote` (échappement + DoS quadratique), `tar` (traversée de chemin par hardlink/symlink, smuggling de fichiers, DoS).
**Hautes :** `@xmldom/xmldom`, `brace-expansion`, `fast-uri`, `js-yaml`, `node-forge`, `picomatch`, `postcss`, `svgo`, `undici`, `ws`.

`PISTE` — Toutes ces vulnérabilités sont, à première lecture, **transitives via la chaîne d'outillage Expo/Metro** (build-time), pas dans le bundle expédié. `npm audit` ne fait pas cette distinction. **Il faudra vérifier fichier par fichier lesquelles atteignent le bundle runtime avant d'assigner une sévérité.** Une vulnérabilité build-time sur un poste de développeur unique n'a pas la même portée qu'une vulnérabilité expédiée à des utilisateurs.

**Directes vulnérables :** `@babel/core` (basse), `expo`, `expo-auth-session`, `expo-constants`, `expo-dev-client`, `expo-linking`, `expo-router` (modérées). Le correctif proposé par npm est `expo@57` — **saut de version majeure**, à traiter comme un chantier, pas un patch.

**Scripts d'installation dans l'arbre :** 1 seul (`fsevents`, macOS, attendu). Aucun `postinstall` inattendu.

**Aucun paquet installé depuis une URL git, un fork, ou un registre inhabituel.** Aucun nom suspect de typosquat détecté à la lecture de la liste directe.

**Lockfile :** `package-lock.json` présent et suivi. **Aucune CI ne l'utilise** (§ ci-dessous).

---

## 3. Carte des routes / écrans

16 routes `expo-router`. Le gardiennage est fait dans `AuthContext` : `app/index.tsx:20-21` redirige inconditionnellement vers `/(studio)` en s'appuyant sur « AuthContext garantit une session réelle **ou anonyme** ».

| Route | Fichier | Auth requise | Notes |
|---|---|---|---|
| `/` | `app/index.tsx` | aucune | Splash → redirige vers `/(studio)` |
| `/(studio)` | `app/(studio)/index.tsx` | session (y c. **anonyme**) | Écran de génération. **Dépense des tokens.** |
| `/camera` | `app/camera.tsx` | session | **Point d'entrée des uploads utilisateur** |
| `/paywall` | `app/paywall.tsx` | session | Achat |
| `/settings` | `app/settings.tsx` | session | |
| `/signin` | `app/signin.tsx` | publique | |
| `/signup` | `app/signup.tsx` | publique | |
| `/update-password` | `app/update-password.tsx` | jeton de reset | |
| `/reset-callback` | `app/reset-callback.tsx` | publique | Callback deep-link |
| `/auth-callback` | `app/auth-callback.tsx` | publique | Callback OAuth |
| `/google-auth` | `app/google-auth.tsx` | publique | |
| `/api-key` | `app/api-key.tsx` | ? | **Vestige « bring your own key »** — 192 lignes toujours présentes alors que `app/index.tsx:12` documente la suppression de ce flux. À instruire. |
| `/admin` | `app/admin/index.tsx` | **rôle admin** | Voir §9 |

`PISTE` — `/admin` n'est gardé, dans `app/admin/_layout.tsx`, que par `Platform.OS !== 'web'` (lignes 6-12). **Aucun contrôle d'authentification dans le layout.** Le gardiennage doit donc être dans `index.tsx` ou côté serveur seulement. À vérifier en Phase 2, avec appel direct des RPC admin sous un jeton utilisateur normal.

---

## 4. Carte de la surface API

### 4.1 Edge Functions (**FAIT — Classe C**, `list_edge_functions`)

| Slug | v | `verify_jwt` | Auth applicative | Validation d'entrée | **Coûte de l'argent ?** |
|---|---:|---|---|---|---|
| `generate-miniature` | 49 | **true** | `auth.getUser(token)` (l. 571) + garde anonyme (l. 600-630) | longueur prompt ≤ 15 000, `userText` ≤ 1 000, whitelist modèle, clamp température, garde SSRF sur `baseImageUrl` | **OUI — appelle PoYo** |
| `revenuecat-webhook` | 18 | false | `Authorization !== "Bearer " + SECRET` (l. 30), comparaison **non temps-constant** | aucune sur le corps | **OUI — crédite des tokens** |
| `poyo-webhook` | 6 | false | idem (l. 44) | `task_id` requis ; `files[0].file_url` **stocké sans validation** (l. 83) | **OUI — débite des tokens** |
| `delete-account` | 11 | false | `auth.getUser()` + re-vérification du mot de passe pour comptes `email` | corps optionnel | Non (mais **détruit** des tokens) |
| `send-feedback` | — | — | — | — | **NON DÉPLOYÉE** (existe seulement dans le dépôt) |

### 4.2 RPC Postgres (**FAIT — Classe C**, `has_function_privilege` sur la base live)

40 fonctions dans `public`, **toutes `SECURITY DEFINER`**. Droits `EXECUTE` réellement en vigueur :

**Serveur uniquement — `anon`=✗, `authenticated`=✗, `service_role`=✓** (la migration `revoke_server_only_rpcs` **est bien appliquée**, ce qui corrobore la mémoire projet) :
`authorize_generation`, `check_provider_health`, `complete_poyo_job`, `get_available_poyo_key`, `get_job_status`, `increment_token_balance`, `record_provider_failure`, `refill_tier_tokens`, `reset_tier_tokens`

**Appelables par `authenticated` (donc aussi par les utilisateurs anonymes Supabase, qui portent ce rôle)** :
`reserve_generation` (**3 surcharges live**), `confirm_generation` (**4 surcharges live**), `release_generation`, `get_usage_stats`, `get_monthly_usage`, `get_monthly_flash_usage`, `get_provider_config`, `admin_update_provider_config`, `get_admin_*` (6 fonctions), `admin_delete_paint`, `admin_import_paints`, `admin_update_paint`

**Appelables par `anon`** : `complete_onboarding`, `find_duplicate_paints`, `find_matching_paints`, `find_matching_paints_batch`, `get_brand_stats`, `get_duplicate_by_color`, `get_duplicate_by_name`, `get_user_status`, `handle_new_user`, `is_admin`

`PISTE` — **Les surcharges sont un angle mort.** `reserve_generation` existe en 3 signatures live et `confirm_generation` en 4. Toutes sont appelables par `authenticated`. Rien ne garantit que les anciennes surcharges portent les mêmes contrôles que la plus récente. **Chaque surcharge doit être extraite et lue individuellement** en Phase 4 — lire la plus récente ne prouve rien sur les autres.

`PISTE` — `admin_import_paints`, `admin_update_paint`, `admin_delete_paint` (fonctions **MiniPainterDB**) sont exécutables par tout compte `authenticated` de **MiniStudio**. La protection est censée être interne à la fonction. À tester par exécution en Phase 1.

### 4.3 Récepteurs de webhooks

| Récepteur | Émetteur | Authentification | Idempotence |
|---|---|---|---|
| `revenuecat-webhook` | RevenueCat | secret Bearer statique | **oui** — garde globale `processed_webhook_events` avant tout octroi (l. 62-81), marquage après (l. 176-180) |
| `poyo-webhook` | PoYo.ai | secret Bearer statique | **aucune garde visible** — `complete_poyo_job` s'appuie sur `status='reserved'` + `FOR UPDATE` |

---

## 5. 💰 CARTE DE L'ARGENT (artefact critique)

### 5.1 Où vit le solde

Table **`public.user_entitlements`** (RLS activée). Colonnes de solde :
`purchased_balance`, `tier_tokens`, `daily_tokens`, `weekly_tokens`, `monthly_tokens`, `is_unlimited`, `custom_basic_limit`, `custom_premium_limit`

**Politiques RLS live (Classe C, `pg_policies`) :**
- `SELECT` : `auth.uid() = user_id` — lecture de sa propre ligne uniquement
- **Aucune politique `INSERT`/`UPDATE`/`DELETE` pour `authenticated` ou `anon`**
- `service_role` : pas de politique `ALL` sur cette table (contourne la RLS de toute façon)

→ **Le solde n'est pas modifiable directement par un client.** Toute mutation passe par une RPC `SECURITY DEFINER`. C'est le bon design. Le risque se déplace entièrement **dans** ces RPC.

⚠️ **Il n'existe aucun registre append-only (ledger).** `generation_logs` enregistre les *dépenses* réussies, jamais les *octrois*. Il est donc **impossible en l'état de reconstituer un solde** ou de prouver `somme(mouvements) == solde`. À qualifier en Phase 4.

### 5.2 Flux SORTANT (l'utilisateur dépense)

```
[CLIENT — hostile par hypothèse]
app/(studio)/index.tsx
  └─ generatePaintedMiniature(baseImages, prompt, n, temperature, metadata, userText)
       src/services/geminiService.ts:173-511
       ├─ récupère device_id :
       │    iOS     → Application.getIosIdForVendorAsync()   (geminiService.ts:229)
       │    Android → Application.getAndroidId()             (geminiService.ts:230)
       │    Web     → Math.random() persisté en AsyncStorage (geminiService.ts:236)
       │    ⚠️ dans les 3 cas, c'est un simple paramètre POST, donc falsifiable
       └─ POST {supabaseUrl}/functions/v1/generate-miniature
            body: { prompt, baseImage|baseImageUrl, action, temperature,
                    device_id, metadata, userText }
▼ ─────────── FRONTIÈRE DE CONFIANCE ───────────
[EDGE — generate-miniature v49, verify_jwt=true]
  1. auth.getUser(token)                                     l.571
  2. détection anonyme (is_anonymous || email @anon. || ni email ni tel)  l.600-602
  3. si anonyme :
       a. get_user_status() → si purchased_balance>0 → 403   l.611-618
       b. limite IP : COUNT(generation_logs WHERE client_ip=? AND created_at>H-1)
          ≥ ANON_IP_HOURLY_LIMIT (défaut 5) → 429            l.480-508, 622-629
          ⚠️ échec ouvert sur erreur DB (l.499-503)
          ⚠️ ne s'applique QU'AUX anonymes
  4. validations : prompt ≤15000, userText ≤1000, modèle ∈ MODEL_COSTS,
     température clampée [0,2], SSRF sur baseImageUrl (hôte ∈ allowlist)  l.642-676
  5. tokenCost = MODEL_COSTS[targetModel]   → **TOUJOURS 1**  l.681
▼
[DB — reserve_generation(p_user_id, p_cost, p_device_id, p_metadata)]
     définition LIVE extraite (Classe C, pg_get_functiondef)
  a. contrôle strict : auth.uid() = p_user_id sinon 'unauthorized'
  b. si AUCUNE ligne user_entitlements :
       - anonyme + device_id fourni :
           device déjà vu  → crée entitlement à 0, renvoie 'device_already_used'
           device inconnu  → **crée entitlement purchased_balance = 10**
                             + INSERT device_tokens(device_id, 10, user_id)
       - sinon (utilisateur NON anonyme, ou device_id NULL) :
           → **crée entitlement purchased_balance = 10, SANS aucun contrôle device**
  c. v_auth_result := authorize_generation(p_user_id, p_cost)
  d. v_active_reservations := SUM(cost_units) des jobs status='reserved'
     ⚠️ calculé APRÈS la décision d'autorisation
  e. INSERT generation_jobs(status='reserved', consumption_source=v_source)
  f. renvoie remaining_balance = remaining_total − v_active_reservations − p_cost
     ⚠️ v_active_reservations n'intervient QUE dans cette valeur d'affichage
  ❌ AUCUN `FOR UPDATE`, AUCUN verrou, dans tout le corps de la fonction
▼
[EDGE — branche PoYo, l.747-812]  (branche active en prod)
  - get_available_poyo_key()  [client service_role]
  - uploadToPoyo(base64) OU réutilisation directe d'une URL CDN validée
  - submitPoyoTask(model=nano-banana-pro-edit, callback_url=.../poyo-webhook)
  - UPDATE generation_jobs SET poyo_task_id, provider_used='poyo', model_used
  - renvoie {job_id, status:'processing'} — **AUCUN DÉBIT À CE STADE**
▼ ─────────── FRONTIÈRE : PoYo.ai (tiers) ───────────
[poyo-webhook v6, verify_jwt=false]
  - vérifie Authorization === "Bearer " + POYO_WEBHOOK_SECRET  (non temps-constant)
  - imageUrl = payload.data.files[0].file_url   ← **valeur attaquant-contrôlée si le secret fuit**
  - complete_poyo_job(task_id, status, image_url, error)
▼
[DB — complete_poyo_job]  (fichier local 20260629000000 ; **à extraire du live**)
  SELECT ... WHERE poyo_task_id=? AND status='reserved' FOR UPDATE   ← verrou présent ici
  succès  → UPDATE user_entitlements SET tier_tokens|purchased_balance −= cost_units
            UPDATE generation_jobs → 'completed'
            INSERT generation_logs (user_id, model_used, cost, prompt, tokens)
  échec   → UPDATE generation_jobs → 'failed'   (rien à rembourser : rien n'a été débité)
▼
[CLIENT] Realtime sur generation_jobs (filtre id=eq.job_id) + poll 10 s après 30 s
         + timeout 5 min + reprise via AsyncStorage (`pending_generation_job`)
```

**Le débit est donc POSTÉRIEUR au succès** (« deduct on success »). La réservation n'est qu'une écriture de suivi.

`PISTE` majeure — **la réservation ne semble rien réserver.** Si `authorize_generation` ignore les réservations en cours (ce que la lecture de la définition live suggère) et qu'aucun verrou n'existe, alors N appels concurrents pour un utilisateur à 1 token peuvent tous passer l'autorisation, créer N jobs, et **soumettre N tâches payantes à PoYo** — le débit n'intervenant qu'ensuite, et pouvant faire passer le solde en négatif. **C'est simultanément le vecteur de perte de revenu (ECON-001/002) et le vecteur d'explosion de coût.** À prouver ou réfuter par un harnais de concurrence exécuté (Classe B) en Phase 4. Non affirmé ici.

### 5.3 Flux ENTRANT (l'utilisateur est crédité) — « suivre l'argent à rebours »

| # | Chemin | Déclencheur | Montant | Contrôles |
|---|---|---|---|---|
| **E1** | `reserve_generation`, branche device | 1ʳᵉ génération d'un anonyme sur un device inconnu | **+10** dans `purchased_balance` | `device_tokens.device_id` unique ? à vérifier |
| **E2** | `reserve_generation`, branche fallback | utilisateur **non anonyme** sans ligne `user_entitlements`, **ou** `device_id` NULL | **+10** dans `purchased_balance` | **aucun** |
| **E3** | `increment_token_balance` via `revenuecat-webhook` | `INITIAL_PURCHASE`/`RENEWAL` sur `pro_monthly`/`pro_annual` | **+40** | garde d'idempotence globale (l. 62-81) |
| **E4** | `increment_token_balance` via `revenuecat-webhook` | `NON_RENEWING_PURCHASE` | `TOKEN_PACK_MAP` : 150/150/50/50/10 | idem E3 |
| **E5** | `refill_tier_tokens` / `reset_tier_tokens` | cron ? | ? | `service_role` uniquement. **Aucun cron trouvé** — à vérifier |
| **E6** | Admin | ? | ? | **Aucune RPC admin de crédit détectée dans les 40 fonctions live.** À confirmer en Phase 2 |

`PISTE` — **E2 est le chemin à instruire en priorité.** Il octroie 10 tokens à tout compte dépourvu de ligne `user_entitlements`, sans le moindre contrôle de device. Or `delete-account` supprime `user_entitlements` en cascade (commentaire l. « profiles, user_paints, user_entitlements, generation_jobs, generation_logs, device_tokens »). Un cycle *supprimer son compte → recréer* semble donc reconstituer la ligne… et redéclencher E2. **À prouver par exécution en Phase 4, pas à affirmer.**

`PISTE` — **Les tokens gratuits atterrissent dans `purchased_balance`**, pas dans `tier_tokens`. Gratuit et payé deviennent indiscernables dans le solde. Cela rend impossible toute politique différenciée (expiration, remboursement, priorité de consommation) et brouille toute réconciliation comptable future.

### 5.4 Ce que coûte chaque appel

| Élément | Valeur |
|---|---|
| Prix facturé à l'utilisateur | **1 token, invariablement** (`MODEL_COSTS`, edge l. 56-58) |
| Modèle réellement appelé en prod | **`nano-banana-pro-edit`** (`app_config.poyo_model`, live) |
| Modèles sélectionnables par l'admin | 18 slugs (`nano-banana-2/pro`, `seedream-4/4.5`, `flux-kontext-pro/max`, `gpt-image-2`, `wan-2.7-image`, `z-image`, et variantes `-edit`) |
| Coût PoYo par modèle | **INCONNU — Classe E requise** (tarifs poyo.ai) |
| Marge par génération | **NON CALCULABLE en Phase 0** |

`PISTE` — Le barème de prix côté utilisateur est **plat** ; le coût côté fournisseur est **variable et pilotable depuis le portail admin**. Un changement de `poyo_model` depuis le dashboard modifie la marge sans modifier le prix. **Un chemin à marge négative est possible sans qu'aucun garde-fou n'existe.** Table modèle → prix facturé → coût réel → marge à produire en Phase 6 (`AUDIT_MONEY.md`).

### 5.5 Plafonds et garde-fous existants — inventaire

| Garde-fou | État |
|---|---|
| Limite IP horaire | **anonymes uniquement**, 5/h, échec ouvert |
| Limite par utilisateur authentifié | **AUCUNE** en dehors du solde |
| Plafond de dépense global (jour/mois) | **AUCUN** |
| Plafond de concurrence par utilisateur | **AUCUN** |
| Plafond de concurrence global | **AUCUN** |
| Disjoncteur fournisseur | présent (`provider_health`, seuil 5, cooldown 600 s) — protège de la panne, **pas de la dépense** |
| Rotation de clés PoYo | `get_available_poyo_key` (5 req/min/clé) |
| Politique de retry | pas de boucle de retry côté edge ; fallback Google **désactivé en prod** |
| Anti double-soumission | **aucune déduplication de requête détectée** côté serveur |
| Télémétrie de coût | tokens Google enregistrés (`input_tokens`/`output_tokens`) ; **coût PoYo en euros : non enregistré** |
| Alerting dépense | **AUCUN détecté** |

---

## 6. Trace du pipeline de génération, bout en bout

| # | Étape | Implémentation | Existe ? |
|---:|---|---|---|
| 1 | Soumission utilisateur | `app/(studio)/index.tsx` → `generatePaintedMiniature()` | ✅ |
| 2 | Assemblage du prompt | `src/utils/promptGenerator.ts`, `src/services/promptService.ts`, templates en base (`prompt_configs`, 50 lignes) | ✅ |
| 3 | Assainissement client | `src/utils/promptSanitizer.ts`, `src/utils/sanitization.ts` | ✅ (à lire en Phase 7) |
| 4 | **Modération de l'image uploadée** | — | ❌ **AUCUNE TROUVÉE EN PHASE 0** |
| 5 | **Modération du texte du prompt** | — | ❌ **AUCUNE TROUVÉE EN PHASE 0** |
| 6 | Validation serveur | `generate-miniature` l. 642-676 | ✅ (longueur/modèle/température/SSRF uniquement) |
| 7 | Contrôle de solde | `reserve_generation` → `authorize_generation` | ✅ (correction contestée, cf. §5.2) |
| 8 | Débit | `complete_poyo_job` (PoYo) / `confirm_generation` (Google) | ✅ **après succès** |
| 9 | Appel PoYo | `uploadToPoyo` + `submitPoyoTask` | ✅ |
| 10 | Stockage `task_id` | `UPDATE generation_jobs SET poyo_task_id` l. 266-269 | ✅ |
| 11 | Callback | `poyo-webhook` → `complete_poyo_job` | ✅ |
| 12 | Stockage du résultat | `generation_jobs.result_image_url` = **URL CDN PoYo brute** | ✅ ⚠️ pas de stockage propre |
| 13 | Notification utilisateur | Realtime + poll 10 s + timeout 5 min + reprise AsyncStorage | ✅ |
| 14 | **Modération de la sortie** | — | ❌ **AUCUNE TROUVÉE** |
| 15 | Chemin d'échec / remboursement | `release_generation` (edge) ; PoYo échoué → job `failed`, pas de débit | ✅ partiel |
| 16 | **Réconciliation des jobs orphelins** | — | ❌ **AUCUN JOB CRON TROUVÉ**. 0 job `reserved` en base actuellement, donc pas d'orphelin observé à ce jour |

`PISTE` — Les résultats sont servis depuis **le CDN de PoYo** (`cdn.doculator.org` d'après l'allowlist SSRF), pas depuis un stockage maîtrisé. Aucun bucket Supabase Storage n'apparaît dans le pipeline. Conséquences à instruire : rétention hors de votre contrôle, URLs devinables ?, expiration ?, suppression sur demande utilisateur impossible ?

---

## 7. Carte du modèle de données (**FAIT — Classe C**)

11 tables dans `public` + 1 dans `private`. RLS **activée sur les 12**.

| Table | Lignes | Propriétaire | Colonne d'appartenance | Accès client réel (RLS live) |
|---|---:|---|---|---|
| `paints` | 2 956 | **MiniPainterDB** | — | `SELECT` **public, `USING (true)`** ; écritures `is_admin()` |
| `user_paints` | 53 | **MiniPainterDB** | `user_id` | CRUD complet sur sa ligne |
| `prompt_configs` | 50 | **MiniStudio** | — | `SELECT` par tout `authenticated` si `is_active` ; écritures admin |
| `user_entitlements` | **1** | **MiniStudio** | `user_id` | `SELECT` propre ligne **seulement** |
| `generation_jobs` | 390 | **MiniStudio** | `user_id` | `SELECT` propre ligne seulement |
| `generation_logs` | 379 | **MiniStudio** | `user_id` | `SELECT` propre ligne **+ `INSERT` propre ligne** |
| `device_tokens` | **0** | **MiniStudio** | `user_id` | `SELECT` propre ligne seulement (INSERT/UPDATE supprimés) |
| `app_config` | 8 | **partagée** | — | `SELECT` restreint aux clés `limit_free_monthly`, `limit_free_total` |
| `provider_health` | 2 | **MiniStudio** | — | `service_role` uniquement |
| `processed_webhook_events` | **0** | **MiniStudio** | — | RLS activée, **aucune politique** → aucun accès client |
| `profiles` | 21 | **partagée** | `id` | `SELECT` propre ligne |
| `private.poyo_api_keys` | ? | **MiniStudio** | — | **aucun `SELECT` pour `anon` ni `authenticated`** ✅ |

`PISTE` — `generation_logs` accepte des `INSERT` client (`WITH CHECK auth.uid() = user_id`). Or **`client_ip` n'est contraint par rien**, et c'est précisément la colonne sur laquelle repose la limite de débit des anonymes (edge l. 493-497). Deux conséquences à tester : pollution des analytics/prompt history de l'admin, et possibilité d'épuiser le quota d'une IP tierce. À instruire en Phase 3/4.

### État réel des données — cadrage indispensable

| Mesure | Valeur |
|---|---:|
| Comptes `auth.users` | **21** (dont **10 anonymes**) |
| Lignes `user_entitlements` | **1** |
| Utilisateurs distincts ayant généré | **1** (`6643672b-…`) |
| Jobs, période | **390**, du 2026-03-17 au 2026-08-02 |
| Statuts | 379 `completed`, 11 `failed`, **0 `reserved`** |
| `consumption_source` | `'purchased_balance'` sur **100 %** des jobs |
| Événements webhook traités | **0** |
| Comptes admin (`profiles.role='admin'`) | **1** |

**Lecture :** MiniStudio est, à la date de l'audit, **pré-lancement de fait**. Toutes les générations proviennent du compte propriétaire. Aucun achat n'a jamais été traité. Cela ne diminue en rien la gravité des failles — cela signifie que **la fenêtre pour corriger avant exposition est encore ouverte**, et que la remédiation peut être séquencée sans gestion d'incident.

`PISTE` — `complete_poyo_job` compare `consumption_source` à `'tier_tokens'` et `'unlimited'`, sinon débite `purchased_balance`. La valeur réellement écrite est `'purchased_balance'`, qui tombe dans le `ELSE`. **Le comportement est correct par accident** : une chaîne non prévue tombe silencieusement dans la branche « débiter le solde acheté ». À vérifier sur toutes les branches (`confirm_generation`, `release_generation`) en Phase 4.

---

## 8. Carte des frontières de confiance

```
┌──────────────────────────────────────────────────────────────────┐
│ CLIENT — bundle Expo (iOS / Android / Web). HOSTILE PAR HYPOTHÈSE│
│  • clé anon Supabase (app.json:78) — publiable par conception    │
│  • clés SDK RevenueCat (src/constants.ts) — publiables           │
│  • device_id : ID vendeur iOS / ID Android / random web          │
│  • portail admin : MÊME BUNDLE, MÊME ORIGINE, MÊME SESSION       │
└────────────┬─────────────────────────────────────────────────────┘
             │ ① JWT Supabase (Bearer)
             ▼
┌──────────────────────────────────────────────────────────────────┐
│ EDGE FUNCTIONS (Deno, Supabase)                                  │
│  generate-miniature : verify_jwt=true, PUIS client service_role  │
│    ⚠️ les deux clients coexistent dans le même handler :         │
│       supabaseClient (portée utilisateur, RLS)                   │
│       supabaseAdminClient (service_role, contourne la RLS)       │
│  Secrets : SERVICE_ROLE_KEY, GOOGLE_API_KEY,                     │
│            POYO_WEBHOOK_SECRET, REVENUECAT_WEBHOOK_SECRET,       │
│            APPLE_PRIVATE_KEY (delete-account)                    │
└────────────┬───────────────────────────┬─────────────────────────┘
             │ ② RPC SECURITY DEFINER    │ ③ HTTPS + Bearer
             ▼                           ▼
┌──────────────────────────┐   ┌────────────────────────────────────┐
│ POSTGRES (PARTAGÉ)       │   │ TIERS                              │
│  MiniStudio ∪ MiniPainterDB│  │  PoYo.ai  — reçoit prompt + PHOTO  │
│  RLS + 40 RPC SECDEF     │   │  Google   — idem (fallback, off)   │
│  private.poyo_api_keys   │   │  RevenueCat                        │
└──────────────────────────┘   │  Apple / Google (revoke)           │
             ▲                 └───────────┬────────────────────────┘
             │ ⑤ service_role              │ ④ callback non authentifié
             │                             │    au niveau passerelle
             └───── poyo-webhook ◄─────────┘    (verify_jwt=false)
                    revenuecat-webhook           secret Bearer statique
```

**Points de franchissement à instruire :**

| # | Franchissement | Ce qui est en jeu |
|---|---|---|
| ① | Client → Edge | `device_id`, `metadata`, `prompt`, `userText`, image : **tous d'origine client** |
| ② | Edge → DB | l'edge dispose de `service_role` : **toute RLS y est inopérante** |
| ③ | Edge → PoYo | **la photo de l'utilisateur quitte votre infrastructure** ; rétention chez PoYo inconnue |
| ④ | PoYo → Edge | endpoint public ; seule barrière : un secret statique comparé non-temps-constant |
| ⑤ | Webhook → DB | `service_role` : écrit directement sur les soldes |
| ⑥ | **MiniPainterDB ↔ MiniStudio** | **une seule base, un seul rôle `authenticated`, une seule identité utilisateur** |

`PISTE` ⑥ — `delete-account` est manifestement une fonction **MiniPainterDB** (origines autorisées : `https://minipainterdb.app`, `http://localhost:8081` ; `APPLE_CLIENT_ID` = `com.kwintspiracy.MiniPainterDB`) **qui supprime les données MiniStudio** (`user_entitlements`, `generation_jobs`, `generation_logs`, `device_tokens`). L'origine de MiniStudio n'est pas dans l'allowlist. À instruire en Phase 1 : qui est responsable de traitement, que se passe-t-il pour un utilisateur MiniStudio web, et l'effacement redéclenche-t-il l'octroi gratuit E2 ?

---

## 9. Surface admin

**Localisation :** `app/admin/index.tsx` (1 557 lignes suivies + 127 non commitées), `src/components/admin/PromptTester.tsx` (223 l.), `src/services/adminService.ts` (138 l.).

**Livré dans le même bundle, sur la même origine, sous la même session que l'application utilisateur.** Seule restriction de couche routage : `Platform.OS === 'web'` (`app/admin/_layout.tsx:6-12`).

**Garde client :** `isAdminUser()` (`adminService.ts:39-44`) lit `session.user.app_metadata.role === 'admin'`.
⚠️ `adminService.ts:40` : `if (__DEV__) return true;` — **court-circuit inconditionnel en développement**. Sans effet sur les builds de production, mais rend tout test de sécurité en dev structurellement aveugle.

| Capacité admin | RPC / accès | Contrôle serveur constaté |
|---|---|---|
| Statistiques du tableau de bord | `get_admin_dashboard_stats` | `authenticated` ; garde interne à vérifier |
| Liste des utilisateurs (emails) | `get_admin_users_list` | idem |
| Top styles / outils | `get_admin_top_styles`, `get_admin_top_tools` | idem |
| Consommation de tokens | `get_admin_token_usage` | idem |
| **Historique des prompts utilisateurs** | `get_admin_prompt_history` | idem — **expose le contenu produit par les utilisateurs** |
| **Bascule de fournisseur et de modèle** | `admin_update_provider_config` | garde `auth.jwt()->app_metadata->>role='admin'` **présente dans la définition** |
| Lire/écrire/supprimer les prompts | table `prompt_configs` en direct | RLS `app_metadata.role='admin'` ✅ |
| Peintures (app sœur) | `admin_import_paints`, `admin_update_paint`, `admin_delete_paint` | `authenticated` ; garde interne à vérifier |

**Capacités NON trouvées en Phase 0 :** aucune RPC permettant à un admin de **créditer un solde**, d'**éditer un solde**, ou de **rembourser**. Aucun **journal d'audit** des actions admin. Aucune **MFA** ni **restriction IP**. À confirmer par énumération exhaustive en Phase 2 — l'absence en Phase 0 n'est pas une preuve d'absence.

`PISTE` — Le rôle admin est un **drapeau dans la session utilisateur normale**, sur la même origine. C'est exactement la forme architecturale que le §6 du cahier des charges qualifie de P0. À confirmer (est-ce bien la même session ? y a-t-il un second facteur ?) avant d'assigner une sévérité.

---

## 10. Chemin critique de démarrage (ordre d'exécution)

| Ordre | Élément | Coût (non mesuré) |
|---:|---|---|
| 1 | `GestureHandlerRootView` → `SafeAreaProvider` | faible |
| 2 | **`AuthProvider`** (`AuthContext.tsx`, 701 l.) — restaure la session, **crée une session anonyme si absente** | ⚠️ réseau bloquant |
| 3 | **`EntitlementsProvider`** — récupère le solde | ⚠️ réseau |
| 4 | `ImageProvider` | faible |
| 5 | `RootLayoutNav` → `useEffect` → `Purchases.configure()` (natif uniquement) | réseau, non bloquant |
| 6 | `app/index.tsx` — spinner jusqu'à `loading === false`, puis `router.replace('/(studio)')` | dépend de 2 |
| 7 | `app/(studio)/index.tsx` (1 834 l.) — écran principal | **le plus gros module** |

⚠️ **`Purchases.configure()` est appelé à deux endroits** : `app/_layout.tsx:78-80` et `purchaseService.init()` (`purchaseService.ts:60-66`, avec garde `isConfigured`). La garde existe ; l'ordonnancement reste à vérifier.

⚠️ **Le portail admin (1 557 lignes) n'est pas chargé paresseusement.** `app/admin` est déclaré dans le `Stack` racine (`app/_layout.tsx:126`). À mesurer : est-il présent dans le bundle initial des utilisateurs ?

**Aucune mesure de performance n'a été effectuée en Phase 0.** Le « slider de couleur erratique » et les « temps de chargement lents » signalés ne peuvent être diagnostiqués que par mesure (Phase 9).

---

## 11. Surface non testée

```
Fichiers de test dans le dépôt : 0
Répertoires __tests__          : 0
Dépendance de test (jest, vitest, detox, playwright…) : AUCUNE
Workflows CI (.github/workflows) : AUCUN
Environnement de préproduction / branche Supabase : AUCUN détecté
```

**La couverture de test est nulle sur 22 332 lignes**, y compris :
- `reserve_generation` / `authorize_generation` / `confirm_generation` / `release_generation` / `complete_poyo_job` — **toute la machine à crédits**
- `revenuecat-webhook` — **tout l'encaissement**
- `poyo-webhook` — **tout le débit**
- `generate-miniature` — **toute la dépense fournisseur**

⚠️ **L'absence d'environnement de non-production est elle-même un obstacle d'audit.** La norme 2B.4 exige des tests exécutés contre un environnement non productif pour les courses, l'autorisation, l'idempotence et l'abus. Aucun n'existe. Deux options en Phase 1 : créer une **branche Supabase** dédiée (fonction MCP `create_branch`, **coûte de l'argent — nécessite votre accord explicite**), ou marquer les vérifications concernées `BLOCKED`. **C'est la première décision que j'attends de vous.**

---

## 12. Hypothèses posées

1. **L'autorité est la production** (`gmbhkvpcebnwnzygcedi`), pas `HEAD`, pas `origin`. Le working tree fait autorité pour le code client uniquement.
2. Le projet Supabase listé, nommé « MiniPaintsDB », est bien **la seule et même base** des deux applications. Un seul projet est visible via MCP.
3. Les utilisateurs anonymes Supabase portent le rôle Postgres `authenticated`, pas `anon`. **Toute conclusion « anon ne peut pas » ne les couvre donc pas.**
4. Les clés `supabaseAnonKey` et RevenueCat SDK sont **publiables par conception** ; leur exposition n'est un risque que dans la mesure où la RLS et les droits `EXECUTE` sont corrects.
5. `MODEL_COSTS` ne contenant qu'un modèle Google, le coût côté utilisateur est **invariablement de 1 token**, quel que soit le modèle PoYo réellement appelé.
6. `cdn.doculator.org` (allowlist SSRF) est le CDN de PoYo. **À confirmer.**
7. Les migrations `logic001_*`/`wave*` appliquées le 2026-07-31/08-02 proviennent du programme de remédiation **MiniPainterDB**. À confirmer depuis le dépôt sœur.
8. Le compte `6643672b-…`, auteur des 390 jobs, est le propriétaire.
9. La mémoire projet du 2026-07-14 est un **indice**, pas une preuve. Chacune de ses affirmations est re-vérifiée (deux l'ont déjà été : révocation des RPC ✅, edge v49/v18 ✅).

---

## 13. Questions ouvertes — réponses nécessaires pour avancer

### Bloquantes (la Phase 1 ne peut pas être complète sans)

| # | Question | Pourquoi c'est bloquant |
|---|---|---|
| **Q1** | **M'autorisez-vous à créer une branche Supabase de test (payante) ?** | Sans elle, toutes les vérifications de Classe B — course au double-débit, matrice RLS, rejeu de webhook, farming de tokens — sont `BLOCKED`. Cela plafonne mécaniquement la confiance de la majorité des findings ECON/BILL/AUTHZ à `Likely`. |
| **Q2** | **M'autorisez-vous des écritures de test en production** (compte jetable, montants nuls, nettoyage documenté) si Q1 est refusée ? | Alternative dégradée à Q1. Avec 1 seul utilisateur réel, le risque est faible mais **la décision vous appartient**. |
| **Q3** | Puis-je lire le dépôt `D:\APPS\MiniPainterDB` ? | La §5 (frontière inter-applications) est inauditable autrement. |

### Structurantes

| # | Question |
|---|---|
| Q4 | **Le dépôt public doit-il le rester ?** Il expose la version pré-durcissement du raisonnement serveur. |
| Q5 | **D'où vient `delete-account` ?** Aucune source dans ce dépôt, dernier déploiement il y a 3 jours. Existe-t-elle dans MiniPainterDB ? |
| Q6 | Le **cron** de `refill_tier_tokens`/`reset_tier_tokens` existe-t-il ? Aucun n'apparaît côté base. |
| Q7 | Les **tarifs PoYo.ai par modèle** — avez-vous une facture réelle ? Sans elle, la table de marge est incalculable (Classe D/E indispensable). |
| Q8 | Les **SKU `tokens_200` et `tokens_150`** sont-ils actifs sur App Store Connect / Play Console, et que promettent-ils ? `TOKEN_PACK_MAP` fait correspondre `tokens_200` → 150 tokens. |
| Q9 | **PoYo transmet-il réellement un en-tête `Authorization` configurable** sur ses callbacks ? Si non, `poyo-webhook` rejette *tous* les callbacks légitimes — ce qui inverserait complètement la gravité. **0 événement webhook enregistré à ce jour**, ce qui ne tranche pas (la table ne concerne que RevenueCat), mais 379 jobs `completed` suggèrent que les callbacks passent. À confirmer par les logs. |
| Q10 | `send-feedback` existe dans le dépôt mais **n'est pas déployée**. Intentionnel ? |
| Q11 | `app/api-key.tsx` (192 l.) — vestige « bring your own key ». Route morte ou encore atteignable ? |

---

## 14. Coverage Ledger v0

Toutes les cases des §5 à 13 du cahier des charges, y compris 5B. **Statut initial : `PENDING` pour toutes.**
158 contrôles. `V1`/`V2` seront renseignés avec classe de preuve et citation exacte.

> Rappel de la règle : une ligne avec **une seule** cellule de preuve remplie vaut `BLOCKED`, jamais `COVERED`.

### §5 — Base partagée, frontière inter-applications (10)

| ID | Contrôle | Statut | V1 | V2 |
|---|---|---|---|---|
| 5.01 | Rayon d'impact d'une compromission croisée | PENDING | | |
| 5.02 | Rôles et clés de base distincts par app | PENDING | | |
| 5.03 | Clé `service_role` absente des bundles clients (2 apps, 2 historiques) | PENDING | | |
| 5.04 | RLS traversante : session MiniStudio → tables MiniPainterDB et inverse | PENDING | | |
| 5.05 | Tables de solde non modifiables hors chemin serveur | PENDING | | |
| 5.06 | Couplage de schéma et process de migration | PENDING | | |
| 5.07 | Identité utilisateur partagée et autorité de dépense | PENDING | | |
| 5.08 | Propagation de `LOGIC-001` vers la sortie générée | PENDING | | |
| 5.09 | PII partagée, responsable de traitement RGPD, effacement croisé | PENDING | | |
| 5.10 | Sauvegarde/restauration : rollback simultané des deux apps | PENDING | | |

### §5B — Dépôt, historique des secrets, chaîne d'approvisionnement (22)

| ID | Contrôle | Statut | V1 | V2 |
|---|---|---|---|---|
| 5B.01 | Dépôt public ou privé | PENDING | | |
| 5B.02 | Dépôt sœur public ou privé | PENDING | | |
| 5B.03 | Historique de visibilité | PENDING | | |
| 5B.04 | Forks et historiques retenus | PENDING | | |
| 5B.05 | Scan de l'historique complet (gitleaks/trufflehog, toutes branches/tags) | PENDING | | |
| 5B.06 | Recherche ciblée : clé PoYo, secrets RevenueCat, `service_role`, JWT secret | PENDING | | |
| 5B.07 | `.env*` jamais commités (historique, pas HEAD) | PENDING | | |
| 5B.08 | `.gitignore` suffisant pour ce stack | PENDING | | |
| 5B.09 | Liste de rotation des secrets exposés | PENDING | | |
| 5B.10 | Secret scanning / push protection actifs | PENDING | | |
| 5B.11 | Inventaire des workflows GitHub Actions | PENDING | | |
| 5B.12 | Usage de `pull_request_target` | PENDING | | |
| 5B.13 | Actions tierces épinglées à un SHA | PENDING | | |
| 5B.14 | Logs de workflow n'exposant pas de secrets | PENDING | | |
| 5B.15 | Portée des identifiants de déploiement | PENDING | | |
| 5B.16 | Permissions `GITHUB_TOKEN` restreintes | PENDING | | |
| 5B.17 | Protection de branche sur `main` | PENDING | | |
| 5B.18 | Dependabot activé, alertes traitées | PENDING | | |
| 5B.19 | Lockfile commité et honoré en CI (`npm ci`) | PENDING | | |
| 5B.20 | Chaîne d'approvisionnement : git URL, forks, typosquats | PENDING | | |
| 5B.21 | Scripts `postinstall` inattendus | PENDING | | |
| 5B.22 | Schéma partagé versionné dans un dépôt | PENDING | | |

### §6 — Authentification, session, portail admin (27)

| ID | Contrôle | Statut | V1 | V2 |
|---|---|---|---|---|
| 6.01 | Stockage des mots de passe | PENDING | | |
| 6.02 | Politique de mot de passe (longueur, listes de fuites) | PENDING | | |
| 6.03 | Vérification d'email exigée avant octroi/dépense de tokens | PENDING | | |
| 6.04 | Énumération d'utilisateurs à la connexion | PENDING | | |
| 6.05 | Réinitialisation : entropie, usage unique, expiration, invalidation | PENDING | | |
| 6.06 | Changement d'email : double confirmation, invalidation | PENDING | | |
| 6.07 | OAuth : `state`, PKCE, allowlist de redirection, liaison par email non vérifié | PENDING | | |
| 6.08 | Stockage des jetons côté client | PENDING | | |
| 6.09 | JWT : algorithme épinglé, expiration, `aud`/`iss`, aucun claim de solde | PENDING | | |
| 6.10 | Rotation des refresh tokens et détection de réutilisation | PENDING | | |
| 6.11 | Déconnexion invalidée côté serveur | PENDING | | |
| 6.12 | Limitation de débit login/reset/signup (IP **et** compte) | PENDING | | |
| 6.13 | En-têtes CORS/CSP/HSTS/`X-Content-Type-Options`/`Referrer-Policy`/`frame-ancestors` | PENDING | | |
| 6.14 | Aucune fuite de stack trace en production | PENDING | | |
| 6.15 | Comptes anonymes : cycle de vie, liaison, transfert de solde | PENDING | | |
| 6.16 | Suppression de compte : périmètre réel, cascades, effet sur les tokens | PENDING | | |
| 6.17 | Admin = drapeau dans la session utilisateur ? | PENDING | | |
| 6.18 | MFA sur les comptes admin | PENDING | | |
| 6.19 | Restriction IP / VPN sur les routes admin | PENDING | | |
| 6.20 | Autorisation serveur sur **chaque** endpoint admin (appel direct, jeton normal) | PENDING | | |
| 6.21 | Endpoints admin présents dans le bundle public | PENDING | | |
| 6.22 | Journal d'audit immuable des actions admin | PENDING | | |
| 6.23 | Un admin peut-il créditer sans plafond ? | PENDING | | |
| 6.24 | L'admin voit-il prompts et images ? Divulgué ? Journalisé ? | PENDING | | |
| 6.25 | Expiration de session admin plus courte | PENDING | | |
| 6.26 | Portail admin sur la même origine | PENDING | | |
| 6.27 | Court-circuit `__DEV__` dans `isAdminUser()` : portée réelle | PENDING | | |

### §7 — Autorisation et accès aux données (10)

| ID | Contrôle | Statut | V1 | V2 |
|---|---|---|---|---|
| 7.01 | Balayage IDOR sur tout endpoint prenant un identifiant | PENDING | | |
| 7.02 | Mass assignment (`user_id`, `role`, `is_admin`, soldes, `price`…) | PENDING | | |
| 7.03 | Revue de **toutes** les politiques RLS (`USING (true)`, `WITH CHECK` manquant) | PENDING | | |
| 7.04 | Autorisation présente uniquement côté client | PENDING | | |
| 7.05 | Injection SQL / opérateurs / `where` non validé | PENDING | | |
| 7.06 | XSS, notamment prompts utilisateurs rendus bruts dans l'admin | PENDING | | |
| 7.07 | CSRF sur les requêtes qui changent l'état ou l'argent | PENDING | | |
| 7.08 | SSRF sur tout fetch serveur d'URL fournie par l'utilisateur | PENDING | | |
| 7.09 | Sur-exposition de PII (`select *`) | PENDING | | |
| 7.10 | Hygiène de journalisation (secrets, identifiants de paiement) | PENDING | | |

### §8 — Économie de tokens (17)

| ID | Contrôle | Statut | V1 | V2 |
|---|---|---|---|---|
| 8.01 | Où le solde est-il décrémenté ? Coût fourni par le client ? | PENDING | | |
| 8.02 | **Atomicité du débit / course au double-débit** | PENDING | | |
| 8.03 | Frontières transactionnelles débit / job / appel fournisseur | PENDING | | |
| 8.04 | Solde négatif possible ? Contrainte `CHECK` ? | PENDING | | |
| 8.05 | Moment du débit vs conditions affichées | PENDING | | |
| 8.06 | Remboursement automatique **et idempotent** | PENDING | | |
| 8.07 | Registre append-only vs colonne mutable | PENDING | | |
| 8.08 | Réconciliation `somme(mouvements) == solde` exécutable | PENDING | | |
| 8.09 | Mode d'octroi des tokens gratuits | PENDING | | |
| 8.10 | Farming multi-comptes (email jetable, vérification, device, IP, téléphone) | PENDING | | |
| 8.11 | Idempotence de l'octroi (double déclenchement, suppression/recréation) | PENDING | | |
| 8.12 | Codes de parrainage / promo | PENDING | | |
| 8.13 | Plafond global journalier du tier gratuit | PENDING | | |
| 8.14 | Coût par génération défini côté serveur uniquement | PENDING | | |
| 8.15 | Asymétrie de coût : table modèle → prix → coût → marge | PENDING | | |
| 8.16 | Paramètres de lot / quantité validés et tarifés | PENDING | | |
| 8.17 | Facturation des reprises (retry) | PENDING | | |

### §9 — Paiements (14)

| ID | Contrôle | Statut | V1 | V2 |
|---|---|---|---|---|
| 9.01 | Déclencheur d'exécution : webhook serveur vérifié, pas URL de retour | PENDING | | |
| 9.02 | Vérification de signature sur chaque webhook de paiement | PENDING | | |
| 9.03 | Idempotence des webhooks (rejeu) | PENDING | | |
| 9.04 | Fenêtre de rejeu et tolérance d'horodatage | PENDING | | |
| 9.05 | Autorité sur le prix et le montant | PENDING | | |
| 9.06 | Gestion des devises en unités mineures entières | PENDING | | |
| 9.07 | Remboursements et chargebacks : chemin de reprise | PENDING | | |
| 9.08 | États `pending`/`failed`/`disputed`/`refunded` distincts | PENDING | | |
| 9.09 | Périmètre PCI | PENDING | | |
| 9.10 | Obligations TVA/GST et merchant of record | PENDING | | |
| 9.11 | CGU : expiration des tokens, remboursement, droit de rétractation UE | PENDING | | |
| 9.12 | Reçus et factures | PENDING | | |
| 9.13 | Abonnements : proratisation, résiliation, relances, sort des tokens | PENDING | | |
| 9.14 | Correspondance `app_user_id` RevenueCat ↔ `auth.uid()` Supabase | PENDING | | |

### §10 — Intégration PoYo.ai et maîtrise des coûts (20)

| ID | Contrôle | Statut | V1 | V2 |
|---|---|---|---|---|
| 10.01 | Clé API strictement côté serveur (grep bundle + historique) | PENDING | | |
| 10.02 | Procédure de rotation documentée | PENDING | | |
| 10.03 | Clé en gestionnaire de secrets, jamais commitée | PENDING | | |
| 10.04 | Authentification du récepteur de callback | PENDING | | |
| 10.05 | Idempotence du callback | PENDING | | |
| 10.06 | Liaison `task_id` ↔ job/utilisateur | PENDING | | |
| 10.07 | Repli par polling et réconciliation des jobs orphelins | PENDING | | |
| 10.08 | Limitation de débit par utilisateur, indépendante du solde | PENDING | | |
| 10.09 | **Plafond de dépense global / disjoncteur** | PENDING | | |
| 10.10 | Plafond de concurrence par utilisateur et global | PENDING | | |
| 10.11 | Politique de reprise bornée avec backoff | PENDING | | |
| 10.12 | Double soumission d'une même action | PENDING | | |
| 10.13 | Télémétrie de coût par génération | PENDING | | |
| 10.14 | Alerting sur anomalies de dépense, erreurs, profondeur de file | PENDING | | |
| 10.15 | Facturation des générations échouées, réconciliée sur facture réelle | PENDING | | |
| 10.16 | Épinglage des modèles et test de régression de sortie | PENDING | | |
| 10.17 | Gestion des pannes fournisseur sans perte de tokens | PENDING | | |
| 10.18 | Distinction timeout / échec | PENDING | | |
| 10.19 | Couche d'abstraction fournisseur unique | PENDING | | |
| 10.20 | Rétention des photos et prompts chez PoYo vs politique de confidentialité | PENDING | | |

### §11 — Sécurité des contenus, modération, exposition juridique (11)

| ID | Contrôle | Statut | V1 | V2 |
|---|---|---|---|---|
| 11.01 | **Modération des uploads / contrôles CSAM** | PENDING | | |
| 11.02 | Photos de personnes réelles, y compris mineures | PENDING | | |
| 11.03 | Modération du texte du prompt avant envoi au fournisseur | PENDING | | |
| 11.04 | Injection de prompt / évasion du gabarit | PENDING | | |
| 11.05 | Modération de la sortie générée | PENDING | | |
| 11.06 | Signalement et retrait | PENDING | | |
| 11.07 | Vérification d'âge | PENDING | | |
| 11.08 | Propriété intellectuelle (Games Workshop, presets nommés) | PENDING | | |
| 11.09 | Propriété des images générées dans les CGU | PENDING | | |
| 11.10 | Affirmations produit sur le modèle non substantiables | PENDING | | |
| 11.11 | Procédure d'incident pour contenu illégal | PENDING | | |

### §12 — Qualité de génération et justesse métier (10)

| ID | Contrôle | Statut | V1 | V2 |
|---|---|---|---|---|
| 12.01 | Fidélité peinture : valeurs colorimétriques réelles ou noms seuls | PENDING | | |
| 12.02 | Traitement des catégories (opaque / metallic / wash / contrast) | PENDING | | |
| 12.03 | Métalliques rendues comme surfaces métalliques | PENDING | | |
| 12.04 | Qualité des gabarits de prompt (zénithal, layering, edge highlight, résine) | PENDING | | |
| 12.05 | Versionnage des gabarits, version stockée avec la génération | PENDING | | |
| 12.06 | Logique de sélection de modèle, délibérée et consciente du coût | PENDING | | |
| 12.07 | Évaluation systématique de la qualité (golden set) | PENDING | | |
| 12.08 | Déterminisme et stockage des seeds | PENDING | | |
| 12.09 | Traitement de l'image d'entrée (résolution, ratio, EXIF, pré-traitement) | PENDING | | |
| 12.10 | Validation ratio/taille avant dépense d'un token | PENDING | | |

### §13 — Performance, médias, UX (27)

| ID | Contrôle | Statut | V1 | V2 |
|---|---|---|---|---|
| 13.01 | Analyse de bundle, budgets (JS initial, LCP, INP, CLS) | PENDING | | |
| 13.02 | Code splitting ; **l'admin ne doit pas être dans le bundle utilisateur** | PENDING | | |
| 13.03 | Imports de bibliothèques entières, doublons de versions | PENDING | | |
| 13.04 | Livraison des images générées (format, srcset, lazy, CDN, dimensions) | PENDING | | |
| 13.05 | Pagination et virtualisation de la galerie | PENDING | | |
| 13.06 | Sur-récupération, N+1, index sur `user_id`/`status`/`created_at` | PENDING | | |
| 13.07 | Stratégie de cache et invalidation | PENDING | | |
| 13.08 | Tempêtes de re-render pendant la boucle de progression | PENDING | | |
| 13.09 | Coût de l'intervalle de polling | PENDING | | |
| 13.10 | Fuites mémoire : listeners, timers, souscriptions au démontage | PENDING | | |
| 13.11 | **Slider de couleur erratique** (à mesurer) | PENDING | | |
| 13.12 | Politique d'accès au bucket / URLs signées | PENDING | | |
| 13.13 | Croissance du stockage et cycle de vie | PENDING | | |
| 13.14 | Suppression à la fermeture de compte et sur demande | PENDING | | |
| 13.15 | Sauvegarde des contenus générés vs attente de permanence | PENDING | | |
| 13.16 | Visibilité permanente du solde | PENDING | | |
| 13.17 | Coût affiché avant validation | PENDING | | |
| 13.18 | Progression honnête (à 60 s, à 5 min) | PENDING | | |
| 13.19 | **UX d'échec : tokens débités ou non, dit clairement** | PENDING | | |
| 13.20 | Parcours d'achat : friction, abandon, reprise après échec | PENDING | | |
| 13.21 | États vide / chargement / erreur / hors-ligne sur chaque vue | PENDING | | |
| 13.22 | Actions destructrices : confirmation et annulation | PENDING | | |
| 13.23 | Onboarding et explication de l'octroi gratuit | PENDING | | |
| 13.24 | Cohérence inter-applications avec MiniPainterDB | PENDING | | |
| 13.25 | Accessibilité WCAG 2.1 AA | PENDING | | |
| 13.26 | Information portée par la couleur seule | PENDING | | |
| 13.27 | Responsive dès 320 px, safe areas, zone du pouce | PENDING | | |

### Preuves déjà acquises en Phase 0 (à réutiliser, pas à refaire)

Ces vérifications de **Classe C** sont horodatées au 2026-08-05 et déjà exploitables comme `V1` ou `V2`.

| Élément | Classe | Observation |
|---|---|---|
| Visibilité du dépôt | C/D | `gh repo view` → `"visibility":"PUBLIC"`, `defaultBranchRef:"main"`, `forkCount:0`, `pushedAt:2026-03-04` |
| Droits `EXECUTE` des 40 RPC | C | `has_function_privilege` sur base live |
| Politiques RLS complètes | C | `pg_policies`, 24 politiques sur 12 tables |
| RLS activée sur toutes les tables | C | `pg_class.relrowsecurity` = true partout |
| `private.poyo_api_keys` inaccessible aux clients | C | `has_table_privilege('anon'/'authenticated','SELECT')` = false |
| Corps live de `reserve_generation` (4 args) | C | `pg_get_functiondef` — **aucun `FOR UPDATE`** |
| Config fournisseur en production | C | `primary_provider=poyo`, `poyo_model=nano-banana-pro-edit`, `fallback_enabled=false` |
| Liste des 68 migrations appliquées | C | `list_migrations` |
| 5 edge functions déployées + `verify_jwt` | C | `list_edge_functions` |
| Source live de `delete-account` | C | `get_edge_function` |
| Volumétrie réelle (21 users / 1 entitlement / 390 jobs / 1 générateur) | C/D | requêtes d'agrégation |
| Absence totale de tests et de CI | A | `git ls-files`, `ls .github/workflows` |
| 30 vulnérabilités npm (2 critiques, 10 hautes) | B | `npm audit --json` exécuté |
| Schéma `paints` **avec** `product_type`, `finish`, `opacity` | C | `information_schema.columns` — **contredit le bloc de contexte fourni** |

---

## 15. Deux corrections au dossier fourni

**1. `paints` possède désormais une colonne de catégorie.** Le bloc de contexte affirme « no paint `type` column and no Lab values ». Le schéma live contient `product_type`, `finish`, `opacity`, `pigment_info`, `replaced_by`, `discontinued_date`. Les migrations `logic001_populate_product_type` et `logic001_category_aware_matching` sont **appliquées** (2026-07-31).
→ **`LOGIC-001` semble déjà remédié en production.** Cela ne dispense pas de la Phase 1 : il reste à établir **si MiniStudio consomme réellement ces données** et si son chemin de prompt, lui, tient compte de la catégorie. La correction est côté appariement ; rien ne prouve encore qu'elle atteint la génération d'images.
*(Pas de valeurs Lab : l'appariement reste RGB — à instruire en Phase 8.)*

**2. Le stack front est deux SDK majeurs plus récent qu'annoncé** (Expo 54 / RN 0.81 / router 6, et non 52 / 0.76 / 4). Toute recommandation de mise à niveau doit partir du réel.

---

## 16. Ce que la Phase 0 n'a **pas** couvert

Énoncé explicitement, conformément à la règle 5 des règles d'engagement.

- Contenu de `app/(studio)/index.tsx` (1 834 l.), `app/admin/index.tsx` (1 557 l.), `AuthContext.tsx` (701 l.) — repérés, non lus.
- Corps live de `authorize_generation`, `confirm_generation` (×4), `release_generation`, `complete_poyo_job`, `increment_token_balance`, `get_available_poyo_key`, `get_admin_*`.
- Les 4 migrations SQL non commitées ont été lues ; les 41 autres fichiers ne l'ont pas été.
- Aucun scan de l'historique git à la recherche de secrets.
- Aucune mesure de performance.
- Aucun test exécuté contre la base (aucune écriture, aucun harnais de concurrence).
- Aucune lecture du dépôt MiniPainterDB.
- Aucune consultation de documentation fournisseur (PoYo, RevenueCat), d'App Store Connect, de Play Console, ni d'aucune facture.
- Gabarits de prompt (`prompt_configs`, 50 lignes en base) non extraits.

---

**Fin de la Phase 0.** J'attends votre confirmation, et surtout une réponse à **Q1/Q2** (environnement de test), avant d'ouvrir la Phase 1.
