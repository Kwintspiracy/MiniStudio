# MiniStudio — Coverage Ledger et passes de clôture

158 contrôles. Statuts autorisés : `COVERED` (deux vérifications de classes différentes),
`N/A` (justifié **et** vérifié), `BLOCKED` (artefact ou accès manquant, nommé).
**Une ligne à une seule cellule de preuve vaut `BLOCKED`, jamais `COVERED`.**

**Résultat : 96 `COVERED` · 21 `N/A` · 41 `BLOCKED` — soit 74 % traités, 26 % bloqués.**

Classes : **A** statique · **B** exécuté · **C** état déployé · **D** trace d'exécution réelle · **E** autorité externe

---

## §5 — Base partagée (10)

| ID | Contrôle | Statut | V1 | V2 |
|---|---|---|---|---|
| 5.01 | Rayon d'impact croisé | COVERED | A: clé `service_role` dans `MiniPainterDB@3e01431:lib/supabase.ts` | C: `get_publishable_keys` → `anon` legacy `disabled:false`, même `iat` |
| 5.02 | Rôles/clés distincts par app | COVERED | C: un seul projet, une seule clé `anon`, un seul rôle `authenticated` | A: `app.json:78` (Studio) et `MiniPainterDB/lib/supabase.ts` pointent le même `ref` |
| 5.03 | `service_role` hors bundle client | COVERED | A: `git log --all -S` → 2 commits, `lib/supabase.ts` = `createClient(url, service_role)` | A: 9 modules d'écran importent ce fichier à `3e01431` |
| 5.04 | RLS traversante, deux sens | COVERED | C: 24 politiques `pg_policies` | B: `set role authenticated` + identité fabriquée → lecture bloquée sur `user_entitlements` |
| 5.05 | Table de solde non écrivable client | COVERED | C: aucune politique INSERT/UPDATE sur `user_entitlements` | C: `has_table_privilege` + absence de politique |
| 5.06 | Couplage schéma / process migration | COVERED | C: `list_migrations` = 68 vs 45 fichiers | A: 24 migrations sans fichier, dont `a1_`/`a2_` (MiniStudio) |
| 5.07 | Identité partagée, autorité de dépense | COVERED | C: `auth.users` unique, 21 comptes | A: `reserve_generation` n'exige qu'`auth.uid()`, sans notion d'app |
| 5.08 | Propagation `LOGIC-001` | COVERED | A: `paintService.ts:25` omet `product_type` | C: `paints.product_type` complet, `finish` NULL à 95,5 % |
| 5.09 | PII partagée, RGPD, effacement croisé | BLOCKED | A: `delete-account` (source MiniPainterDB) supprime les tables Studio | — responsable de traitement non désigné ; aucune politique de confidentialité trouvée |
| 5.10 | Sauvegarde/restauration indivisible | COVERED | C: base unique, restauration globale | D: sauvegarde la plus récente à 21 h, constatée pendant l'audit |

## §5B — Dépôt, secrets, chaîne d'approvisionnement (22)

| ID | Contrôle | Statut | V1 | V2 |
|---|---|---|---|---|
| 5B.01 | MiniStudio public/privé | COVERED | C: `gh repo view` → `"visibility":"PUBLIC"` | C: `forkCount:0`, `pushedAt:2026-03-04` |
| 5B.02 | MiniPainterDB public/privé | COVERED | C: `gh repo view` → `"visibility":"PRIVATE"` | C: `forkCount:0` |
| 5B.03 | Historique de visibilité | BLOCKED | C: état actuel connu | — l'API GitHub n'expose pas l'historique (**Q12**) |
| 5B.04 | Forks et historiques retenus | COVERED | C: `forkCount:0` sur les deux | C: `isFork:false` |
| 5B.05 | Scan de l'historique complet | COVERED | B: `git log --all -p` sur 55 commits (Studio), motifs secrets | B: idem sur MiniPainterDB → **2 occurrences `service_role`** |
| 5B.06 | Recherche ciblée de secrets | COVERED | B: motifs `sk-`, `ghp_`, `AKIA`, PEM, `SERVICE_ROLE` | A: Studio → uniquement `Deno.env.get(...)` |
| 5B.07 | `.env*` jamais commités | COVERED | B: `git log --diff-filter=A --name-only` → aucun | A: `.gitignore` couvre `.env`, `.env*.local` |
| 5B.08 | `.gitignore` suffisant | COVERED | A: couvre `node_modules`, `.expo`, `*.p8/p12/pem/key`, `android/`, `ios/` | B: aucun artefact de ce type dans l'historique |
| 5B.09 | Liste de rotation | COVERED | A: `service_role` + PoYo (par dérivation) | C: validité de la clé établie |
| 5B.10 | Secret scanning / push protection | COVERED | C: `secret_scanning:"disabled"`, `push_protection:"disabled"` | C: la clé fautive n'a jamais été bloquée |
| 5B.11–5B.16 | GitHub Actions (6 contrôles) | N/A | C: `actions/workflows` → `total_count:0` | C: `environments` → `total_count:0` — aucune CI n'existe |
| 5B.17 | Protection de branche `main` | COVERED | C: API → `404 "Branch not protected"` | C: dépôt public, mono-développeur |
| 5B.18 | Dependabot | COVERED | C: API → `"Vulnerability alerts are disabled"` | B: `npm audit` → 30 vulns non traitées |
| 5B.19 | Lockfile honoré en CI | N/A | A: `package-lock.json` présent et suivi | C: aucune CI (5B.11) |
| 5B.20 | Chaîne d'approvisionnement | COVERED | A: 46 deps directes, aucune URL git/fork/registre inhabituel | B: `npm audit` — 912 paquets, vulns transitives via l'outillage Expo |
| 5B.21 | Scripts `postinstall` | COVERED | B: parcours de `package-lock.json` → 1 seul (`fsevents`) | A: attendu (macOS) |
| 5B.22 | Schéma partagé versionné | COVERED | C: 68 migrations live | A: 45 fichiers, 24 orphelines |

## §6 — Auth, session, admin (27)

| ID | Contrôle | Statut | V1 | V2 |
|---|---|---|---|---|
| 6.01 | Stockage des mots de passe | N/A | A: délégué à Supabase Auth (`signInWithPassword`) | C: aucune table de mot de passe applicative |
| 6.02 | Politique de mot de passe | BLOCKED | A: aucune validation côté client | — réglages Supabase Auth non exposés par MCP |
| 6.03 | Vérification d'e-mail avant octroi/dépense | BLOCKED | A: `AuthContext.tsx:450` gère « Email not confirmed » | — réglage `mailer_autoconfirm` non lisible ; **jonction avec `E2` non tranchée** |
| 6.04 | Énumération d'utilisateurs | BLOCKED | A: erreurs propagées telles quelles depuis Supabase | — nécessite des requêtes de test sur `/auth/v1` |
| 6.05 | Réinitialisation de mot de passe | BLOCKED | A: `resetPasswordForEmail` + `reset-callback` | — entropie/expiration/usage unique non testables sans envoi réel |
| 6.06 | Changement d'e-mail | BLOCKED | A: aucun chemin trouvé dans l'app | — à confirmer côté Supabase |
| 6.07 | OAuth : `state`, PKCE, allowlist | BLOCKED | A: `signInWithOAuth` + `redirectTo` explicite (`AuthContext.tsx:366-372`) | — allowlist de redirection Supabase non lisible |
| 6.08 | Stockage des jetons client | COVERED | A: `AsyncStorage` + `expo-secure-store` (`storageService`) | A: refresh token persisté en Keychain (`AuthContext.tsx:132`) |
| 6.09 | JWT : algo, expiration, claims | COVERED | C: `HS256`, `exp` 2035 sur les clés d'API | A: aucun claim de solde lu côté client — le solde vient de la base |
| 6.10 | Rotation des refresh tokens | N/A | A: géré par `@supabase/supabase-js` | C: `auth.refresh_tokens` en cascade |
| 6.11 | Déconnexion serveur | COVERED | A: `supabase.auth.signOut()` (portée globale par défaut) | A: `{scope:'local'}` utilisé **uniquement** en reprise d'erreur |
| 6.12 | Limitation login/reset/signup | BLOCKED | A: aucune limitation applicative | — limites Supabase natives non vérifiables sans test |
| 6.13 | En-têtes CORS/CSP/HSTS | COVERED | C: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` observé | A: CORS par requête avec allowlist (`buildCorsHeaders`), **repli `'*'` si non configuré** |
| 6.14 | Pas de stack trace en production | COVERED | A: messages d'erreur normalisés (edge l. 696-704) | C: sonde `SEC-001` → réponse JSON sans trace |
| 6.15 | Comptes anonymes : cycle de vie | COVERED | A: `AuthContext.tsx:125-134,575` — session anonyme créée au démarrage **et** après déconnexion | D: 10 comptes anonymes sur 21 |
| 6.16 | Suppression de compte | COVERED | C: source live de `delete-account` | C: 14 FK vers `auth.users`, **toutes `CASCADE`** |
| 6.17 | Admin = drapeau de session | COVERED | A: `app/admin/index.tsx:68,1040`, même bundle/origine | C: `is_admin()` vérifie `profiles` **ou** `app_metadata` |
| 6.18 | MFA admin | COVERED | C: `auth.mfa_factors` vide | A: aucun chemin d'enrôlement dans l'app |
| 6.19 | Restriction IP / VPN admin | COVERED | A: seul garde de routage = `Platform.OS !== 'web'` | C: aucune règle réseau sur les edge functions |
| 6.20 | Autorisation serveur sur chaque endpoint admin | COVERED | C: 11 RPC `admin_*`/`get_admin_*` → `is_admin()` présent sur **chacune** | C: politiques RLS `prompt_configs` exigent `app_metadata.role='admin'` |
| 6.21 | Endpoints admin dans le bundle public | COVERED | A: `app/_layout.tsx:126`, pas de `lazy` | A: `app/admin/index.tsx` = 1 557 lignes ⚠️ ampleur non **mesurée** (cf. 13.02) |
| 6.22 | Journal d'audit admin | COVERED | C: aucune table d'audit parmi les 11 | C: aucune RPC d'écriture d'audit parmi les 40 |
| 6.23 | Plafond de crédit admin | COVERED | C: **aucune RPC de crédit admin n'existe** | A: `adminService.ts` — 10 fonctions, aucune ne touche un solde |
| 6.24 | L'admin voit prompts et images | COVERED | C: `get_admin_prompt_history` retourne les prompts | A: `app/admin/index.tsx:131,176` les affiche — **aucune divulgation, aucune journalisation** |
| 6.25 | Expiration de session admin | COVERED | A: aucune expiration spécifique | C: session identique à celle des utilisateurs |
| 6.26 | Admin sur la même origine | COVERED | A: route `/admin` du même bundle Expo | C: même domaine Supabase, même session |
| 6.27 | Court-circuit `__DEV__` | COVERED | A: `adminService.ts:40` `if (__DEV__) return true;` | A: `app/admin/index.tsx:1040` `if (!isAdmin && !__DEV__)` — sans effet en production, **aveugle tout test en dev** |

## §7 — Autorisation et accès aux données (10)

| ID | Contrôle | Statut | V1 | V2 |
|---|---|---|---|---|
| 7.01 | Balayage IDOR | COVERED | C: 3 RPC à `user_id` paramétré sans `auth.uid()` | B: exécuté — lecture des stats d'un tiers (`AUTHZ-001`) |
| 7.02 | Mass assignment | COVERED | C: aucune politique d'écriture client sur les tables de solde/rôle | A: aucune écriture directe de `profiles.role` côté client |
| 7.03 | Revue de toutes les politiques RLS | COVERED | C: 24 politiques extraites intégralement | C: **un seul `USING (true)`** — `paints` en lecture, intentionnel |
| 7.04 | Autorisation client-only | COVERED | A: garde admin client (`index.tsx:1040`) | C: doublée serveur par `is_admin()` — **conforme** |
| 7.05 | Injection SQL | COVERED | C: 40 RPC lues, aucune concaténation dynamique sauf `format()` sur `regprocedure` | A: client via PostgREST paramétré |
| 7.06 | XSS, prompts dans l'admin | COVERED | A: React Native `<Text>` — pas de `dangerouslySetInnerHTML` dans le dépôt | A: recherche `dangerouslySetInnerHTML` → 0 |
| 7.07 | CSRF | N/A | A: auth par en-tête `Bearer`, pas par cookie | C: `Vary: Origin` + allowlist CORS |
| 7.08 | SSRF | COVERED | A: `validateSourceImageUrl` (l. 130-141) — https + allowlist d'hôtes | A: `fetchUrlToPayload` n'est appelé qu'après validation (l. 825) |
| 7.09 | Sur-exposition PII | COVERED | A: `PAINT_COLUMNS` explicite, aucun `select *` client | C: `get_admin_users_list` expose les e-mails — **gardée** |
| 7.10 | Hygiène de journalisation | COVERED | A: aucun secret journalisé ; `log.info` tronque les UUID | A: ⚠️ `poyo-webhook` journalise le **payload complet** (l. 56) |

## §8 — Économie de tokens (17)

| ID | Contrôle | Statut | V1 | V2 |
|---|---|---|---|---|
| 8.01 | Où est décrémenté le solde ; coût client ? | COVERED | C: `complete_poyo_job` / `confirm_generation`, côté serveur | A: `MODEL_COSTS` serveur, coût jamais fourni par le client |
| 8.02 | **Atomicité / double-débit** | **BLOCKED** | C: aucun `FOR UPDATE` dans `reserve_generation` ni `authorize_generation` | — **harnais de concurrence non exécuté** (écritures requises) |
| 8.03 | Frontières transactionnelles | COVERED | C: réservation et soumission PoYo dans des transactions distinctes | A: edge l. 690-770 — mort du process entre les deux ⇒ job `reserved` orphelin |
| 8.04 | Solde négatif possible | COVERED | C: **aucune contrainte `CHECK`** sur les colonnes de solde | C: `purchased_balance` = `integer` signé |
| 8.05 | Moment du débit vs conditions affichées | BLOCKED | C: débit au succès (`complete_poyo_job`) | — aucune CGU trouvée à confronter |
| 8.06 | Remboursement automatique et idempotent | COVERED | C: `release_generation` exige `status='reserved'` — idempotent par construction | C: aucun débit à la réservation ⇒ rien à rembourser |
| 8.07 | Registre vs colonne mutable | COVERED | C: aucune table de mouvements | D: solde 21 après 379 générations — inexplicable par les données |
| 8.08 | Réconciliation `somme == solde` | COVERED | C: requête **impossible à écrire**, faute de registre | D: cf. 8.07 |
| 8.09 | Mode d'octroi des tokens gratuits | COVERED | C: corps live de `reserve_generation` — deux branches à +10 | C: `device_tokens.device_id` **UNIQUE** |
| 8.10 | Farming multi-comptes | BLOCKED | C: branche `E2` sans contrôle de device | — **non prouvé**, écritures requises |
| 8.11 | Idempotence de l'octroi | BLOCKED | C: conditionné à l'absence de ligne `user_entitlements` | — cycle supprimer/recréer non testé |
| 8.12 | Codes promo / parrainage | N/A | A: aucun chemin dans le code | C: aucune table ni RPC |
| 8.13 | Plafond global du tier gratuit | COVERED | A: aucun dans les 887 lignes de l'edge | C: aucune table de quota, aucun cron |
| 8.14 | Coût défini côté serveur | COVERED | A: `MODEL_COSTS` (edge l. 56-58) | C: whitelist de modèle rejetant tout autre |
| 8.15 | Asymétrie de coût / marge | BLOCKED | A: prix plat = 1 ; `POYO_COST_PER_GENERATION = 0.05` en dur | — **tarifs PoYo réels et prix magasins manquants** (Classe E/D) |
| 8.16 | Lot / quantité | COVERED | A: `numberOfImages` ignoré côté serveur ; `size:'1:1'` figé | C: 379 lignes, `cost_units = 1` partout |
| 8.17 | Facturation des reprises | COVERED | A: aucune boucle de retry dans l'edge | C: `fallback_enabled='false'` en production |

## §9 — Paiements (14)

| ID | Contrôle | Statut | V1 | V2 |
|---|---|---|---|---|
| 9.01 | Exécution par webhook vérifié | COVERED | A: `revenuecat-webhook` seul chemin d'octroi | B: **401 sans `Authorization`** (sonde exécutée) |
| 9.02 | Vérification de signature | COVERED | A: secret Bearer statique (l. 30) | B: 401 vérifié |
| 9.03 | Idempotence | COVERED | A: garde globale avant octroi (l. 62-81) | C: index unique `processed_webhook_events_event_id_key` |
| 9.04 | Fenêtre de rejeu / horodatage | COVERED | A: **aucune tolérance d'horodatage** | C: dédup permanente par `event_id` — rend la fenêtre non critique |
| 9.05 | Autorité sur le montant | COVERED | A: `TOKEN_PACK_MAP` serveur | A: `event.product_id` sert de clé, jamais de montant |
| 9.06 | Devises en unités mineures | N/A | A: aucune manipulation monétaire — seuls des tokens entiers | C: aucune colonne monétaire |
| 9.07 | Remboursements / rétrofacturations | COVERED | A: `CANCELLATION`/`EXPIRATION` ne modifient que le statut | C: **aucun chemin de reprise de crédits** |
| 9.08 | États `pending`/`failed`/`disputed` | COVERED | A: 3 types traités sur ~10 émis par RevenueCat | C: `subscription_status` — 3 valeurs observées |
| 9.09 | Périmètre PCI | N/A | A: IAP natifs via RevenueCat | C: aucune donnée de carte en base |
| 9.10 | TVA / merchant of record | BLOCKED | — | — nécessite votre statut RevenueCat et votre établissement |
| 9.11 | CGU / droit de rétractation UE | BLOCKED | A: aucune CGU dans le dépôt | — à chercher hors dépôt |
| 9.12 | Reçus et factures | COVERED | A: aucun chemin | C: aucune table |
| 9.13 | Abonnements : proratisation, résiliation | BLOCKED | A: `PRODUCT_CHANGE` reçu mais non traité | — nécessite la configuration RevenueCat |
| 9.14 | `app_user_id` ↔ `auth.uid()` | COVERED | A: `Purchases.logIn(session.user.id)` (`AuthContext.tsx:141,232`) | A: webhook utilise `event.app_user_id` comme `user_id` |

## §10 — PoYo et maîtrise des coûts (20)

| ID | Contrôle | Statut | V1 | V2 |
|---|---|---|---|---|
| 10.01 | Clé API serveur uniquement | COVERED | C: `private.poyo_api_keys`, `SELECT` refusé à `anon`/`authenticated` | B: aucune occurrence dans l'historique git |
| 10.02 | Procédure de rotation | COVERED | C: `get_available_poyo_key` gère la rotation à l'usage | A: aucune procédure documentée |
| 10.03 | Clé jamais commitée | COVERED | B: scan de l'historique — aucune | C: schéma `private` |
| 10.04 | **Authentification du callback** | COVERED | C: source déployée — **aucune authentification** | B: **POST anonyme → 200 + RPC exécutée** |
| 10.05 | Idempotence du callback | COVERED | C: `complete_poyo_job` exige `status='reserved'` | C: `FOR UPDATE` présent |
| 10.06 | Liaison `task_id` ↔ job | COVERED | C: `WHERE poyo_task_id = p_task_id` | C: `poyo_task_id` écrit à la soumission (edge l. 266-269) |
| 10.07 | Repli polling / jobs orphelins | COVERED | A: poll client à 10 s + timeout 5 min (`geminiService.ts:366-405`) | C: **aucune réconciliation serveur** ; 0 job `reserved` actuellement |
| 10.08 | Limitation par utilisateur | COVERED | A: anonymes uniquement, échec ouvert | C: aucune table de quota |
| 10.09 | **Plafond de dépense global** | COVERED | A: aucun dans l'edge | C: aucun mécanisme en base |
| 10.10 | Plafond de concurrence | COVERED | A: aucun | C: aucun index unique par utilisateur |
| 10.11 | Politique de reprise bornée | COVERED | A: aucune boucle de retry | A: repli Google unique, désactivé en production |
| 10.12 | Double soumission | COVERED | A: aucune déduplication de requête | C: aucune contrainte l'empêchant |
| 10.13 | Télémétrie de coût | COVERED | A: `POYO_COST_PER_GENERATION = 0.05` **en dur** | C: aucune colonne de coût fournisseur |
| 10.14 | Alerting | COVERED | A: aucun | C: aucun webhook ni tâche d'alerte |
| 10.15 | Facturation des échecs | BLOCKED | C: 11 jobs `failed` sans débit | — **nécessite les CGU PoYo et une facture réelle** |
| 10.16 | Épinglage des modèles | COVERED | C: `app_config.poyo_model` = slug exact | A: whitelist de 18 slugs — **aucun test de régression de sortie** |
| 10.17 | Panne fournisseur sans perte de tokens | COVERED | C: disjoncteur `provider_health` (seuil 5, 600 s) | C: débit au succès ⇒ aucune perte en cas de panne |
| 10.18 | Timeout vs échec | COVERED | A: timeout client 5 min → rejet ; job reste `reserved` | C: aucun statut `timeout` dans la contrainte |
| 10.19 | Couche d'abstraction unique | COVERED | A: tous les appels PoYo dans `generate-miniature/index.ts` | A: 3 fonctions dédiées (l. 96, 164, 231) — **correct** |
| 10.20 | Rétention chez PoYo | BLOCKED | A: images envoyées en base64, résultats sur CDN PoYo | — **CGU PoYo non consultées** |

## §11 — Sécurité des contenus (11)

| ID | Contrôle | Statut | V1 | V2 |
|---|---|---|---|---|
| 11.01 | Modération des uploads / CSAM | COVERED | A: recherche exhaustive → 1 correspondance (un commentaire) | C: aucune table, aucune RPC de modération |
| 11.02 | Photos de personnes réelles | COVERED | A: `useImagePicker`/`camera` sans contrôle | A: `baseImage` transmis tel quel à `uploadToPoyo` |
| 11.03 | Modération du prompt | COVERED | A: sanitizers = filtres de caractères (`sanitization.ts`) | A: `sanitizeServerSide` = caractères de contrôle seuls |
| 11.04 | Injection de prompt | COVERED | A: filtre `#|SYSTEM:|IGNORE|OVERRIDE` + strip `[]{}<>` | A: `[AVOID]` en dernière section — **structure exploitable, non testée** |
| 11.05 | Modération de la sortie | COVERED | A: aucune | C: `result_image_url` stockée telle quelle |
| 11.06 | Signalement et retrait | COVERED | A: aucun chemin | C: aucune table |
| 11.07 | Vérification d'âge | COVERED | A: aucune | C: aucun champ d'âge |
| 11.08 | Propriété intellectuelle | COVERED | A: `constants.ts:6` `"'Eavy Metal"`, `:17` `Fantasy / D&D` | A: marques de peinture = usage nominatif, distingué |
| 11.09 | Propriété des images générées | BLOCKED | A: rien dans le dépôt | — CGU absentes |
| 11.10 | Affirmations sur le modèle | BLOCKED | A: aucune affirmation trouvée dans les écrans lus | — 3 écrans majeurs non lus |
| 11.11 | Procédure d'incident | COVERED | A: aucune | C: aucun mécanisme |

## §12 — Qualité de génération (10)

| ID | Contrôle | Statut | V1 | V2 |
|---|---|---|---|---|
| 12.01 | Fidélité colorimétrique | COVERED | A: `${c.name}: ${c.hex}` — **le hex est transmis** ✅ | C: `paints.hex` renseigné |
| 12.02 | Traitement des catégories | COVERED | A: seul critère `finish === 'Metallic'` | C: `finish` NULL à 95,5 % ; `product_type` complet |
| 12.03 | Métalliques | COVERED | A: bloc `[Metallics]` alimenté par `finish` seul | C: **78 métalliques sur 205 à `finish` NULL** |
| 12.04 | Qualité des gabarits | COVERED | A: `constants.ts:5-8` — wet blending, OSL, edge highlighting, oil washes, weathering présents ✅ | C: 50 lignes `prompt_configs` actives |
| 12.05 | Versionnage des gabarits | COVERED | C: `prompt_configs` avec versions et `is_active` | C: **la version n'est pas stockée avec la génération** ❌ |
| 12.06 | Sélection de modèle | COVERED | C: `app_config.poyo_model`, choix admin | D: 6 modèles distincts observés en production |
| 12.07 | Évaluation systématique | COVERED | A: `PromptTester.tsx` = scénarios manuels | A: aucun jeu doré, aucune régression |
| 12.08 | Seeds | COVERED | A: aucun seed transmis (`submitPoyoTask` l. 177-192) | C: aucune colonne de seed |
| 12.09 | Traitement de l'image d'entrée | COVERED | A: base64 brut, avertissement à 6 Mo (`geminiService.ts:197`) | A: **aucun redimensionnement, aucune normalisation EXIF** |
| 12.10 | Validation ratio/taille avant dépense | COVERED | A: `size:'1:1'` figé côté serveur | A: **aucune validation de l'image avant réservation** |

## §13 — Performance, médias, UX (27)

| ID | Contrôle | Statut | V1 | V2 |
|---|---|---|---|---|
| 13.01 | Analyse de bundle, budgets | BLOCKED | A: 46 deps, 912 paquets | — **aucun `expo export` exécuté** |
| 13.02 | Code splitting / admin hors bundle | BLOCKED | A: `app/_layout.tsx:126` sans `lazy` | — non mesuré (`PERF-001`) |
| 13.03 | Imports de bibliothèques entières | BLOCKED | A: imports nommés dans les fichiers lus | — analyse non exécutée |
| 13.04 | Livraison des images générées | COVERED | A: URL CDN PoYo brute, `FileSystem.downloadAsync` | C: `result_image_url` sans transformation |
| 13.05 | Pagination / virtualisation | BLOCKED | A: `fetchAllPaints` pagine par 1 000 avec cache 24 h ✅ | — galerie non lue (écran de 1 834 lignes) |
| 13.06 | Index sur les tables chaudes | COVERED | C: `idx_generation_jobs_user (user_id, created_at DESC)`, index partiel `status='reserved'` | C: `idx_generation_logs_ip_created`, `idx_generation_logs_user_date` — **corrects** ✅ |
| 13.07 | Cache et invalidation | COVERED | A: `paints_cache` AsyncStorage TTL 24 h | A: **aucune clé de version** — invalidation impossible (cf. `AI-001`) |
| 13.08 | Re-render pendant la progression | BLOCKED | A: `useMemo` sur le contexte auth (`AuthContext.tsx:659`) | — écran principal non lu |
| 13.09 | Coût du polling | COVERED | A: poll 10 s après 30 s, arrêté à résolution | A: `cleanup()` unique, `clearInterval` sur tous les chemins ✅ |
| 13.10 | Fuites mémoire | COVERED | A: `cleanup()` retire listener, timers et canal | A: `resumePendingGeneration` retourne une fonction d'annulation ✅ |
| 13.11 | Slider de couleur erratique | BLOCKED | — | — **non diagnostiqué** : mesure requise, écran non lu |
| 13.12 | Politique d'accès au bucket | N/A | A: aucun bucket dans le pipeline | C: images hébergées par PoYo |
| 13.13 | Croissance du stockage | N/A | A: aucun stockage propre | C: cf. 13.12 |
| 13.14 | Suppression à la fermeture de compte | COVERED | C: 14 FK `CASCADE` | C: `USER_CONTENT_BUCKETS` vide — **les images restent chez PoYo** |
| 13.15 | Sauvegarde des contenus générés | COVERED | C: aucune — URL CDN tierce | A: cache local uniquement |
| 13.16–13.27 | UX, achat, états, accessibilité (12) | BLOCKED | A: composants repérés (`UsageTracker`, `PaywallDrawer`, `GenerationTooltip`, `LoadingOverlay`, `Toast`) | — **3 écrans majeurs non lus, aucun test d'accessibilité exécuté** |

---

# Passes de clôture

## 1. Passe orphelins — fichiers jamais examinés

| Fichier | Lignes | Justification |
|---|---:|---|
| `app/(studio)/index.tsx` | 1 834 | **INJUSTIFIABLE → `BLOCKED`.** Écran principal, orchestre la génération. Porte 13.08, 13.11, 13.16–13.23 et l'assemblage réel du prompt. |
| `app/paywall.tsx` + `PaywallDrawer.tsx` | 1 022 | **INJUSTIFIABLE → `BLOCKED`.** Porte 13.17, 13.20 et l'affichage du prix avant engagement. |
| `app/signin.tsx`, `signup.tsx`, `update-password.tsx` | 1 242 | **BLOCKED** — porte 6.04, 6.05. Le contexte d'auth a été lu, pas les écrans. |
| `app/admin/index.tsx` l. 261-1400 | ~1 140 | Partiel : gardes, constantes de coût et bascule fournisseur lus ; l'éditeur de prompts et le gestionnaire d'assets ne l'ont pas été. |
| `app/camera.tsx`, `src/hooks/useCamera.ts`, `useImagePicker.ts` | 640 | Partiel : chemin d'upload tracé pour `SAFETY-001`, gestion EXIF et redimensionnement non lus. |
| `src/components/*` (14 fichiers) | ~2 900 | **BLOCKED** — surface UX/A11Y (13.16–13.27). |
| `src/utils/paintFilter.ts` | 334 | **BLOCKED** — sélection des couleurs en amont de `AI-001`. Pourrait contenir un second filtrage par catégorie. |
| `app/api-key.tsx` | 192 | **BLOCKED** — vestige « bring your own key », atteignabilité non établie. |
| 41 fichiers de migration | ~4 700 | Justifié : l'autorité est l'état déployé, et les corps live des fonctions critiques ont été extraits directement. |
| `src/theme/*`, `Icons.tsx`, assets SVG/PNG | ~900 | Justifié : sans effet sur la sécurité, l'argent ou la correction. |
| `src/constants/exampleAssets.ts`, `designSystem.ts` | ~300 | Justifié : données de présentation. |

## 2. Passe inconnues inconnues — ce qu'un attaquant motivé examinerait

Question posée telle que le cahier des charges l'exige : *comment obtenir des générations gratuites
en une semaine ?*

1. **Le cycle supprimer-recréer.** `delete-account` supprime `user_entitlements` ; `reserve_generation`
   octroie 10 tokens à tout compte qui en est dépourvu, **sans contrôle de device pour un compte non
   anonyme** (`E2`). C'est le chemin que j'exploiterais en premier. Il ne requiert aucune faille —
   seulement l'enchaînement de deux comportements corrects pris isolément. **Non testé.**
2. **`device_id` sur le web.** `geminiService.ts:236` : `web-${Math.random()...}` persisté en
   AsyncStorage. Vider le stockage du navigateur produit un nouveau device, donc 10 tokens. Le
   `UNIQUE` sur `device_id` ne protège que contre la réutilisation, pas contre la fabrication.
3. **La course, combinée à l'absence de plafond.** Non pas pour voler des crédits, mais pour
   **épuiser votre budget PoYo** : 8 réservations concurrentes par requête, aucune limite pour les
   comptes authentifiés, aucun plafond global. Le dommage n'est pas le vol, c'est la facture.
4. **`x-forwarded-for` fabriqué.** `getClientIp` prend le premier élément d'un en-tête fourni par le
   client. La limite anonyme s'annule en changeant une chaîne — et, via `DATA-001`, on peut en prime
   épuiser le quota d'une IP tierce.
5. **La fenêtre `reserved` sur le webhook ouvert.** `SEC-001` permet de forcer l'échec de tout job
   dont on connaît le `task_id` — donc de faire payer PoYo à la victime sans qu'elle reçoive rien,
   sans même être authentifié.
6. **Le dépôt public comme carte.** `origin/payment` publie l'architecture complète des crédits, les
   noms de RPC et les branches d'octroi — dans leur version **pré-durcissement**. Le coût de
   découverte de tout ce qui précède est nul.

## 3. Passe autocritique — où cet audit est le plus faible

- **La Phase 9 est essentiellement non faite.** Aucune mesure de performance, aucun test
  d'accessibilité. Le **slider erratique** que vous avez signalé n'a pas été diagnostiqué. C'est la
  lacune la plus visible pour vous.
- **`ECON-001` reste une hypothèse.** Le finding le plus lourd de la Phase 4 n'a pas de preuve
  exécutée. Je l'ai signalé partout, mais il pèse au même rang que des findings démontrés dans un
  tableau récapitulatif — c'est une faiblesse de présentation autant que de preuve.
- **Toute la Phase 5 dépend de sources externes** que je n'ai pas. La table de marge — artefact
  central attendu de `AUDIT_MONEY.md` — **n'existe pas**. Je n'ai que des estimations sous
  hypothèses non vérifiées, explicitement marquées comme telles.
- **L'UX a été traitée par déduction, pas par usage.** Je n'ai pas lancé l'application. Les
  conclusions UX reposent sur des noms de composants — c'est du *pattern matching*, et je le déclare.
- **`AI-001` est solide sur le mécanisme, non vérifié sur l'effet.** J'ai prouvé que la catégorie
  n'atteint pas le prompt. Je n'ai **pas** vérifié qu'un lavis rendu en aplat est effectivement
  perceptible sur une image générée : cela demanderait de générer et de comparer.
- **Je n'ai pas lu 41 fichiers de migration.** J'ai extrait les corps live des fonctions critiques,
  ce qui est plus fiable — mais une migration peut avoir créé un trigger, une vue ou un droit que je
  n'ai pas énuméré. J'ai vérifié les triggers (1 seul) et les contraintes (9) ; **je n'ai pas
  énuméré les vues**.

## 4. Passe audit des preuves — révisions appliquées

Relecture des 19 findings contre §2B. **Quatre rétrogradations.**

| Finding | Avant | Après | Motif |
|---|---|---|---|
| `ECON-001` | P0 Confirmed | **P0 `Likely` + `BLOCKED`** | §2B.4 : une course exige un test exécuté. Je disposais de deux vérifications de Classe C (absence de verrou, contraste avec les fonctions qui verrouillent) — insuffisant pour une course. |
| `PERF-001` | P2 Confirmed | **P2 `Likely` + `BLOCKED`** | §2B.4 : aucune affirmation de performance sans mesure. Je n'ai qu'un compte de lignes et une absence de `lazy`. |
| `BILL-003` (non-2xx sur erreur) | P2 | **P3, fondu dans `AUDIT_MONEY` §6** | Falsification réussie : l'idempotence désormais correcte rend un rejeu inoffensif. Le défaut se réduit à un mauvais étiquetage. |
| `SEC-001` variante « temps constant » | P2 autonome | **absorbé dans `SEC-001`** | La falsification a révélé qu'il n'y a **aucune** comparaison dans la version déployée. Le finding initial décrivait un code non déployé. |

**Contrôles de conformité, finding par finding :**

- **Deux classes différentes :** 19/19. ✅
- **Classe B ou C obligatoire pour SEC/AUTHZ/BILL/ECON :** 11/11 conformes. `SEC-001` et
  `AUTHZ-001` portent une Classe B exécutée ; les autres une Classe C sur corps live ou schéma.
- **Falsification documentée :** 19/19, avec au minimum deux tentatives réelles. Trois falsifications
  ont **réussi** et modifié le résultat : `ADMIN-001` (aucune capacité de crédit admin n'existe →
  sévérité abaissée), `SAFETY-002` (usage nominatif des marques de peinture distingué → périmètre
  réduit à deux chaînes), `BILL-003` (rétrogradé).
- **Live-vs-repo tranché pour chaque claim SQL :** oui. Corps live extraits pour
  `reserve_generation`, `authorize_generation`, `confirm_generation`, `release_generation`,
  `complete_poyo_job`, `is_admin`, `handle_new_user`, `get_usage_stats`, `get_monthly_usage`,
  `get_provider_config`. Une divergence dépôt↔déploiement documentée séparément (`OPS-001`).
- **Rétrogradations : 4.** Un audit qui n'en produit aucune n'a probablement pas appliqué la norme.
