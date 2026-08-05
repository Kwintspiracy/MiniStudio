# MiniStudio — Findings

Findings établis selon la norme de preuve §2B. Triés par sévérité.
Autorité : **état déployé** (projet `gmbhkvpcebnwnzygcedi`), corroboré par le dépôt.

---

## SEC-001 — Le webhook PoYo déployé n'a **aucune authentification** : un tiers non authentifié peut piloter la RPC de débit de crédits

```
ID:           SEC-001
TITLE:        Le récepteur de callback PoYo déployé accepte toute requête non
              authentifiée et exécute complete_poyo_job avec les droits
              service_role. Le code d'authentification n'existe que dans le
              dépôt et n'a jamais été déployé.
CATEGORY:     SEC
SEVERITY:     P0
CONFIDENCE:   Confirmed
EFFORT:       S  (redéploiement + configuration d'un secret — mais voir DEPENDENCIES)
MONEY IMPACT: Direct revenue loss (débit forcé du solde d'un utilisateur)
              + Direct cost exposure (surface de calcul non authentifiée)
LOCATION:     Edge function déployée `poyo-webhook` v6 (updated_at 2026-01-30).
              Contrepartie dépôt divergente : supabase/functions/poyo-webhook/index.ts:36-51
```

### VERIFICATION 1 — [Classe C : état déployé]

Source **déployée** récupérée via `get_edge_function(project_id, 'poyo-webhook')`.
Le corps intégral du handler, entre le préflight CORS et le `try`, est :

```js
Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    log.info('═══════════════════════════════════════════════════════');
    log.info('Received PoYo callback');

    try {
        // Parse callback payload
        const payload = await req.json();
```

**Il n'y a aucune ligne intermédiaire.** La constante `POYO_WEBHOOK_SECRET` est absente du fichier
déployé ; `req.headers.get('Authorization')` n'y apparaît nulle part. Les en-têtes CORS déployés sont
`'Access-Control-Allow-Origin': '*'` en dur.

Métadonnées de la fonction : `verify_jwt: false`, `version: 6`, `updated_at: 1769742995412`
(= 2026-01-30). Aucun contrôle au niveau passerelle non plus.

### VERIFICATION 2 — [Classe B : exécuté]

Requête POST réelle, **sans aucun en-tête `Authorization`**, le 2026-08-05 :

```
$ curl -s -i -X POST 'https://gmbhkvpcebnwnzygcedi.supabase.co/functions/v1/poyo-webhook' \
    -H 'Content-Type: application/json' \
    -d '{"data":{"task_id":"audit-probe-nonexistent-20260805","status":"audit-probe-no-op","files":[]}}'

HTTP/1.1 200 OK
x-served-by: supabase-edge-runtime
sb-request-id: 019fd092-612f-7c92-88e5-e45546f39ffa

{"received":true,"error":"job_not_found","success":false,"task_id":"audit-probe-nonexistent-20260805"}
```

Le corps de réponse `job_not_found` **provient de la RPC `complete_poyo_job`** : la requête non
authentifiée a donc traversé la fonction *et* atteint la base avec les droits `service_role`.

### VERIFICATION 3 — [Classe B : témoin négatif]

Requête strictement analogue sur la fonction sœur, également `verify_jwt: false` :

```
$ curl -s -i -X POST '.../functions/v1/revenuecat-webhook' \
    -H 'Content-Type: application/json' -d '{"event":{"type":"AUDIT_PROBE_NOOP","app_user_id":null}}'

HTTP/1.1 401 Unauthorized
```

Ce témoin élimine l'hypothèse d'une protection implicite de la plateforme : sur ce projet, avec la
même configuration de passerelle, un webhook **qui contrôle** répond 401. Le 200 de `poyo-webhook`
traduit donc bien une absence de contrôle propre à cette fonction, et non une particularité
d'infrastructure.

### FALSIFICATION — quatre tentatives, toutes infructueuses

1. **« La passerelle Supabase impose une authentification. »**
   *Réfuté par V2 + V3.* `verify_jwt: false` est lu dans les métadonnées déployées, et une requête
   dépourvue de tout en-tête d'authentification obtient 200 avec exécution effective de la RPC.
   Le témoin RevenueCat prouve que la passerelle n'ajoute rien.

2. **« La version du dépôt (qui contient bien le contrôle) est celle qui est déployée ; ma lecture
   est périmée. »**
   *Réfuté.* Le fichier déployé a été lu directement, pas déduit. La chronologie le corrobore
   indépendamment : `git log -S "POYO_WEBHOOK_SECRET"` situe l'ajout du contrôle aux commits
   `997e547` (2026-02-25, variante *fail-open*) et `58e8056` (2026-03-01, variante *fail-closed*),
   tous deux **postérieurs** au `updated_at` de la fonction (2026-01-30). La fonction n'a jamais été
   redéployée depuis l'écriture du correctif.

3. **« `complete_poyo_job` porte son propre contrôle d'autorisation, ce qui rend l'ouverture
   inoffensive. »**
   *Réfuté par lecture de la définition live* (`pg_get_functiondef`). La fonction commence par
   `SELECT * INTO v_job FROM public.generation_jobs WHERE poyo_task_id = p_task_id AND status =
   'reserved' FOR UPDATE;` — **aucun `auth.uid()`, aucun contrôle d'appartenance**. C'est une
   exception notable : `reserve_generation`, `confirm_generation` et `release_generation` portent
   toutes, elles, un `IF auth.uid() IS NULL OR ...`.

4. **« La révocation d'`EXECUTE` sur `complete_poyo_job` (migration `revoke_server_only_rpcs`,
   appliquée) neutralise le problème. »**
   *Réfuté.* La révocation vise les rôles `anon` et `authenticated`
   (`has_function_privilege` = false pour les deux, vérifié). Or la fonction edge instancie son
   client avec `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`, pour lequel `has_function_privilege
   ('service_role', …, 'EXECUTE')` = **true**. Le durcissement de juillet ne couvre pas ce chemin :
   il ferme la porte des clients, pas celle du webhook ouvert.

### LIVE-VS-REPO

**Divergence, et c'est le cœur du finding.**

| Source | Authentification |
|---|---|
| `poyo-webhook` **déployée** v6 (2026-01-30) | **aucune** |
| Dépôt, commit `997e547` (2026-02-25) | présente mais ***fail-open*** : `if (POYO_WEBHOOK_SECRET) { … } else { log.info('WARNING: … not secured!') }` |
| Dépôt, commit `58e8056` (2026-03-01) — état actuel du working tree | présente et *fail-closed* (`index.ts:37-50`) |

`complete_poyo_job` : définition live récupérée et diffée avec le fichier local non commité
`supabase/migrations/20260629000000_poyo_log_model_used.sql` — **corps identique**. Le fichier local
n'est pas la source appliquée (la migration live s'appelle `20260629020912`), mais le résultat
concorde. Aucune dérive sur la RPC elle-même.

### IMPACT

`complete_poyo_job` est atteignable par quiconque sur Internet, sans compte, sans clé. Pour un job
dont l'attaquant connaît le `poyo_task_id` et qui se trouve en statut `reserved` :

- **Complétion forgée** : `status:'finished'` + `p_image_url` arbitraire →
  `UPDATE user_entitlements SET purchased_balance = purchased_balance - cost_units`
  **(le solde de la victime est débité)**, `generation_jobs.result_image_url` prend l'URL choisie par
  l'attaquant, et une ligne est écrite dans `generation_logs`. Le client télécharge puis affiche
  cette URL (`geminiService.ts:434-437`, `FileSystem.downloadAsync(job.result_image_url, …)`) :
  **l'attaquant choisit l'image que la victime reçoit, et la victime paie pour elle.**
- **Échec forgé** : toute autre valeur de `status` → job marqué `failed`. Déni de service ciblé.
- **Surface non authentifiée** : appels illimités, sans limitation de débit, exécutant du code Deno
  et une requête `FOR UPDATE` en base à chaque fois.

**Facteurs limitants, énoncés honnêtement.** L'exploitation ciblée suppose de connaître un
`poyo_task_id` **et** que le job soit dans la fenêtre `reserved`.

**La devinabilité du `task_id` est désormais évaluée** (Classe D, console PoYo du 2026-08-05) :
les identifiants observés — `M34GCSJBAMCLY1EE`, `XG8V9UZEU2VU2XUT`, `TSMXK1QRX0BCIQWV`,
`QH4YVU6H91VRFHE2` — font **16 caractères alphanumériques majuscules**, soit ≈ 36¹⁶ ≈ 8 × 10²⁴
combinaisons. **Le forçage brut est hors de portée.** C'est un facteur atténuant réel, et il faut le
dire : l'attaque ciblée exige d'**observer** un `task_id`, non de le deviner.

Cela ne referme pas le finding. La console montre par ailleurs un bouton **« Retry Callback »** :
les `task_id` sont visibles et rejouables depuis le tableau de bord PoYo. Et surtout, la sévérité ne
tient pas au scénario ciblé mais au fait qu'**un endpoint non authentifié exécute une RPC
`service_role` sur vos soldes**, exposé à Internet, sans limitation de débit.

Enfin, la fenêtre `reserved` dure ici **35 à 110 secondes** (durées observées en console), et non
quelques instants.
À la date de l'audit, la base compte **0 job en statut `reserved`** et **un seul utilisateur réel**.
La sévérité P0 découle de la nature du chemin — écriture non authentifiée sur les soldes depuis
Internet — et non du volume actuel, qui est un accident de calendrier et non un contrôle.

### REPRO

Exécuté le 2026-08-05, reproductible tel quel (aucun effet de bord : `task_id` inexistant, et
`complete_poyo_job` ne réalise **aucune écriture** sur le chemin `job_not_found` — vérifié sur la
définition live avant exécution) :

```bash
curl -i -X POST 'https://gmbhkvpcebnwnzygcedi.supabase.co/functions/v1/poyo-webhook' \
  -H 'Content-Type: application/json' \
  -d '{"data":{"task_id":"<any>","status":"noop","files":[]}}'
# → 200 OK, {"received":true,"error":"job_not_found",...}
```

### VERIFICATION 4 — [Classe E : documentation du fournisseur] — **Q9 TRANCHÉE**

`https://docs.poyo.ai/api-manual/task-management/webhooks`, consultée le 2026-08-05 :

> **PoYo n'envoie pas d'en-tête `Authorization` configurable.** L'authentification est par signature.
>
> En-têtes émis : `Content-Type: application/json`, `X-Webhook-Timestamp: 1783680000`,
> `X-Webhook-Signature: base64_hmac_sha256_signature`
>
> Règle de signature : `base64(HMAC-SHA256(task_id + "." + timestamp, webhook_hmac_key))`
> Clé de signature : `GET /api/api-keys/webhook-secret` · rotation :
> `POST /api/api-keys/webhook-secret/rotate`
> « *Validate X-Webhook-Timestamp and X-Webhook-Signature before processing callbacks.* »
> Horodatage rejeté au-delà de **300 secondes**.
> Reprises : « *Up to 5 automatic retries* », backoff exponentiel de ~60 s plafonné à 10 minutes.

**Conséquence décisive, et elle confirme l'avertissement de séquencement :** la version *fail-closed*
du dépôt compare `authHeader !== \`Bearer ${POYO_WEBHOOK_SECRET}\``. PoYo **n'émet jamais** cet
en-tête. **Un redéploiement du fichier du dépôt rejetterait 100 % des callbacks légitimes** avec un
401. Ce n'est plus une hypothèse : c'est établi par la documentation du fournisseur.

**Note favorable au passage :** la politique de reprise (5 tentatives) rendrait l'idempotence du
callback critique — or `complete_poyo_job` exige `status = 'reserved'`, donc une reprise après
succès est un no-op. **Ce point est correct par construction.**

### RECOMMENDATION

**⚠️ Ne pas redéployer le fichier du dépôt. Il casserait toutes les générations.** Établi par la
documentation PoYo (V4) : le mécanisme attendu n'est pas un Bearer, c'est une signature HMAC.

Séquence correcte :

1. **Récupérer la clé de signature** : `GET /api/api-keys/webhook-secret` sur votre compte PoYo, et
   la stocker dans les secrets de l'edge function (par ex. `POYO_WEBHOOK_HMAC_KEY`).
2. **Remplacer le contrôle Bearer par la vérification de signature** dans `poyo-webhook` :
   - lire `X-Webhook-Timestamp` et `X-Webhook-Signature` ;
   - rejeter si `|now − timestamp| > 300 s` (rejeu) ;
   - recalculer `base64(HMAC-SHA256(task_id + "." + timestamp, key))` et comparer **en temps
     constant** (`crypto.subtle.timingSafeEqual` ou équivalent — ici la comparaison naïve serait un
     vrai défaut, contrairement au cas Bearer) ;
   - **`task_id` doit être extrait du corps avant vérification** : c'est une entrée de la signature.
     Ne rien faire d'autre du corps tant que la signature n'est pas validée.
3. **Déployer, puis vérifier sur un callback réel** que les générations aboutissent toujours —
   la boucle de reprise de PoYo (5 tentatives, jusqu'à 10 min) laisse une marge de correction si le
   déploiement est fautif, mais ne dispense pas de vérifier.
4. **Indépendamment** : valider `p_image_url` dans `complete_poyo_job` contre l'allowlist d'hôtes
   déjà définie pour la garde SSRF (`CONFIG.ALLOWED_SOURCE_IMAGE_HOSTS`,
   `generate-miniature/index.ts:22-23`). Cela supprime la variante « image choisie par l'attaquant »
   même si le contrôle d'accès venait à retomber.
5. **Atténuation immédiate, applicable aujourd'hui sans rien casser** : la fenêtre d'exploitation est
   l'état `reserved`. Expirer les jobs `reserved` au-delà de N minutes réduit cette fenêtre — mesure
   de toute façon requise par la réconciliation des jobs orphelins (10.07).
6. **Supprimer `POYO_WEBHOOK_SECRET`** des secrets une fois la bascule faite : il n'a jamais servi et
   sa présence entretiendrait la confusion.

### DEPENDENCIES

- **Q9 : résolue** (V4, Classe E). Le chemin de correction est désormais entièrement déterminé.
- Lié à `SEC-002` (URL attaquant-contrôlée persistée) : l'étape 4 le referme conjointement.
- Lié à `OPS-001` : ce P0 n'existe que parce qu'un correctif écrit le 2026-03-01 n'a jamais été
  déployé — et, on le voit maintenant, **ce correctif était de toute façon erroné**. Le contrôle de
  dérive aurait révélé la non-livraison ; seul un test d'intégration aurait révélé l'erreur de
  conception.

---

## CROSS-001 — La clé `service_role` de la base **partagée** est en clair dans l'historique git de MiniPainterDB, et elle est **toujours valide**

```
ID:           CROSS-001
TITLE:        La clé service_role du projet gmbhkvpcebnwnzygcedi a été commitée
              en clair dans MiniPainterDB, y compris comme clé du client
              React Native. Retirée de HEAD, elle reste lisible dans
              l'historique et n'a jamais été révoquée.
CATEGORY:     SEC
SEVERITY:     P0
CONFIDENCE:   Confirmed
EFFORT:       S  (rotation) — XL si l'on veut aussi purger l'historique
MONEY IMPACT: Direct revenue loss + Direct cost exposure
              (contrôle total des soldes ; accès à private.poyo_api_keys)
LOCATION:     D:\APPS\MiniPainterDB — commit 3e01431 (2026-01-01),
              fichiers lib/supabase.ts et REBUILD_INSTRUCTIONS.md
```

### VERIFICATION 1 — [Classe A : statique, sur l'historique git]

`git log --all -S<signature>` sur le dépôt MiniPainterDB retourne deux commits :

| Commit | Date | Auteur | Rôle |
|---|---|---|---|
| `3e01431` | 2026-01-01 | Quentin Beau de Loménie | *Initial commit* — **introduit** la clé |
| `f8f8a0e` | 2026-01-05 | Quentin Beau de Loménie | **retire** la clé au profit de variables d'environnement |

Contenu de `lib/supabase.ts` au commit `3e01431` :

```ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gmbhkvpcebnwnzygcedi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR…';   // ← JWT role:service_role

export const supabase = createClient(supabaseUrl, supabaseKey);
```

Le payload JWT, décodé :

```json
{"iss":"supabase","ref":"gmbhkvpcebnwnzygcedi","role":"service_role",
 "iat":1766371569,"exp":2081947569}
```

`ref` désigne **le projet partagé par les deux applications**. `exp` = 2081947569 ≈ **2035-12-19**.

La clé figure également dans `REBUILD_INSTRUCTIONS.md` du même commit, sous l'intitulé
`SUPABASE_KEY:` — c'est-à-dire **documentée comme la clé à employer** pour reconstruire
l'application.

État actuel : **absente de `HEAD` et du working tree** (vérifié par `git grep` et `grep -r`).
Elle demeure intégralement lisible dans l'historique.

### VERIFICATION 2 — [Classe C : état déployé — la clé est toujours valide]

Établi **sans jamais exercer la clé**, par provenance cryptographique partagée.

`get_publishable_keys(gmbhkvpcebnwnzygcedi)` retourne la clé `anon` légitime du projet :

```json
{"api_key":"eyJ…","name":"anon","type":"legacy","disabled":false,
 "description":"Legacy anon API key","id":"anon"}
```

Payload de cette clé `anon` : `{"iss":"supabase","ref":"gmbhkvpcebnwnzygcedi","role":"anon",
"iat":1766371569,"exp":2081947569}`.

**`iat` et `exp` sont identiques à ceux de la clé `service_role` divulguée.** Les deux ont donc été
émises au même instant, par le même secret JWT de projet, lors de la création du projet
(`created_at: 2025-12-22T02:46:09Z`).

Or les clés Supabase de type `legacy` sont des JWT signés par ce secret unique : **le rotationner les
invalide toutes simultanément.** La Management API rapporte la clé `anon` comme
`"disabled": false`, et cette même clé `anon` est en service dans
`D:\APPS\MiniStudio\app.json:78` — l'application génère jusqu'au 2026-08-02 (390 jobs).

Donc : `anon` valide ⟹ le secret JWT n'a pas été tourné ⟹ **la clé `service_role` divulguée est
encore valide**. Le raisonnement ne repose sur aucune utilisation de la clé compromise.

*Note de méthode : une vérification directe (requête REST en lecture seule portant la clé) a été
tentée puis **bloquée par le classificateur de sécurité de l'outillage**. Le contournement n'a pas
été cherché. La preuve ci-dessus s'en passe.*

### FALSIFICATION — trois tentatives, toutes infructueuses

1. **« La clé a été retirée, donc l'exposition est close. »**
   *Réfuté.* Le retrait (`f8f8a0e`) ne modifie que l'état de `HEAD`. `git show 3e01431:lib/supabase.ts`
   la restitue intégralement. Elle est présente dans tout clone, tout miroir, toute sauvegarde et sur
   toute machine ayant récupéré le dépôt depuis le 2026-01-01. Un `git filter-repo` ne
   « dé-divulguerait » rien : il empêcherait seulement de futures lectures.

2. **« Le dépôt est privé, donc personne n'a pu la lire. »**
   *Partiellement retenu, insuffisant.* `gh repo view` confirme `visibility: PRIVATE` et
   `forkCount: 0` **aujourd'hui**. Cela réduit fortement la probabilité d'exploitation, mais ne
   l'annule pas : la visibilité passée n'a pas pu être établie depuis l'API (**question ouverte Q12**),
   et le périmètre reste l'ensemble des postes, collaborateurs et sauvegardes ayant eu accès. La
   pratique établie veut qu'un identifiant commité soit traité comme compromis, indépendamment de la
   visibilité — précisément parce que cette hypothèse est invérifiable.

3. **« Elle n'a jamais atteint un bundle distribué. »**
   *Non réfuté, mais non établi, et le contraire est plausible.* Au commit `3e01431` la clé était
   l'argument de `createClient()` dans `lib/supabase.ts`, importé par au moins 9 modules d'écran
   (`app/(tabs)/index.tsx`, `library.tsx`, `stats.tsx`, `import.tsx`, `duplicates.tsx`,
   `app/auth.tsx`, `app/edit/[id].tsx`, `components/paint-details.tsx`,
   `providers/auth-context.tsx`). **Tout build produit entre le 2026-01-01 et le 2026-01-05
   embarquait donc la clé `service_role` dans le bundle**, où elle est triviale à extraire.
   Savoir si un tel build a été distribué relève de votre historique EAS / App Store —
   **question ouverte Q13**. En l'absence de réponse, la sévérité ne peut pas être abaissée.

### LIVE-VS-REPO

Sans objet (aucun objet SQL). L'état déployé a en revanche servi de **preuve de validité** (V2).

### IMPACT

La clé `service_role` **contourne intégralement RLS** et donne, sur la base partagée par les deux
applications, un accès lecture **et écriture** total :

| Cible | Ce que la clé permet |
|---|---|
| `user_entitlements` | lire et **écrire tous les soldes** — auto-crédit illimité |
| `private.poyo_api_keys` | **lire la clé API PoYo** → dépenser votre budget fournisseur |
| `generation_jobs`, `generation_logs` | lire **tous les prompts et toutes les images** de tous les utilisateurs |
| `profiles` | lire **les adresses e-mail** des 21 comptes |
| `paints`, `user_paints` | lire et **altérer les données réelles de MiniPainterDB** |
| API Admin `auth` | créer, supprimer des comptes, forger des sessions |
| `app_config`, `prompt_configs` | modifier le fournisseur, le modèle, les gabarits de prompt |

C'est le **rayon d'impact inter-applications** dans sa forme la plus directe : une clé divulguée par
MiniPainterDB donne un contrôle complet sur l'économie de crédits de MiniStudio, et réciproquement
sur les données des utilisateurs réels de MiniPainterDB.

Aggravant : **le *secret scanning* et la *push protection* GitHub sont désactivés**
(`security_and_analysis` → `secret_scanning: "disabled"`, `secret_scanning_push_protection:
"disabled"`). La push protection aurait bloqué ce commit précis à l'émission.

### REPRO

```bash
cd D:\APPS\MiniPainterDB
git show 3e01431:lib/supabase.ts | head -6
git show 3e01431:REBUILD_INSTRUCTIONS.md | grep -A2 SUPABASE_URL
```

Décodage du payload : `echo '<payload-base64url>' | base64 -d` →
`{"role":"service_role","ref":"gmbhkvpcebnwnzygcedi",…}`.

### RECOMMENDATION

Par ordre, **le point 1 est à faire aujourd'hui** :

1. **Tourner le secret JWT du projet** (Supabase → Settings → API → *JWT Secret* / rotation des clés
   legacy). C'est la seule action qui invalide réellement la clé divulguée.
   **⚠️ Conséquence à anticiper avant d'agir :** la rotation invalide **simultanément la clé `anon`**,
   qui est figée dans `app.json:78` de MiniStudio et dans les builds MiniPainterDB déjà installés.
   Toutes les applications déployées cesseront de fonctionner jusqu'à un nouveau build.
   **Séquence recommandée :** migrer d'abord les deux applications vers la clé *publishable*
   moderne déjà provisionnée sur le projet (`sb_publishable_U7OfeMgOJ0KQiRqdpnB3Jw_yWGecCo5`,
   rotationnable indépendamment), publier les builds, **puis** tourner le secret legacy.
   Compte tenu du volume réel — 1 utilisateur MiniStudio, 21 comptes au total — la fenêtre pour
   effectuer cette bascule proprement est encore ouverte. Elle se refermera au lancement.
2. **Activer *secret scanning* et *push protection*** sur les deux dépôts. Coût nul, empêche la
   récidive.
3. **Après rotation, tourner aussi la clé API PoYo** : elle était lisible via `private.poyo_api_keys`
   par tout porteur de la clé `service_role`. Elle doit être considérée comme compromise par
   dérivation.
4. **Purger l'historique** (`git filter-repo`) : utile pour l'hygiène, **sans effet sur l'exposition
   déjà réalisée**. À faire après la rotation, jamais à sa place, et jamais présenté comme le
   correctif.
5. **Ne pas se contenter de rendre les dépôts privés.** MiniPainterDB l'est déjà et la clé y était
   quand même.

### DEPENDENCIES

- **Bloque** toute conclusion rassurante sur RLS. Tant que cette clé vit, la qualité des politiques
  RLS est un point discutable : un porteur de `service_role` les ignore toutes. Les findings AUTHZ
  doivent être lus sous cette réserve.
- Lié à `SEC-001` : ces deux P0 partagent une cause unique — **du code écrit et du code déployé qui
  divergent sans que rien ne le détecte**.
- Questions ouvertes **Q12** (MiniPainterDB a-t-il déjà été public ?) et **Q13** (un build a-t-il été
  distribué entre le 2026-01-01 et le 2026-01-05 ?). Aucune ne peut relever la sévérité ; une réponse
  positive à l'une ou l'autre en aggraverait l'urgence.

---

## AI-001 — MiniStudio ignore la catégorie de peinture : **2 826 des 2 956 références sont rendues comme des aplats opaques**, y compris 78 métalliques, 140 lavis et 254 contrast

```
ID:           AI-001
TITLE:        Le client ne récupère jamais la colonne product_type. Le générateur
              de prompt ne discrimine que sur `finish === 'Metallic'`, champ NULL
              pour 96 % du catalogue. La remédiation LOGIC-001 appliquée en base
              le 2026-07-31 n'atteint pas la génération d'images.
CATEGORY:     AI
SEVERITY:     P1
CONFIDENCE:   Confirmed
EFFORT:       S   (ajouter la colonne à la requête + brancher le générateur)
MONEY IMPACT: None (directement) — mais chaque génération incorrecte est un token
              consommé pour un résultat que le public cible juge faux : churn.
LOCATION:     src/services/paintService.ts:25 ; src/utils/promptGenerator.ts:54-60,131-168
```

### VERIFICATION 1 — [Classe A : statique, code client]

`src/services/paintService.ts:25` — liste **exhaustive** des colonnes demandées à `paints` :

```ts
const PAINT_COLUMNS = 'id,brand,set,name,hex,hue,saturation,lightness,code,is_discontinued,r,g,b,finish';
```

`product_type` **n'y figure pas**. Cette constante est l'unique projection utilisée par les quatre
fonctions d'accès (`fetchAllPaints`, `fetchUserPaints`, `fetchPaintsByBrand`, `searchPaints`,
lignes 50, 91, 117, 132). L'interface TypeScript `PaletteColor` (l. 1-16) ne déclare pas non plus le
champ : la catégorie n'existe nulle part côté client.

`src/utils/promptGenerator.ts:53-61` — **seule** logique de catégorisation du fichier :

```ts
if (selectedColors.length > 0) {
    standardColorsList = selectedColors
        .filter(c => c.finish !== 'Metallic')
        .map(c => `${c.name}: ${c.hex}`);

    metallicColorsList = selectedColors
        .filter(c => c.finish === 'Metallic')
        .map(c => `${c.name}: ${c.hex}`);
}
```

Tout ce qui n'est pas `finish === 'Metallic'` est émis en `Nom: #hex` sous `[STRICT PALETTE]`
(l. 156-161) — c'est-à-dire **comme une couleur opaque et plate**. Aucune autre occurrence de
`wash`, `contrast`, `shade`, `translucent` ou `opacity` dans le fichier (recherché sur l'intégralité
des 196 lignes).

### VERIFICATION 2 — [Classe C : état déployé, données réelles]

Distribution live de `public.paints` (2 956 lignes), croisant la colonne **lue** par MiniStudio
(`finish`) et celle qui porte réellement la catégorie (`product_type`) :

| `product_type` | `finish` | lignes | Rendu par MiniStudio |
|---|---|---:|---|
| opaque | NULL | 1 553 | aplat — *correct* |
| airbrush | NULL | 609 | aplat |
| **contrast** | NULL | **254** | **aplat — faux** |
| **wash** | NULL | **140** | **aplat — faux** |
| metallic | Metallic | 127 | métallique — *correct* |
| technical | NULL | 119 | aplat |
| **metallic** | **NULL** | **78** | **aplat — faux** |
| primer | NULL | 63 | aplat |
| fluorescent | NULL | 7 | aplat |
| opaque | Matte | 3 | aplat — *correct* |
| technical | Metallic | 2 | métallique |
| airbrush | Matte | 1 | aplat |

**`finish` est NULL sur 2 823 des 2 956 lignes (95,5 %).** `product_type`, lui, est renseigné
partout. La donnée existe ; elle n'est simplement jamais demandée.

### FALSIFICATION — trois tentatives

1. **« La catégorie est peut-être réinjectée plus loin, côté edge ou dans les gabarits en base. »**
   *Réfuté.* Le prompt assemblé côté client est transmis tel quel :
   `generate-miniature/index.ts:663` applique `sanitizeServerSide(prompt)` — un simple filtrage de
   caractères de contrôle (`replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')`, l. 520-523) — puis
   l'envoie à PoYo sans réécriture. Aucune requête à `paints` n'existe dans l'edge function.

2. **« `finish` est peut-être l'équivalent sémantique de `product_type`, sous un autre nom. »**
   *Réfuté par les données.* Si c'était le cas, les 205 lignes `product_type='metallic'` porteraient
   toutes `finish='Metallic'`. **78 d'entre elles ont `finish = NULL`** — soit 38 % des métalliques
   invisibles au seul critère utilisé. Les deux colonnes ne sont pas redondantes : `finish` est
   lacunaire, `product_type` est complet.

3. **« Le bloc `[Metallics]` et l'instruction TMM compensent peut-être. »**
   *Réfuté, et l'inverse est vrai.* Le bloc métallique
   (`promptGenerator.ts:164-168`) n'est alimenté que par `metallicColorsList`, donc uniquement par
   les 129 lignes à `finish='Metallic'`. Les 78 métalliques à `finish` NULL **rejoignent la liste
   standard**, où elles reçoivent l'instruction inverse : rendu en aplat.

### LIVE-VS-REPO

Sans objet côté SQL. À noter cependant : `logic001_populate_product_type` et
`logic001_category_aware_matching` sont **appliquées en base** (2026-07-31) mais **n'ont aucun
fichier dans le dépôt MiniStudio**. La correction a été portée côté données et côté appariement
(MiniPainterDB) ; le consommateur MiniStudio n'a pas été mis à jour, et rien dans son dépôt ne
signale que la colonne existe désormais.

### IMPACT

C'est la **propagation de `LOGIC-001`** que la mission demandait d'évaluer explicitement — et elle
est réelle, mais pas là où on l'attendait. L'appariement a été corrigé ; **c'est le chemin de
génération d'images qui reste aveugle à la catégorie**.

Pour le public visé, chacun de ces cas est immédiatement identifiable :

- **140 lavis** (*wash / shade*) : produits translucides dont le rendu dépend entièrement de la
  surface sous-jacente. Émis comme `Nom: #hex`, le modèle les peint en couche opaque. Un Nuln Oil
  rendu en gris uniforme au lieu d'un jus qui se loge dans les creux.
- **254 contrast / speedpaint** : conçues pour créer un dégradé depuis un seul pot, en s'accumulant
  dans les récessions. Rendues en aplat, tout l'effet disparaît.
- **78 métalliques** : perdent la goniochromaticité et deviennent un gris plat — le défaut le plus
  visible de tous pour un peintre de figurines.
- **63 primers, 119 technical** (pâtes de texture, effets de sang, rouille) : traités comme des
  peintures ordinaires.

La promesse produit — un lien réel entre le catalogue de peintures et l'image générée — n'est donc
tenue que pour la **valeur colorimétrique** (`hex` est bien transmis, ce qui est un point positif :
voir 12.01, PASS) et **pas** pour le comportement du produit. Sur ce point, la connexion au catalogue
est décorative.

### REPRO

```sql
-- La donnée existe et est complète :
SELECT product_type, count(*) FROM public.paints GROUP BY 1 ORDER BY 2 DESC;
-- Le champ effectivement lu par le client est vide dans 95,5 % des cas :
SELECT count(*) FILTER (WHERE finish IS NULL) AS finish_null, count(*) FROM public.paints;
```

```bash
grep -n "PAINT_COLUMNS" src/services/paintService.ts     # product_type absent
grep -n "finish" src/utils/promptGenerator.ts            # unique critère de catégorie
```

### RECOMMENDATION

1. **Ajouter `product_type` (et `opacity`) à `PAINT_COLUMNS`** (`paintService.ts:25`) et au type
   `PaletteColor`. Coût : une ligne. ⚠️ Penser à **invalider le cache `paints_cache`**
   (`paintService.ts:21-23`, TTL 24 h) : sans bump de clé, les clients existants continueront de
   servir un cache dépourvu de la colonne pendant une journée.
2. **Brancher le générateur sur `product_type`**, avec un bloc dédié par catégorie plutôt qu'une
   liste unique. La structure `[STRICT PALETTE]` s'y prête déjà : il suffit d'ajouter des en-têtes
   frères de `[Metallics]` — `[Washes] (translucent glaze, pools in recesses, underlying colour
   shows through)`, `[Contrast] (single-coat gradient, pigment settles in recesses)`, etc.
3. **Conserver `finish` comme signal secondaire**, jamais comme critère primaire — sa complétude est
   de 4,5 %.
4. **Verrouiller par un test de non-régression** : un jeu doré de N peintures couvrant les 8
   `product_type`, dont on vérifie que le prompt assemblé contient bien le bloc attendu. C'est un
   test unitaire pur sur `generatePaintPrompt`, sans appel réseau ni fournisseur — le premier test du
   dépôt, et le moins cher à écrire.

### DEPENDENCIES

Aucune. Corrigeable indépendamment des deux P0.
Lié à `12.04` (qualité des gabarits) : à traiter au même moment, les deux touchent
`promptGenerator.ts`.

---

## AUTHZ-001 — Trois RPC de consommation sont appelables par tout compte authentifié pour **n'importe quel `user_id`**

```
ID:           AUTHZ-001
TITLE:        get_monthly_usage, get_monthly_flash_usage et get_usage_stats sont
              SECURITY DEFINER, exécutables par le rôle `authenticated`, prennent
              un user_id en paramètre et ne vérifient jamais qu'il correspond à
              l'appelant.
CATEGORY:     AUTHZ
SEVERITY:     P2
CONFIDENCE:   Confirmed
EFFORT:       XS  (trois gardes d'une ligne)
MONEY IMPACT: None (fuite de métadonnées, pas de mutation)
LOCATION:     RPC live public.get_monthly_usage / get_monthly_flash_usage / get_usage_stats
```

### VERIFICATION 1 — [Classe C : état déployé]

Corps live via `pg_get_functiondef` / `pg_proc.prosrc` :

```sql
-- get_monthly_usage(check_user_id uuid)  — SECURITY DEFINER
select coalesce(sum(cost_units), 0)::int
from public.generation_logs
where user_id = check_user_id
and created_at >= date_trunc('month', now());
```

Le paramètre est utilisé **directement** comme filtre. Aucune occurrence d'`auth.uid()` dans les
trois corps (vérifié par `prosrc ILIKE '%auth.uid()%'` → `false` pour les trois).

Droits live : `has_function_privilege('authenticated', …, 'EXECUTE')` = **true** pour les trois.

### VERIFICATION 2 — [Classe B : exécuté]

Session positionnée sur le rôle `authenticated` avec une identité **inexistante**
(`00000000-0000-0000-0000-0000000000ff`), puis lecture des données d'un **autre** utilisateur.
Aucune écriture — les trois fonctions sont en lecture pure.

```sql
select set_config('request.jwt.claims','{"sub":"00000000-…-ff","role":"authenticated"}',false);
set role authenticated;
select auth.uid(), get_monthly_usage('6643672b-…'), get_usage_stats('6643672b-…');
```

Résultat obtenu :

```json
{"je_suis":"00000000-0000-0000-0000-0000000000ff",
 "conso_mensuelle_dautrui":7,
 "conso_flash_dautrui":0,
 "stats_dautrui":{"basic_used":0,"basic_limit":50,"is_unlimited":false,
                  "premium_used":7,"premium_limit":10}}
```

Une identité qui n'existe pas dans `auth.users` a lu la consommation mensuelle et le statut
d'abonnement d'un tiers.

### FALSIFICATION — deux tentatives

1. **« La RLS de `generation_logs` protège de toute façon. »**
   *Réfuté.* La politique `Users can read own logs` (`USING (auth.uid() = user_id)`) existe bien,
   mais les fonctions sont `SECURITY DEFINER` : elles s'exécutent avec les droits du propriétaire et
   **contournent la RLS par construction**. C'est précisément ce que l'exécution démontre.

2. **« Le rôle `anon` n'y a pas accès, donc la surface est nulle. »**
   *Réfuté.* `has_function_privilege('anon', …)` est bien `false`, mais **les utilisateurs anonymes
   Supabase portent le rôle Postgres `authenticated`**, pas `anon`. Or MiniStudio crée une session
   anonyme automatiquement au démarrage (`app/index.tsx:20-21`, `AuthContext`). N'importe qui
   ouvrant l'application obtient donc, sans inscription, le niveau de privilège suffisant.

### LIVE-VS-REPO

Définitions live extraites et comparées : `get_usage_stats` provient de
`20260111174500_add_usage_stats_rpc.sql` / `20260121164500_fix_authorize_generation_return.sql`.
La migration `20260131230000_secure_rpcs.sql` a ajouté des gardes `auth.uid()` à
`reserve_generation`, `confirm_generation` et `release_generation` — **mais pas à ces trois-ci.**
Elles ont été oubliées lors du durcissement, et rien depuis ne les a reprises.

### IMPACT

Fuite de métadonnées, pas de mutation ni de contenu. Un attaquant connaissant un `user_id`
apprend : volume de générations du mois, répartition basic/premium, statut `is_unlimited`, et les
plafonds personnalisés éventuels.

**Facteur limitant, décisif pour la sévérité :** l'attaque suppose de connaître l'UUID de la cible.
Les UUID v4 ne sont pas énumérables, et les RPC qui les exposeraient (`get_admin_users_list`) sont
correctement gardées par `is_admin()` (vérifié : les 11 fonctions `admin_*`/`get_admin_*` portent
toutes cette garde). Aucun chemin de découverte d'UUID n'a été identifié à ce stade — ce qui
maintient le finding en P2 et non au-dessus. **Cette absence n'est pas une preuve** : elle est à
reprendre lors du balayage IDOR complet (§7.01), où un chemin de fuite d'UUID transformerait cette
sévérité.

### RECOMMENDATION

Ajouter en tête de chacune des trois fonctions la garde déjà employée ailleurs dans ce même schéma :

```sql
IF auth.uid() IS NULL OR (auth.uid() != p_user_id AND current_user != 'service_role') THEN
  RAISE EXCEPTION 'unauthorized';
END IF;
```

Alternative plus robuste, puisque ces fonctions n'ont aucune raison légitime de servir un autre
utilisateur : **supprimer le paramètre** et filtrer sur `auth.uid()` directement, comme le fait déjà
`get_user_status()`. Cela supprime la classe de bug plutôt que ce cas précis.

⚠️ `get_usage_stats` est appelée avec un paramètre depuis le client
(`src/hooks/useEntitlements.ts` / `useCamera.ts` à vérifier) : la signature doit être maintenue
le temps d'un cycle de publication, ou la garde ajoutée sans changer la signature.

### DEPENDENCIES

Aucune. Correctif XS, indépendant.
À noter : `get_provider_config()` est également dépourvue de garde et lisible par tout compte
authentifié — elle n'expose que `primary_provider`, `fallback_enabled` et `poyo_model`. Traité
séparément en P3 (`INFO-001`, à rédiger).

---

## SAFETY-001 — **Aucune modération de contenu, d'aucune sorte**, sur un service qui accepte des photos téléversées par les utilisateurs

```
ID:           SAFETY-001
SEVERITY:     P0        CONFIDENCE: Confirmed        EFFORT: L
CATEGORY:     SAFETY    MONEY IMPACT: None (exposition juridique, non monétaire)
LOCATION:     architectural — absence, pas de localisation unique.
              Pipeline concerné : app/camera.tsx → src/hooks/useImagePicker.ts →
              src/services/geminiService.ts:242 → generate-miniature → PoYo.ai
```

### VERIFICATION 1 — [Classe A : recherche exhaustive du code]

Recherche insensible à la casse sur `app/`, `src/` et `supabase/functions/`, portant sur :
`moderat`, `nsfw`, `csam`, `safety`, `safetySetting`, `harmCategory`, `blocklist`, `banned word`,
`content filter`, `age gate`, `report abuse`, `takedown`.

**Une seule correspondance sur l'ensemble du dépôt** :

```
src/services/paintService.ts:67:    // Safety break to prevent infinite loops
```

— un commentaire sur une boucle de pagination. Aucun autre résultat.

Les deux « sanitizers » existants sont des **filtres de caractères, pas des filtres de contenu** :

```ts
// src/utils/sanitization.ts
sanitized = sanitized.replace(/[\[\]{}<>`]/g, '');
sanitized = sanitized.split('\n')
  .filter(line => !/^\s*(#|SYSTEM\s*:|IGNORE|OVERRIDE)/i.test(line)).join('\n');
sanitized = sanitized.replace(/[^\w\s.,?!'"\-\n]/g, '');
```

Ils retirent des crochets et quelques marqueurs d'injection. Une demande formulée en français ou en
anglais courant les traverse intégralement. Côté serveur,
`generate-miniature/index.ts:520-523` n'ajoute qu'un `replace` de caractères de contrôle.

**Aucun contrôle n'est appliqué à l'image téléversée**, à aucun moment : ni côté client
(`useImagePicker.ts`, `useCamera.ts`), ni côté edge (le champ `baseImage` est transmis tel quel à
`uploadToPoyo`, l. 96-124), ni après génération.

### VERIFICATION 2 — [Classe C : état déployé]

Corroboré côté infrastructure : aucune table, aucune colonne, aucune RPC de modération n'existe.
Les 11 tables live sont `paints`, `user_paints`, `prompt_configs`, `user_entitlements`,
`generation_logs`, `app_config`, `generation_jobs`, `provider_health`, `device_tokens`, `profiles`,
`processed_webhook_events` — aucune ne porte de statut de modération, de signalement ou de
vérification d'âge. Les 40 RPC live ne comportent aucune fonction de ce type.
Le seul provider appelé en production est PoYo (`primary_provider='poyo'`), dont les réglages de
sécurité ne sont pas configurés par l'application : `submitPoyoTask` (l. 177-192) envoie
`{model, input:{prompt, size}, callback_url}` — **aucun paramètre de sécurité**.

### FALSIFICATION — trois tentatives

1. **« Le fournisseur modère à notre place. »** *Non établi et non exploitable comme défense.*
   Aucune configuration de sécurité n'est transmise à PoYo. Même si PoYo filtrait, cela ne
   transférerait pas l'obligation de signalement, qui pèse sur l'opérateur du service.
   **À confirmer auprès de PoYo (Classe E) — mais la réponse ne change pas la conclusion.**
2. **« Le flux n'accepte peut-être pas d'images arbitraires. »** *Réfuté.*
   `useImagePicker.ts` ouvre la photothèque système et `app/camera.tsx` la caméra. Aucun contrôle
   de contenu n'est appliqué au résultat. Le champ `baseImage` de l'edge function accepte tout
   base64.
3. **« Il existe peut-être une modération côté Supabase Storage. »** *Sans objet.*
   Aucun bucket n'intervient dans le pipeline : les images transitent directement en base64 vers
   PoYo, et les résultats sont servis depuis le CDN de PoYo.

### IMPACT

Le produit accepte des **photographies arbitraires téléversées par des utilisateurs** et les
transmet à un modèle génératif tiers, sans aucun contrôle.

- **Obligations CSAM.** Tout service acceptant des images téléversées est soumis, dans la plupart
  des juridictions concernées (États-Unis, Union européenne, Royaume-Uni), à des obligations de
  détection et de **signalement obligatoire**. Il n'existe ici ni détection, ni procédure de
  signalement, ni conservation de preuve, ni interlocuteur désigné.
- **Photos de personnes réelles.** Le flux « peins cette figurine » accepte n'importe quelle photo.
  Rien n'empêche de soumettre le portrait d'une personne réelle, y compris mineure, ni de le
  transformer. Aucun garde-fou technique ni contractuel n'existe.
- **Aucun signalement, aucun retrait.** Un utilisateur ne dispose d'aucun moyen de signaler un
  contenu, et l'exploitant d'aucun moyen d'en retirer un.
- **Aucune vérification d'âge.**
- **Aucune procédure d'incident** : en cas de signalement de contenu illicite, rien ne définit qui
  agit, sous quel délai, ce qui est conservé, ni qui est notifié.

C'est la conséquence que l'argent ne répare pas : un remboursement ne défait pas une infraction.

### RECOMMENDATION

Séquencée par exposition juridique, pas par difficulté. **Le point 1 conditionne le lancement.**

1. **Détection CSAM sur l'upload, avant tout appel fournisseur.** Le standard industriel accessible
   à un éditeur indépendant est un service de *hash matching* (PhotoDNA de Microsoft, gratuit pour
   les plateformes éligibles ; ou l'API Safer de Thorn). Point d'insertion naturel :
   `generate-miniature`, avant `uploadToPoyo` — l'image y est déjà en base64 côté serveur.
   **Accompagner d'une procédure de signalement écrite** (NCMEC aux États-Unis, ou l'autorité
   compétente selon votre établissement) : la détection sans procédure ne satisfait pas
   l'obligation.
2. **Détection de visages humains sur l'upload**, avec refus explicite. Le produit prétend peindre
   des *figurines* : rejeter les photographies de personnes est aligné avec la promesse produit,
   défendable auprès des utilisateurs, et supprime d'un coup la classe de risque la plus lourde.
   Un modèle de détection de visage local (`expo-face-detector` ou équivalent) suffit en première
   barrière ; un contrôle serveur reste nécessaire (le client est hostile).
3. **Modération sémantique du texte de prompt** côté serveur. Les sanitizers actuels ne remplissent
   pas ce rôle et ne peuvent pas y être adaptés — ce sont des filtres de caractères.
4. **Chemin de signalement et de retrait** dans l'interface, avec traçabilité.
5. **Vérification d'âge** au niveau requis par les magasins d'applications pour une application de
   génération d'images.
6. **Procédure d'incident écrite** : qui, sous quel délai, quoi conserver, qui notifier.

### DEPENDENCIES

Aucune technique. **Bloque le lancement public** : c'est le seul finding de cet audit dont la
réalisation d'un risque ne se règle pas par un correctif rétroactif.

---

## ECON-002 — L'autorisation de dépense **ignore les réservations en cours** : la « réservation » ne réserve rien

```
ID:           ECON-002
SEVERITY:     P0        CONFIDENCE: Confirmed        EFFORT: M
CATEGORY:     ECON      MONEY IMPACT: Direct revenue loss + Direct cost exposure
LOCATION:     RPC live authorize_generation(p_user_id uuid, p_cost integer)
              et reserve_generation(...) — cf. LIVE-VS-REPO
```

### VERIFICATION 1 — [Classe C : corps live d'`authorize_generation`]

Extrait via `pg_proc.prosrc`. La fonction interroge **une seule table** :

```sql
SELECT tier_tokens, purchased_balance, is_unlimited
INTO   v_tier_tokens, v_purchased_balance, v_is_unlimited
FROM   public.user_entitlements
WHERE  user_id = p_user_id;
...
v_remaining_total := COALESCE(v_tier_tokens, 0) + COALESCE(v_purchased_balance, 0);

IF v_remaining_total < p_cost THEN
  RETURN jsonb_build_object('allowed', false, 'error', 'insufficient_balance', ...);
END IF;
```

**`generation_jobs` n'apparaît nulle part dans le corps de la fonction.** La décision d'autorisation
est prise sur le solde stocké seul, sans aucune connaissance des réservations déjà émises.

### VERIFICATION 2 — [Classe A : le fichier de migration, et l'historique de la régression]

`supabase/migrations/20260130140000_deduct_on_success.sql` contenait la vérification correcte :
elle comparait `(solde − réservations actives)` au coût. La migration
`20260201000000_unified_token_pool.sql` (un jour plus tard) a introduit `authorize_generation` sous
sa forme actuelle, **sans reporter cette soustraction**.

Le vestige est visible dans `reserve_generation` (corps live) : la variable est toujours calculée…

```sql
SELECT coalesce(sum(cost_units), 0) INTO v_active_reservations
FROM public.generation_jobs
WHERE user_id = p_user_id AND status = 'reserved';
```

…mais **uniquement après** l'appel à `authorize_generation`, et son seul usage est la valeur
d'affichage retournée au client :

```sql
v_balance := (v_auth_result->>'remaining_total')::int - v_active_reservations - p_cost;
RETURN jsonb_build_object('success', true, 'job_id', v_job_id, ..., 'remaining_balance', v_balance);
```

Le calcul juste existe donc encore — mais il a été déplacé du côté *affichage* et retiré du côté
*décision*. C'est la signature d'une régression de refactoring, non d'un choix.

### FALSIFICATION — trois tentatives

1. **« `confirm_generation` ou `complete_poyo_job` revérifient le solde avant de débiter. »**
   *Réfuté.* Corps live de `complete_poyo_job` extrait intégralement : il exécute
   `UPDATE public.user_entitlements SET purchased_balance = purchased_balance - v_job.cost_units`
   **sans aucune condition de solde**. Aucun `WHERE purchased_balance >= cost`, aucun garde-fou.
2. **« Une contrainte de base empêche le solde de devenir négatif. »**
   *Réfuté.* Énumération complète de `pg_constraint` pour le schéma `public` :
   les seules contraintes `CHECK` portent sur `generation_jobs.status`,
   `generation_jobs.consumption_source`, `paints.product_type`, `profiles.role`,
   `provider_health.provider`, `user_paints.status`. **Aucune contrainte sur aucune colonne de
   solde.** `purchased_balance` et `tier_tokens` peuvent devenir négatifs.
3. **« L'edge function sérialise les demandes par utilisateur avant d'appeler la RPC. »**
   *Réfuté par lecture intégrale de `generate-miniature/index.ts`.* `reserveCredits` (l. 370-394)
   est un appel RPC direct. Aucun verrou, aucune file, aucune déduplication de requête, aucun
   contrôle de concurrence par utilisateur n'existe dans les 887 lignes du handler.

### LIVE-VS-REPO

`reserve_generation` est défini dans **onze** migrations. Ordre d'application confirmé via
`list_migrations`. Dernier écrivain effectif : `20260713020309_revoke_server_only_rpcs` (live), sans
fichier correspondant dans le dépôt. **Le corps live a été extrait et fait foi** ; il diverge du
fichier local `20260225100000_security_hardening.sql` sur un point notable — la branche qui, selon
le commentaire de `20260202000000_fix_token_migration_on_signup.sql`, devait recopier
`device_tokens.current_balance` dans `purchased_balance` **n'existe pas dans la version déployée**.
Divergence dépôt↔déploiement enregistrée séparément (`OPS-001`).

### IMPACT

Le débit n'intervient qu'au **succès** (`complete_poyo_job`). Entre la réservation et le débit, le
solde stocké reste inchangé. Comme l'autorisation ne lit que ce solde, **un utilisateur disposant de
1 token peut émettre un nombre arbitraire de réservations successives**, chacune déclenchant une
soumission payante chez PoYo, avant que le premier débit ne survienne.

Double conséquence, et c'est le point important :

- **Perte de revenu** : des générations sont livrées sans contrepartie.
- **Exposition de coût** : chaque réservation excédentaire est une tâche facturée par PoYo. À
  $0,05 la génération (constante `POYO_COST_PER_GENERATION`, `app/admin/index.tsx:1405`), le
  plafond n'est pas le solde de l'utilisateur mais **votre capacité à payer**.

Combiné à `ECON-004` (aucune contrainte de non-négativité), le solde dérive silencieusement sous
zéro sans qu'aucun mécanisme ne le signale.

### VERIFICATION 3 — [Classe B : EXÉCUTÉ EN PRODUCTION, 2026-08-05] — **le finding est démontré**

Protocole : compte jetable `ada17000-0000-4000-8000-000000000001`, ligne `user_entitlements` créée
avec **`purchased_balance = 1`**, session positionnée sur ce compte
(`request.jwt.claims.sub`, rôle `authenticated`). Empreintes `md5` des 12 tables relevées avant et
après ; suppression par cascade ; **empreintes identiques au caractère près** (voir REPRO).

**Cinq appels séquentiels de `reserve_generation(user, 1, NULL, '{}')` sur un compte à 1 token :**

| Appel | `success` | `remaining_balance` retourné | `job_id` créé |
|---|---|---:|---|
| 1 | **true** | `0` | `cec3eb3b…` |
| 2 | **true** | **`-1`** | `b91cba94…` |
| 3 | **true** | **`-2`** | `de9f3b39…` |
| 4 | **true** | **`-3`** | `5c4a0c03…` |
| 5 | **true** | **`-4`** | `06ee4c78…` |

**Cinq réservations accordées sur un droit d'une seule.** Et le résultat est plus grave que la
lecture du code ne le laissait voir : **la fonction calcule elle-même un solde négatif, le renvoie au
client dans `remaining_balance`, et accorde la réservation malgré tout.** L'information nécessaire au
refus est produite, transmise, puis ignorée.

Répétition à 8 appels (après remise à `purchased_balance = 1` et suppression des jobs) :
**8 succès sur 8**, `remaining_balance` de `0` à `-7`, 8 jobs créés.

En production, chacune de ces réservations aurait déclenché une soumission PoYo facturée
**0,090 $** — soit **0,72 $ dépensés pour un compte disposant de 0,09 $ de droits**.

### REPRO

Exécuté le 2026-08-05 sur la base de production, après sauvegarde, avec l'accord du commanditaire.

```sql
-- compte jetable + 1 token
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, is_anonymous)
VALUES ('ada17000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','audit+20260805@invalid',
        '{"provider":"email","providers":["email"]}','{}',now(),now(),false);
INSERT INTO public.user_entitlements (user_id,is_pro,subscription_status,is_onboarded,
                                      purchased_balance,tier_tokens)
VALUES ('ada17000-0000-4000-8000-000000000001',false,'free',true,1,0);

SELECT set_config('request.jwt.claims',
  '{"sub":"ada17000-0000-4000-8000-000000000001","role":"authenticated"}',false);

SELECT public.reserve_generation('ada17000-0000-4000-8000-000000000001'::uuid,1,NULL,'{}'::jsonb);
-- répéter : chaque appel renvoie success=true, remaining_balance décroissant sous zéro

DELETE FROM auth.users WHERE id='ada17000-0000-4000-8000-000000000001';  -- 14 cascades
```

**Garantie de non-régression appliquée.** Empreintes `md5` du contenu intégral des 12 tables, avant
et après. Valeurs identiques sur les douze — `paints 73c552d4…` (2 956 lignes),
`user_paints ea7da021…` (52), `profiles 80322c76…` (21), `generation_jobs 47c0e510…` (390),
`user_entitlements 377502db…` (1), `auth.users ea27be1c…` (21). **Aucune donnée MiniPainterDB
touchée, aucun résidu.**

### RECOMMENDATION

**Ne pas se contenter d'ajouter la soustraction des réservations** — cela corrigerait le compte sans
corriger la concurrence (`ECON-001`). Les deux se traitent ensemble :

1. Verrouiller la ligne d'entitlement en tête de `reserve_generation` :
   `SELECT ... FROM user_entitlements WHERE user_id = p_user_id FOR UPDATE;`
   `release_generation` et `complete_poyo_job` le font déjà — la discipline de verrouillage est
   simplement absente là où elle compte.
2. Réintégrer la soustraction **dans la décision** :
   `IF (solde − réservations_actives) < p_cost THEN refuser`.
3. Ajouter `CHECK (purchased_balance >= 0)` et `CHECK (tier_tokens >= 0)` en dernière ligne de
   défense (cf. `ECON-004`). Une contrainte qui lève est infiniment préférable à une dérive muette.
4. Expirer les réservations orphelines. Sans cela, la soustraction du point 2 finirait par bloquer
   des utilisateurs légitimes dont un job est resté `reserved`.

### DEPENDENCIES

Indissociable d'`ECON-001` (verrouillage) et d'`ECON-004` (contrainte). À traiter en une seule
migration.

---

## ECON-001 — Aucun verrou dans le chemin de réservation : double-débit sous concurrence

```
ID:           ECON-001
SEVERITY:     P0        CONFIDENCE: Likely — BLOCKED (test de concurrence requis)
EFFORT:       M         CATEGORY: ECON
MONEY IMPACT: Direct revenue loss + Direct cost exposure
LOCATION:     RPC live reserve_generation(...) et authorize_generation(...)
```

**⚠️ P0 en confiance `Likely` — signalé ici conformément à §2B.5.**

### VERIFICATION 1 — [Classe C : corps live des deux fonctions]

`reserve_generation` (4 arguments) et `authorize_generation` extraits via `pg_get_functiondef` /
`prosrc`. **Aucune des deux ne contient `FOR UPDATE`, `pg_advisory_lock`, `LOCK TABLE`, ni aucune
autre forme de sérialisation.** La lecture du solde est un `SELECT ... INTO` nu.

### VERIFICATION 2 — [Classe C : contraste interne, sur la même base]

La discipline de verrouillage **existe** dans ce schéma, mais pas dans le chemin de réservation :

| Fonction | Verrou |
|---|---|
| `release_generation` | `SELECT * INTO v_job FROM generation_jobs WHERE id = p_job_id **FOR UPDATE**` |
| `complete_poyo_job` | `SELECT * INTO v_job FROM generation_jobs WHERE poyo_task_id = ... **FOR UPDATE**` |
| `reserve_generation` | **aucun** |
| `authorize_generation` | **aucun** |

Les fonctions qui *terminent* un job verrouillent ; celle qui *autorise la dépense* ne verrouille
pas. L'asymétrie est difficile à lire comme intentionnelle.

### FALSIFICATION — deux tentatives, une troisième impossible sans écriture

1. **« Un index unique ou une contrainte d'exclusion sérialise implicitement. »** *Réfuté.*
   Énumération complète de `pg_constraint` (types `c`, `u`, `x`) et de `pg_indexes` : les seuls
   index sur `generation_jobs` sont `generation_jobs_pkey`, `idx_generation_jobs_status` (partiel
   sur `status='reserved'`) et `idx_generation_jobs_user`. Aucun index unique par utilisateur,
   aucune contrainte d'exclusion.
2. **« L'edge function sérialise en amont. »** *Réfuté* — cf. `ECON-002`, falsification 3.
3. **« Le niveau d'isolation est SERIALIZABLE. »** *Non vérifié — nécessite d'observer une
   transaction applicative réelle.* Le défaut PostgreSQL est `READ COMMITTED`, sous lequel deux
   `SELECT` concurrents lisent la même valeur ; rien dans le code applicatif ne le modifie.
   Reste formellement ouvert.

### REPRO — **exécuté, mais NON CONCLUANT sur la course elle-même**

Le harnais a été exécuté le 2026-08-05 : 8 appels de `reserve_generation` émis en parallèle sur
**8 connexions distinctes**, compte jetable à `purchased_balance = 1`.

**Résultat : 8 succès sur 8** — mais les `remaining_balance` retournés forment une suite
**strictement décroissante** : `0, −1, −2, −3, −4, −5, −6, −7`.

**Cette monotonie est la signature d'une exécution sérialisée, non d'une course.** Chaque appel a vu
la ligne `generation_jobs` insérée par le précédent, donc un `v_active_reservations` incrémenté.
Sous une véritable concurrence en `READ COMMITTED` sans verrou, on attendrait **plusieurs appels
retournant la même valeur** — deux ou trois `0`, par exemple. Ce n'est pas ce qui est observé : le
mécanisme de transport (appels MCP successifs) n'a pas produit de parallélisme réel au niveau du
moteur.

**Le test ne prouve donc pas la course.** Il reprouve `ECON-002` à 8 appels.

### Pourquoi la course est, en l'état, **expérimentalement inisolable**

Constat méthodologique important, et il change la façon de traiter ce finding.

Tant qu'`ECON-002` existe, la décision d'autorisation **ignore totalement les réservations en
cours**. Le résultat observable — N réservations accordées sur un droit d'une — est donc **identique
qu'il y ait course ou non**. Un verrou ne changerait rien au résultat, puisque ce qui est verrouillé
n'est pas ce qui est lu.

**La course ne deviendra observable comme défaut distinct qu'une fois `ECON-002` corrigé** : quand
la décision dépendra de `(solde − réservations)`, l'absence de `FOR UPDATE` permettra à deux
transactions concurrentes de lire le même état et de passer toutes les deux.

Conséquence pour cet audit : `ECON-001` **reste en `Likely`**, appuyé sur deux vérifications de
Classe C (absence de verrou dans les deux fonctions du chemin ; présence de `FOR UPDATE` dans
`release_generation` et `complete_poyo_job`, qui établit que la discipline existe ailleurs). Il ne
sera promouvable en `Confirmed` qu'après correction d'`ECON-002` — et c'est précisément pourquoi le
verrou doit être posé **dans la même migration** que la soustraction, sans attendre de preuve
supplémentaire.

**Conformément à §2B.4, aucune recommandation n'est émise sur ce finding seul.** Il est traité comme
composant du point 1 d'`ECON-002`, dont les recommandations reposent sur des preuves complètes.

---

## ECON-003 — **Tokens gratuits illimités** : le garde-fou anti-farming n'est jamais armé pour un compte inscrit

```
ID:           ECON-003     SEVERITY: P0     CONFIDENCE: Confirmed     EFFORT: S
CATEGORY:     ECON         MONEY IMPACT: Direct revenue loss + Direct cost exposure
LOCATION:     RPC live reserve_generation(...), branche ELSE du bloc
              « IF NOT EXISTS (SELECT 1 FROM user_entitlements) »
```

### VERIFICATION 1 — [Classe C : corps live]

```sql
IF NOT EXISTS (SELECT 1 FROM public.user_entitlements WHERE user_id = p_user_id) THEN
  IF p_device_id IS NOT NULL AND v_is_anonymous THEN
      ... contrôle device_tokens, octroi conditionnel, INSERT device_tokens ...
  ELSE
      -- Fallback
      INSERT INTO public.user_entitlements (..., purchased_balance, tier_tokens)
      VALUES (p_user_id, false, 'free', false, 10, 0);
  END IF;
END IF;
```

La condition du contrôle anti-farming est `p_device_id IS NOT NULL **AND v_is_anonymous**`.
**Pour un utilisateur non anonyme, elle est fausse quel que soit le `device_id` fourni** — la
branche `ELSE` s'exécute, octroie 10 tokens, et **n'écrit rien dans `device_tokens`**.

### VERIFICATION 2 — [Classe B : EXÉCUTÉ EN PRODUCTION, 2026-08-05]

Compte jetable **non anonyme** (`is_anonymous = false`, e-mail renseigné), `device_id` fourni
(`'audit-device-001'`). Quatre cycles, chacun précédé de la suppression de la ligne
`user_entitlements` — ce que fait exactement la cascade de `delete-account`.

| Cycle | `success` | Solde après octroi | Ligne `device_tokens` créée |
|---|---|---:|---|
| 1 | true | **10** | **0** |
| 2 | true | **10** | **0** |
| 3 | true | **10** | **0** |
| 4 | true | **10** | **0** |

**Dix tokens à chaque cycle, indéfiniment, avec le même `device_id`.** Le device n'est **jamais**
enregistré : le garde-fou ne s'arme pas, donc il ne peut jamais refuser.

### VERIFICATION 3 — [Classe D : la production le confirmait déjà]

`device_tokens` compte **0 ligne** en production, pour **390 générations** et 21 comptes. La table
existe depuis la migration `20260201020000_device_tracking` (février 2026) et **n'a jamais reçu une
seule écriture**. Le mécanisme anti-farming est du code mort depuis six mois, et la donnée le disait.

### FALSIFICATION — trois tentatives

1. **« Les comptes anonymes, eux, sont protégés. »** *Retenu* — pour un anonyme avec `device_id`,
   la première branche s'exécute et `device_tokens.device_id` porte une contrainte `UNIQUE`
   (vérifiée). **Mais cela ne protège rien** : il suffit de créer un compte avec e-mail pour sortir
   de la branche protégée. Le contrôle s'applique au cas le moins risqué et pas à l'autre.
2. **« La vérification d'e-mail bloque la création en masse. »** *Non réfuté mais insuffisant.*
   Supabase impose une confirmation d'e-mail (le code la gère, `AuthContext.tsx:450`), ce qui ralentit
   sans empêcher : les services d'e-mails jetables rendent l'opération triviale et automatisable.
   **Et surtout, la vérification ne s'applique pas au chemin le plus simple** — supprimer puis
   recréer son propre compte, testé ci-dessus.
3. **« `delete-account` ne supprime peut-être pas `user_entitlements`. »** *Réfuté.* Les 14 clés
   étrangères vers `auth.users` sont **toutes `ON DELETE CASCADE`** (énumérées via `pg_constraint`),
   `user_entitlements` comprise — et le commentaire de la fonction déployée l'énumère explicitement.

### IMPACT

**Tokens gratuits en quantité illimitée**, par le chemin le plus banal qui soit : supprimer son
compte depuis les réglages, le recréer, régénérer. Aucun outil, aucune faille technique, aucune
connaissance particulière.

Au coût réel du modèle de production : **0,90 $ offerts par cycle**, sans plafond, sans trace, sans
alerte. Combiné à `COST-001` (aucun plafond de dépense global) et à `ECON-002` (le solde n'est de
toute façon pas opposable), il n'existe **aucune borne** à ce que cela peut coûter.

C'est le vecteur que je désignais en passe « inconnues inconnues » comme celui que j'exploiterais en
premier. Il est désormais démontré.

### RECOMMENDATION

1. **Inverser la condition** : le contrôle `device_tokens` doit s'appliquer à **tous** les comptes,
   pas aux seuls anonymes. `IF p_device_id IS NOT NULL THEN` — et enregistrer le device **dans les
   deux branches**.
2. **Découpler l'octroi gratuit de l'absence d'entitlement.** Tant que « pas de ligne » vaut « nouvel
   utilisateur », toute suppression rouvre le droit. Conserver une trace de l'octroi qui **survit à
   la suppression du compte** — ce que `device_tokens` était censé faire, et ne fait pas.
3. **Créer la ligne `user_entitlements` à l'inscription** (via le trigger `handle_new_user`, qui crée
   déjà `profiles`), et non paresseusement à la première génération. La branche d'octroi disparaît
   alors du chemin de dépense, ce qui supprime la classe de bug plutôt que ce cas précis.
4. **Verser les tokens gratuits dans `tier_tokens`, pas dans `purchased_balance`** — pour pouvoir
   les distinguer, les expirer et les auditer.
5. **Ne pas se reposer sur le `device_id`** : c'est un paramètre POST fourni par le client
   (`geminiService.ts:229-240`), et sur le web c'est un `Math.random()` en `AsyncStorage`. Il ralentit
   un utilisateur ordinaire, il n'arrête personne de motivé.

### DEPENDENCIES

Aggravé par `ECON-002` et `COST-001`. Indépendant pour la correction.

---

## ECON-004 — Aucune contrainte de non-négativité sur les soldes

```
ID:           ECON-004     SEVERITY: P1     CONFIDENCE: Confirmed     EFFORT: XS
CATEGORY:     ECON         MONEY IMPACT: Direct revenue loss
LOCATION:     table live public.user_entitlements
```

**V1 [Classe C]** — Énumération exhaustive de `pg_constraint` (`contype IN ('c','u','x')`) sur le
schéma `public` : 9 contraintes au total, **aucune ne porte sur `purchased_balance`, `tier_tokens`,
`daily_tokens`, `weekly_tokens` ni `monthly_tokens`**.

**V2 [Classe C]** — `complete_poyo_job` exécute
`UPDATE user_entitlements SET purchased_balance = purchased_balance - v_job.cost_units`
sans clause de garde. Rien, ni dans la fonction ni dans le schéma, n'empêche le passage sous zéro.

**FALSIFICATION.** *« Le type de colonne est peut-être non signé. »* Réfuté :
`information_schema.columns` donne `purchased_balance: integer` — PostgreSQL n'a pas d'entier non
signé. *« L'application vérifie avant. »* Réfuté : c'est précisément `ECON-002`.

**IMPACT.** Dernière ligne de défense absente. Toute erreur en amont — course, régression, webhook
rejoué, appel manuel — dérive silencieusement au lieu de lever. Sans registre append-only
(`ECON-006`), une dérive est indétectable *a posteriori*.

**RECOMMENDATION.** `ALTER TABLE user_entitlements ADD CONSTRAINT ... CHECK (purchased_balance >= 0)`,
idem `tier_tokens`. ⚠️ Vérifier d'abord qu'aucune ligne n'est déjà négative (une seule ligne existe
aujourd'hui, à `purchased_balance = 21` : la contrainte passe).

---

## ECON-005 — Un utilisateur `is_unlimited` **ne peut pas générer du tout** : conflit entre la valeur retournée et la contrainte de table

```
ID:           ECON-005     SEVERITY: P2     CONFIDENCE: Confirmed     EFFORT: XS
CATEGORY:     ECON         MONEY IMPACT: None (indisponibilité, pas de perte)
LOCATION:     authorize_generation ↔ contrainte generation_jobs_consumption_source_check
```

**V1 [Classe C — corps de fonction]** — `authorize_generation`, branche illimitée :

```sql
IF v_is_unlimited THEN
  RETURN jsonb_build_object('allowed', true, 'source', 'unlimited', 'remaining_total', 999999);
END IF;
```

`reserve_generation` reprend cette valeur (`v_source := v_auth_result->>'source'`) et l'insère :
`INSERT INTO generation_jobs (..., consumption_source, ...) VALUES (..., v_source, ...)`.

**V2 [Classe C — contrainte de table]** —

```sql
generation_jobs_consumption_source_check
  CHECK (consumption_source = ANY (ARRAY['tier_tokens'::text, 'purchased_balance'::text]))
```

`'unlimited'` **n'est pas dans la liste autorisée**. L'INSERT viole la contrainte, la fonction lève,
la réservation échoue.

**FALSIFICATION.** *« La branche `unlimited` de `complete_poyo_job` prouve que le cas fonctionne. »*
Réfuté — et c'est l'inverse : `ELSIF v_job.consumption_source = 'unlimited' THEN NULL;` est
**du code mort**, puisque la contrainte interdit à cette valeur d'être stockée. Deux fragments
écrits à des dates différentes, jamais confrontés.
*« Un utilisateur illimité existe et fonctionne. »* Réfuté : `SELECT ... FROM user_entitlements`
→ une seule ligne, `is_unlimited = false`. **Le chemin n'a jamais été exercé** — ce qui explique
qu'il n'ait jamais été détecté.

**IMPACT.** Le mécanisme de compte offert / VIP / testeur est cassé et le sera au premier usage.
Latent aujourd'hui, bloquant le jour où vous l'activerez — typiquement pour un partenaire ou un
créateur de contenu, c'est-à-dire au pire moment.

**RECOMMENDATION.** Ajouter `'unlimited'` à la contrainte **ou** faire retourner
`'purchased_balance'` à la branche illimitée en s'appuyant sur la non-déduction. La première option
est plus explicite. Dans les deux cas, **écrire le test** : c'est un cas que seul un test aurait pu
révéler avant la production.

---

## AI-002 — Prix plat de 1 token pour 18 modèles de coûts très différents, et une télémétrie de coût **codée en dur**

```
ID:           AI-002       SEVERITY: P1     CONFIDENCE: Confirmed     EFFORT: M
CATEGORY:     AI           MONEY IMPACT: Direct cost exposure
LOCATION:     supabase/functions/generate-miniature/index.ts:56-58 ;
              app/admin/index.tsx:1402-1405, 204-231
```

**V1 [Classe A]** — Barème serveur, dans son intégralité :

```ts
const MODEL_COSTS: Record<string, number> = {
    'gemini-3.1-flash-image-preview': 1,
};
```

Le coût facturé est `MODEL_COSTS[targetModel]` (l. 681), où `targetModel` vaut par défaut
`'gemini-3.1-flash-image-preview'`. **Le modèle PoYo réellement utilisé n'entre pas dans ce
calcul** : il provient de `app_config.poyo_model` (l. 587) et est transmis à
`submitPoyoWithWebhook` sans effet sur le prix. Le coût est donc **invariablement 1**.

Côté télémétrie, `app/admin/index.tsx:1405` :

```ts
const POYO_COST_PER_GENERATION = 0.05; // $0.05 flat per PoYo generation
```

utilisé par `calcCostDetails` (l. 210-214) pour **tout** modèle ne commençant pas par `gemini`.

**V2 [Classe D : données réelles de production]** — `generation_logs`, 379 lignes :

| `model_used` | générations | tokens facturés |
|---|---:|---:|
| `poyo` (littéral hérité) | 181 | 181 |
| `nano-banana-pro-edit` | 157 | 157 |
| `nano-banana-2-edit` | 37 | 37 |
| `nano-banana-edit` | 2 | 2 |
| **`flux-kontext-max-edit`** | 1 | 1 |
| **`gpt-image-2-edit`** | 1 | 1 |

`sum(cost_units) == count(*)` pour **chaque** modèle : la facturation à 1 token est confirmée sur
données réelles. `flux-kontext-max-edit` et `gpt-image-2-edit` — des modèles haut de gamme — ont été
facturés au même tarif que `nano-banana-2-edit`. Le portail admin les a tous affichés à $0,05.

**FALSIFICATION.** *« `MODEL_COSTS` est peut-être étendu ailleurs. »* Réfuté : la constante est
déclarée une fois et lue une fois (l. 681) ; la whitelist de la l. 667 interdit tout autre modèle
côté API. *« Les modèles PoYo coûtent peut-être effectivement tous $0,05. »* **Non établi — c'est
précisément le problème** : la valeur est une constante écrite en dur dans une interface
d'administration, non une mesure. Aucun coût fournisseur réel n'est enregistré nulle part dans le
schéma.

**IMPACT.** Le prix côté utilisateur est plat ; le coût côté fournisseur est **variable et pilotable
depuis le portail admin** (18 modèles au menu, `app/admin/index.tsx:40-64`). Un changement de
`poyo_model` déplace la marge sans toucher au prix ni déclencher la moindre alerte. La production
tourne actuellement sur `nano-banana-pro-edit` — un modèle « Pro » — au prix d'un modèle d'entrée.
**Aucun chemin à marge négative ne peut être ni détecté ni exclu**, faute de coût réel enregistré.

**RECOMMENDATION.**
1. Table de prix **serveur** indexée par modèle PoYo, et non par modèle Google. Le coût en tokens
   doit dériver du modèle réellement soumis.
2. **Enregistrer le coût fournisseur réel** par génération (colonne `provider_cost_usd` sur
   `generation_jobs`), alimentée depuis la réponse PoYo ou une table de tarifs tenue à jour.
   Sans cela, aucune analyse de marge n'est possible — y compris celle demandée par cet audit.
3. Afficher la marge, pas seulement le coût, dans le portail admin, et **avertir dans l'interface de
   sélection du modèle** de l'impact sur la marge.
4. Obtenir les tarifs PoYo réels (Classe E) et **les réconcilier avec une facture** (Classe D).
   Voir `AUDIT_MONEY.md`.

---

## COST-001 — Aucun plafond de dépense, aucune limitation de débit pour les comptes authentifiés

```
ID:           COST-001     SEVERITY: P1     CONFIDENCE: Confirmed     EFFORT: M
CATEGORY:     AI           MONEY IMPACT: Direct cost exposure
LOCATION:     supabase/functions/generate-miniature/index.ts — architectural
```

**V1 [Classe A]** — Lecture intégrale des 887 lignes du handler. Le seul mécanisme de limitation est
`isAnonymousIpRateLimited` (l. 480-508), appliqué **uniquement** dans le bloc
`if (isAnonymous)` (l. 605-630). Un compte authentifié ne rencontre **aucune** limite de débit, de
concurrence ou de volume, en dehors de son solde — dont `ECON-002` établit qu'il n'est pas
opposable en temps utile.

De plus, la limite anonyme **échoue ouverte** :

```ts
if (error) {
    log.error('RATE', `IP rate-limit check error: ${error.message}`);
    // Fail open — don't block on DB errors
    return false;
}
```

et elle est contournable : `getClientIp` (l. 466-473) fait confiance au premier élément de
`x-forwarded-for`, en-tête fourni par le client.

**V2 [Classe C]** — Aucun garde-fou côté base : aucune table de quota, aucun compteur global,
aucune tâche `cron` (`pg_cron` n'apparaît pas dans les migrations appliquées, et aucune fonction de
plafond n'existe parmi les 40 RPC live). `provider_health` implémente un disjoncteur, mais sur le
**taux d'échec** (seuil 5, cooldown 600 s), pas sur la dépense : un fournisseur en parfaite santé
qui vous facture n'ouvre jamais le circuit.

**FALSIFICATION.** *« La rotation de clés PoYo plafonne implicitement (5 req/min/clé). »*
*Partiellement retenu* : `get_available_poyo_key` limite bien le débit instantané, mais c'est un
plafond de **concurrence**, pas de **dépense** — il étale le coût sans le borner. Le nombre de clés
n'a pas été établi (table en schéma `private`, hors de portée de la lecture appliquée ici).
*« Le solde borne la dépense. »* Réfuté par `ECON-002`.

**IMPACT — modèle de perte maximale sur 24 h.** Avec 5 req/min/clé et $0,05 la génération :
**une seule clé** autorise 7 200 générations/jour, soit **360 $/jour**. Ce chiffre est proportionnel
au nombre de clés en rotation. Aucune alerte n'existe : la première information serait la facture.

**RECOMMENDATION.**
1. **Plafond de dépense global quotidien**, en base, vérifié avant soumission, qui interrompt la
   génération au franchissement. C'est le garde-fou dont l'absence n'a aucune borne supérieure.
2. Limitation par utilisateur authentifié, indépendante du solde.
3. Plafond de concurrence par utilisateur (1 job `reserved` à la fois est un défaut raisonnable, et
   referme accessoirement `ECON-001`).
4. Ne plus faire confiance à `x-forwarded-for` fourni par le client, ou l'assumer explicitement.
5. Alerte sur anomalie de dépense.

---

## ADMIN-001 — Le rôle admin est un drapeau de la session utilisateur ordinaire, sans MFA ni journal d'audit

```
ID:           ADMIN-001    SEVERITY: P1     CONFIDENCE: Confirmed     EFFORT: L
CATEGORY:     ADMIN        MONEY IMPACT: None directement
LOCATION:     app/admin/_layout.tsx:6-12 ; app/admin/index.tsx:68,1040 ;
              src/services/adminService.ts:39-44 ; RPC live is_admin()
```

**V1 [Classe A]** — Le portail est livré **dans le même bundle, sur la même origine, sous la même
session** que l'application utilisateur. Le layout ne porte aucun contrôle d'authentification
(`app/admin/_layout.tsx:6-12` ne teste que `Platform.OS !== 'web'`). Le seul garde côté écran est un
rendu conditionnel :

```ts
const isAdmin = user?.app_metadata?.role === 'admin';   // l. 68
if (!isAdmin && !__DEV__) { return <Text>Access Denied</Text>; }   // l. 1040
```

C'est du code client : il masque l'interface, il ne protège rien.

**V2 [Classe C]** — La protection réelle est côté serveur, et elle **tient** : les 11 RPC
`admin_*` / `get_admin_*` portent toutes la garde `is_admin()` (vérifié une par une via
`prosrc ILIKE '%is_admin()%'`), et `prompt_configs` est protégée par des politiques RLS exigeant
`app_metadata.role = 'admin'`. **Ce n'est donc pas une faille d'autorisation** — c'est une faille
d'architecture et de traçabilité :

- **Aucune MFA.** `auth.mfa_factors` existe (schéma Supabase) mais aucun facteur n'est enrôlé, et
  aucun chemin d'enrôlement n'existe dans l'application.
- **Aucun journal d'audit.** Aucune table ne consigne les actions d'administration. Un changement de
  `poyo_model` — qui modifie directement votre coût par génération — ne laisse **aucune trace**
  autre que la valeur finale dans `app_config`.
- **Aucune restriction IP**, aucune expiration de session spécifique.
- **Un seul compte admin** (`profiles.role='admin'` → 1 ligne), donc aucune séparation des rôles.

**FALSIFICATION.** *« Le garde client suffit puisque le serveur vérifie. »* Retenu pour
l'autorisation, rejeté pour la conclusion : le risque n'est pas qu'un utilisateur atteigne
l'interface, mais qu'une **compromission de la session utilisateur ordinaire de l'administrateur**
(XSS sur le web, vol de jeton, appareil perdu) confère immédiatement tous les droits
d'administration, sans second facteur et sans laisser de trace.
*« `is_admin()` est peut-être laxiste. »* Réfuté par lecture : elle exige
`profiles.role='admin'` **ou** `app_metadata.role='admin'` **ou** `auth.role()='service_role'`.
Correct — mais on note l'incohérence avec le garde client, qui ne teste que `app_metadata` : un
admin déclaré uniquement dans `profiles` se verrait refuser l'interface tout en étant autorisé par
les RPC.

**IMPACT.** Aucune capacité de crédit direct n'a été trouvée parmi les 40 RPC live — ce qui limite
sensiblement la portée et **contredit l'hypothèse de départ** (« un portail admin peut créer de la
monnaie »). Ce qu'un admin compromis peut faire : lire les prompts et l'historique de tous les
utilisateurs, lister les e-mails, réécrire les gabarits de prompt, **et basculer le modèle PoYo** —
donc multiplier votre coût unitaire sans qu'aucune trace ne subsiste.

**RECOMMENDATION.**
1. **Journal d'audit immuable** des actions d'administration. C'est le point le plus rentable :
   sans lui, aucun incident n'est instruisible. Table append-only, écriture depuis les RPC
   `admin_*` elles-mêmes.
2. **MFA obligatoire** sur les comptes admin (Supabase Auth le fournit nativement).
3. Aligner le garde client sur `is_admin()` pour supprimer l'incohérence `profiles` /
   `app_metadata`.
4. À terme, sortir le portail du bundle utilisateur — il pèse 1 557 lignes livrées à tous les
   utilisateurs web (cf. `PERF-001`) et partage leur origine.

---

## OPS-001 — Le dépôt et la production divergent, et rien ne le détecte

```
ID:           OPS-001      SEVERITY: P1     CONFIDENCE: Confirmed     EFFORT: M
CATEGORY:     CODE         MONEY IMPACT: None directement — cause racine de SEC-001
LOCATION:     architectural
```

**V1 [Classe C]** — `list_migrations` : **68 migrations appliquées**. `git ls-files` : 45 fichiers
suivis + 4 non suivis. **24 migrations live n'ont aucun fichier dans ce dépôt**, dont
`a1_move_poyo_api_keys_to_private_schema` et `a2_revoke_studio_credit_rpcs_from_anon` — qui touchent
directement la clé PoYo et les RPC de crédit de MiniStudio. Inversement,
`supabase/migrations/fix_quentin_limit.sql` n'a pas d'horodatage et n'a jamais pu être appliqué.

**V2 [Classe C + A]** — Deux correctifs écrits ne sont pas déployés :
`poyo-webhook` déployée en v6 (2026-01-30) alors que son authentification a été écrite le
2026-03-01 (`git log -S`) → **`SEC-001`**. Et 27 fichiers modifiés + 4 migrations restent non
commités depuis le 2026-07-14, donc absents de `origin` (dernier push : 2026-03-04).

Trois états coexistent : `origin/payment` (public, pré-durcissement), le working tree local
(durcissement de juillet), et la production (juillet + une campagne d'août absente des deux).

**FALSIFICATION.** *« Les migrations manquantes viennent de l'app sœur et ne concernent pas
MiniStudio. »* *Partiellement retenu* — la majorité sont bien MiniPainterDB (`logic001_*`,
`wave9`–`wave12`) — **mais réfuté sur le fond** : `a1_`, `a2_` et
`sec001_get_provider_config_revoke_only` modifient la sécurité de MiniStudio. Le dépôt de MiniStudio
ne décrit donc pas la sécurité de MiniStudio.

**IMPACT.** C'est la **cause racine commune de `SEC-001` et de `CROSS-001`**. Aucun mécanisme ne
répond à la question « ce qui tourne est-il ce qui est écrit ? ». Toute conclusion tirée du dépôt —
y compris par un futur auditeur, ou par vous dans six mois — est potentiellement fausse.

**RECOMMENDATION.**
1. **Réconcilier**, dans l'ordre : `supabase db pull` pour matérialiser les 24 migrations
   manquantes, puis `supabase migration repair` pour réaligner l'historique (la mémoire projet
   signale que Docker Desktop est absent localement — c'est le premier obstacle à lever).
2. **Commiter** le travail de juillet, aujourd'hui invisible pour quiconque sauf ce poste.
3. **Un contrôle de dérive**, même minimal : un script comparant `list_migrations` aux fichiers, et
   les `ezbr_sha256` des edge functions à un build local. C'est ce qui aurait révélé `SEC-001` cinq
   mois plus tôt.
4. Interdire le déploiement hors dépôt (`apply_migration` via MCP, éditeur SQL du dashboard) une
   fois la réconciliation faite.

---

## DATA-001 — `generation_logs` est inscriptible par le client, avec un `client_ip` non contraint

```
ID:           DATA-001     SEVERITY: P2     CONFIDENCE: Confirmed     EFFORT: XS
CATEGORY:     DATA         MONEY IMPACT: None
LOCATION:     politique RLS live "Users can insert own logs" sur public.generation_logs
```

**V1 [Classe C]** — `pg_policies` :

```
generation_logs | Users can insert own logs | INSERT | {public}
  with_check: (( SELECT auth.uid() AS uid) = user_id)
```

La seule contrainte porte sur `user_id`. **`client_ip`, `model_used`, `cost_units`, `prompt`,
`input_tokens` et `output_tokens` sont entièrement libres.**

**V2 [Classe A]** — `client_ip` est la colonne sur laquelle repose la limitation de débit des
anonymes :

```ts
const { count, error } = await supabaseClient.from('generation_logs')
    .select('*', { count: 'exact', head: true })
    .eq('client_ip', ip).gte('created_at', windowStart);
```
(`generate-miniature/index.ts:493-497`)

**FALSIFICATION.** *« Un client ne peut fausser que son propre compteur. »* Réfuté :
la politique n'impose que `user_id = auth.uid()`. Un compte peut donc insérer des lignes portant
**l'IP d'un tiers**, et épuiser le quota horaire de tous les utilisateurs anonymes derrière cette
adresse — un réseau d'entreprise, un campus, un opérateur mobile en CGNAT.
*« Aucun chemin client n'écrit dans cette table. »* Retenu en usage légitime — les écritures
proviennent de `confirm_generation` et `complete_poyo_job` — **ce qui rend la politique
superflue** : elle n'a aucun usage et ouvre une surface d'abus.

**IMPACT.** Déni de service ciblé sur le tier gratuit, pollution des analytiques admin et de
l'historique de prompts, faussage de la facturation apparente.

**RECOMMENDATION.** **Supprimer la politique.** Aucun chemin légitime n'en dépend : toutes les
écritures passent par des RPC `SECURITY DEFINER` s'exécutant sous le propriétaire. C'est le même
raisonnement — et la même correction — que celle appliquée à `device_tokens` par la migration
`revoke_server_only_rpcs`, qui a laissé celle-ci de côté.

---

## SAFETY-002 — Deux préréglages proposés à l'utilisateur nomment des propriétés protégées

```
ID:           SAFETY-002   SEVERITY: P2     CONFIDENCE: Confirmed     EFFORT: XS
CATEGORY:     SAFETY       MONEY IMPACT: None
LOCATION:     src/constants.ts:6 et src/constants.ts:17
```

**V1 [Classe A]** — Deux entrées de `PAINTING_STYLES` / catégories exposées dans l'interface :

```ts
{ id: 'heavy-metal', name: "'Eavy Metal", prompt: "in bright, saturated colors, …" }   // l. 6
{ id: 'fantasy', label: 'Fantasy / D&D' }                                              // l. 17
```

**« 'Eavy Metal » est la marque déposée de Games Workshop** désignant son équipe de peinture
interne et son style maison. **« D&D » est une marque de Wizards of the Coast.** Ce ne sont pas des
mentions descriptives : ce sont des **noms de fonctionnalités vendues** dans une application
payante.

**V2 [Classe A — distinction avec l'usage nominatif licite]** — À l'inverse, les noms de marques de
peinture (`Citadel`, `Vallejo`, `Army Painter`, `Scale75`, `Duncan` —
`app/(studio)/index.tsx:1145`) et les noms de références (`Mephiston Red`, `Abaddon Black`,
`Leadbelcher`…) relèvent de l'**usage nominatif** : désigner un produit réel par son nom pour un
catalogue de peintures est la défense la plus solide en droit des marques. Ces occurrences ne sont
pas signalées ici. La distinction est ce qui rend le finding actionnable : **deux chaînes de
caractères sont à changer, pas le catalogue.**

**FALSIFICATION.** *« 'Eavy Metal est devenu un terme générique du hobby. »* Non retenu : la marque
est activement utilisée et défendue par Games Workshop, dont la clientèle est exactement celle de
cette application. *« Ce n'est qu'un libellé, pas une revendication d'affiliation. »* Affaibli par
le contexte : le libellé désigne un style **vendu** dans une application dont le catalogue de
peintures est dominé par Citadel — l'ensemble peut raisonnablement suggérer une affiliation.

**IMPACT.** Games Workshop fait valoir ses droits avec constance, et le public de MiniStudio est
précisément sa clientèle. Le risque immédiat n'est pas un contentieux mais un **retrait des
magasins d'applications** sur signalement — mécanisme rapide, unilatéral, et qui interrompt le
revenu.

**RECOMMENDATION.** Renommer les deux préréglages en termes descriptifs : `'Eavy Metal` →
« Studio / Heroic », `Fantasy / D&D` → « Fantasy ». Le prompt sous-jacent, lui, ne nomme aucune
propriété protégée et n'a pas besoin d'être modifié. Coût : deux chaînes.
Ajouter par ailleurs aux CGU une clause d'usage : l'utilisateur reste responsable des contenus
qu'il téléverse et de leurs droits.

---

## ECON-006 — Aucun registre append-only : le solde est irréconciliable

```
ID:           ECON-006     SEVERITY: P1     CONFIDENCE: Confirmed     EFFORT: L
CATEGORY:     ECON         MONEY IMPACT: Direct revenue loss (indétectable)
```

**V1 [Classe C]** — Les 11 tables live ne comportent aucun registre de mouvements.
`generation_logs` n'enregistre que les **dépenses abouties** ; aucun octroi — ni le don de 10 tokens
de `reserve_generation`, ni les 40 tokens d'abonnement, ni les packs — n'y figure.

**V2 [Classe D : données réelles]** — Démonstration par l'exemple sur la seule ligne existante :
`purchased_balance = 21`, pour un compte ayant réalisé **379 générations facturées**. Si le solde
initial avait été l'octroi de 10 tokens, le solde attendu serait négatif. Il est positif.
**Aucune donnée en base ne permet d'expliquer cet écart** : la requête
`somme(mouvements) == solde` demandée par le §8.08 du cahier des charges **ne peut pas être
écrite**, faute de table de mouvements.

**FALSIFICATION.** *« `generation_logs` fait office de registre. »* Réfuté : il ne contient que le
débit, jamais le crédit, et il est de surcroît inscriptible par le client (`DATA-001`) — un registre
comptable modifiable par la partie intéressée n'en est pas un.
*« `processed_webhook_events` trace les achats. »* Réfuté : la table ne stocke que
`event_id` et `processed_at`, sans montant ni utilisateur, et compte **0 ligne**.

**IMPACT.** Aucune réconciliation, aucun audit, aucune reprise après incident. Si `ECON-001` ou
`ECON-002` se réalise, la perte est **structurellement indétectable** : il n'existe aucune source de
vérité contre laquelle comparer le solde. C'est aussi ce qui rend impossible toute politique
d'expiration, de remboursement partiel ou de priorité de consommation.

**RECOMMENDATION.** Table `token_ledger` append-only — `(user_id, delta, reason, ref_id,
created_at)` — écrite par **toutes** les RPC qui touchent un solde, sans exception, et sans droit
d'écriture client. Le solde devient un cache vérifiable. À faire **avant** toute acquisition
d'utilisateurs : reconstituer un registre rétroactivement est impossible.

---

## INFO-001 — `get_provider_config()` est lisible par tout compte authentifié

```
ID:           INFO-001     SEVERITY: P3     CONFIDENCE: Confirmed     EFFORT: XS
CATEGORY:     SEC          LOCATION: RPC live public.get_provider_config()
```

**V1 [Classe C]** — Corps complet, sans aucun garde :
`SELECT jsonb_object_agg(key, value_text) FROM public.app_config
WHERE key IN ('primary_provider','fallback_enabled','poyo_model');`
**V2 [Classe C]** — `has_function_privilege('authenticated', …)` = true.
La migration `sec001_get_provider_config_revoke_only` (2026-07-31) a bien révoqué `anon`, mais pas
`authenticated` — or les utilisateurs anonymes portent ce dernier rôle.

**FALSIFICATION.** *« L'information n'est pas sensible. »* Largement retenu — d'où le P3. Elle
révèle néanmoins le fournisseur et le modèle exact utilisés, information commercialement utile à un
concurrent et utile à un attaquant pour cibler `SEC-001`.

**RECOMMENDATION.** Ajouter `IF NOT is_admin() THEN RETURN NULL; END IF;` — la fonction n'est
appelée que depuis `adminService.ts:101`.

---

## PERF-001 — Le portail admin (1 557 lignes) est livré dans le bundle de tous les utilisateurs web

```
ID:           PERF-001     SEVERITY: P2     CONFIDENCE: Likely — BLOCKED (mesure requise)
EFFORT:       M            CATEGORY: PERF
LOCATION:     app/_layout.tsx:126 ; app/admin/index.tsx
```

**V1 [Classe A]** — `app/admin` est déclaré comme écran du `Stack` racine (`app/_layout.tsx:126`),
sans chargement paresseux. Le module pèse 1 557 lignes suivies (+127 non commitées) et importe
`expo-image-picker`, `expo-sharing`, `expo-file-system`, `PromptTester`, ainsi que l'intégralité de
`adminService` et `promptService`.

**BLOCKED.** Le §2B.4 interdit toute affirmation de performance sans mesure. **Aucune analyse de
bundle n'a été exécutée** (`expo export --platform web` puis inspection des chunks). Le finding est
maintenu en `Likely` : le routage d'expo-router *peut* scinder par route sur le web, ce qui
invaliderait la conclusion. **À mesurer avant correction.**

**RECOMMENDATION (conditionnelle à la mesure).** Si le module est bien dans le chunk initial, le
sortir en import dynamique. Bénéfice secondaire : cela réduit aussi la surface d'`ADMIN-001`.

---

## TEST-001 — Couverture de test nulle sur 22 332 lignes, y compris l'intégralité des chemins d'argent

```
ID:           TEST-001     SEVERITY: P1     CONFIDENCE: Confirmed     EFFORT: L
CATEGORY:     CODE         MONEY IMPACT: None directement
```

**V1 [Classe A]** — `git ls-files | grep -iE '(test|spec)\.(ts|tsx|js)$|__tests__'` → **aucun
résultat**. Aucune dépendance de test dans `package.json` (46 dépendances directes examinées).
**V2 [Classe C]** — `gh api .../actions/workflows` → `total_count: 0`. `.../environments` →
`total_count: 0`. Aucune branche Supabase (`list_branches`). Aucun environnement de non-production
n'existe.

**IMPACT.** `ECON-005` est la démonstration directe : un chemin cassé par une contradiction entre
deux fragments SQL, invisible depuis six mois, qui n'échouera qu'en production au premier usage.
L'absence d'environnement de non-production est de surcroît un **obstacle d'audit** : elle est la
raison pour laquelle `ECON-001` reste `Likely`.

**RECOMMENDATION.** Ne pas viser une couverture globale. Trois cibles, par ordre de rendement :
1. **Test de concurrence sur `reserve_generation`** — le seul qui protège du double-débit.
2. **Test de rejeu du webhook RevenueCat** — deux livraisons identiques, solde inchangé.
3. **Test unitaire de `generatePaintPrompt`** — jeu doré couvrant les 8 `product_type` (cf.
   `AI-001`). Sans réseau, écrit en une heure, et il verrouille la correction produit la plus
   visible.

---

## AI-003 — **La configuration de production est à marge négative sur 2 des 3 offres**, et quatre modèles du menu admin le sont davantage

```
ID:           AI-003       SEVERITY: P0     CONFIDENCE: Confirmed     EFFORT: S
CATEGORY:     AI           MONEY IMPACT: Direct cost exposure — chaque génération
                                         vendue en abonnement annuel perd de l'argent
                                         au taux de commission standard
LOCATION:     app/admin/index.tsx:40-64 (menu des 18 modèles) ↔
              generate-miniature/index.ts:56-58 (prix plat de 1 token)
```

### VERIFICATION 0 — [Classe D : console PoYo du titulaire du compte] — **la donnée décisive**

Capture de la console PoYo fournie le 2026-08-05. Onze tâches consécutives, du 2026-07-31 au
2026-08-02, toutes `Completed`, toutes sur le modèle **`nano-banana-pro-edit`**, chacune portant la
valeur **`18`** en colonne de consommation.

À 0,005 $/crédit (Classe E, `poyo.ai/pricing`) : **18 × 0,005 = 0,090 $ par génération.**

Trois corroborations indépendantes de ce chiffre :
1. la console elle-même (Classe D, données facturées réelles) ;
2. le taux de conversion publié, 5 crédits = 0,025 $ (Classe E) ;
3. PoYo se positionne 40 % sous le tarif officiel Fal de 0,150 $ → 0,150 × 0,6 = **0,090 $**.

**Correction d'une erreur de cet audit.** J'avais retenu 0,040 $ en lisant la ligne
`Nano Banana Pro @1K/2K — 8 crédits` de la page tarifaire. C'est le tarif de la variante **normale**.
`nano-banana-pro-edit` est un **modèle distinct**, à **2,25× ce prix** — ce que le code dit
d'ailleurs explicitement (`submitPoyoTask`, l. 171 : « *normal vs -edit are distinct models* »).
La page `/pricing` ne détaille pas les variantes `-edit` ; seule la console le révèle.

### VERIFICATION 0b — [Classe D] — nombre de clés en rotation

La même capture montre cinq intitulés de clés distincts : `MiniPainter Studio`, `MiniPainter
Studio 2`, `3`, `4`, `5`. **5 clés en rotation**, information jusque-là inaccessible (table en schéma
`private`). Reprise dans le modèle de perte de `COST-001`.

### VERIFICATION 1 — [Classe E : tarifs publiés par le fournisseur]

`https://poyo.ai/pricing`, consultée le 2026-08-05. Barème réel des modèles **sélectionnables depuis
le portail admin** (1 crédit ≈ 0,005 $) :

| Modèle | Prix PoYo réel |
|---|---:|
| `z-image` | **0,010 $** |
| `wan-2.7-image` standard | 0,021 $ |
| `nano-banana`, `nano-banana-2`, `seedream-4`, `seedream-4.5` (+ variantes `-edit`) | 0,025 $ |
| **`nano-banana-pro` @1K/2K** *(actif en production)* | **0,040 $** |
| `flux-kontext-pro` | 0,040 $ |
| `wan-2.7-image` pro | 0,052 $ |
| `nano-banana-pro` @4K | 0,070 $ |
| `flux-kontext-max` | **0,080 $** |
| `gpt-image-2` low 1K→4K | 0,010 → 0,040 $ |
| `gpt-image-2` medium 1K→4K | 0,042 → **0,081 $** |
| `gpt-image-2` high 1K→4K | **0,169 → 0,321 $** |

**Amplitude : 0,010 $ à 0,321 $, soit un facteur 32** — tous facturés **1 token** à l'utilisateur.

### VERIFICATION 2 — [Classe D : données réelles de production]

`generation_logs`, 379 lignes. Modèles réellement soumis, avec leur coût réel :

| `model_used` | générations | coût unitaire réel | facturé |
|---|---:|---:|---:|
| `nano-banana-pro-edit` | 157 | 0,040 $ | 1 token |
| `nano-banana-2-edit` | 37 | 0,025 $ | 1 token |
| `nano-banana-edit` | 2 | 0,025 $ | 1 token |
| **`flux-kontext-max-edit`** | 1 | **0,080 $** | 1 token |
| **`gpt-image-2-edit`** | 1 | **0,010 – 0,321 $** | 1 token |
| `poyo` (littéral hérité) | 181 | indéterminé | 1 token |

`flux-kontext-max-edit` — le modèle le plus cher hors `gpt-image-2` — **a effectivement été soumis en
production** au même prix qu'un modèle à 0,025 $.

### FALSIFICATION — deux tentatives

1. **« La constante de 0,05 $ du portail est peut-être une moyenne prudente qui couvre tout. »**
   *Réfuté.* Elle sous-estime `flux-kontext-max` (0,080 $), `gpt-image-2` medium 4K (0,081 $) et
   surtout `gpt-image-2` high (jusqu'à 0,321 $) — d'un facteur 6. Elle surestime `z-image` (0,010 $)
   d'un facteur 5. Elle n'est juste pour aucun modèle réellement utilisé.
2. **« L'application demande peut-être toujours la qualité la moins chère. »**
   *Partiellement retenu, insuffisant.* `submitPoyoTask` (l. 177-192) n'envoie que
   `{model, input:{prompt, size:'1:1'}}` : **aucun paramètre de qualité ni de résolution**. Le tarif
   appliqué est donc celui du **défaut de PoYo**, non maîtrisé côté application et susceptible de
   changer sans préavis. L'exposition est réelle sur toute la plage tarifaire du modèle sélectionné.

### IMPACT — table de marge

Revenu net par token, après commission magasin de 30 % *(prix issus des données de simulation
`purchaseService.ts:137-182` — **à confirmer sur App Store Connect / Play Console**)* :

| Offre | Prix | Tokens | Brut/token | **Net/token** |
|---|---:|---:|---:|---:|
| `pro_monthly` | 5,99 $ | 40 | 0,150 $ | **0,105 $** |
| `tokens_150` | 17,99 $ | 150 | 0,120 $ | **0,084 $** |
| `pro_annual` | 53,88 $ | 480 | 0,112 $ | **0,079 $** |

**La configuration de production, d'abord :**

| Offre | Net/token @30 % | Coût réel | **Marge** | Net/token @15 % | Marge @15 % |
|---|---:|---:|---:|---:|---:|
| `pro_monthly` | 0,105 $ | 0,090 $ | **+0,015 $ (14 %)** | 0,127 $ | +0,037 $ (29 %) |
| `tokens_150` | 0,084 $ | 0,090 $ | **−0,006 $** ❌ | 0,102 $ | +0,012 $ (12 %) |
| `pro_annual` | 0,079 $ | 0,090 $ | **−0,011 $ (−14 %)** ❌ | 0,095 $ | +0,005 $ (6 %) |

**Au taux de commission standard de 30 %, deux offres sur trois perdent de l'argent à chaque
génération.** Au taux de 15 % du *Small Business Program*, tout redevient positif — mais l'offre
annuelle ne dégage plus que **6 %**, avant frais de plateforme, support et TVA.

**Le taux de commission décide donc de la viabilité du produit.** Vérifier votre inscription au
Small Business Program est l'action à plus fort impact financier de cet audit, et elle ne demande
aucun développement.

**Les autres modèles du menu, du meilleur au pire :**

| Modèle | Coût | Marge @ annuel (0,079 $) | Marge @ mensuel (0,105 $) |
|---|---:|---:|---:|
| `z-image` | 0,010 $ | +0,069 $ (**87 %**) | +0,095 $ |
| `nano-banana-2-edit`, `seedream-*` | 0,025 $ | +0,054 $ (68 %) | +0,080 $ |
| `flux-kontext-pro` | 0,040 $ | +0,039 $ (49 %) | +0,065 $ |
| `wan-2.7-image` pro | 0,052 $ | +0,027 $ | +0,053 $ |
| **`flux-kontext-max`** | 0,080 $ | **−0,001 $** ❌ | +0,025 $ |
| **`gpt-image-2` medium 4K** | 0,081 $ | **−0,002 $** ❌ | +0,024 $ |
| **`nano-banana-pro-edit`** *(prod)* | **0,090 $** | **−0,011 $** ❌ | **+0,015 $** |
| **`gpt-image-2` high 1K** | 0,169 $ | **−0,090 $** ❌❌ | **−0,064 $** ❌ |
| **`gpt-image-2` high 4K** | 0,321 $ | **−0,242 $ (−306 %)** ❌❌❌ | **−0,216 $** ❌ |

⚠️ Les coûts des variantes `-edit` des autres modèles **n'ont pas pu être établis** : la page
`/pricing` ne les détaille pas, et la console ne montre que le modèle réellement employé. Puisque
`nano-banana-pro-edit` coûte **2,25×** sa variante normale, **les lignes ci-dessus sont
probablement sous-estimées pour toutes les variantes `-edit`** — c'est-à-dire pour tous les modèles
que MiniStudio utilise réellement, puisqu'il soumet toujours une image source. **À vérifier dans
votre console, modèle par modèle : c'est l'information la plus décisive qui vous manque encore.**

**Effets dérivés, recalculés :**
- **Tier gratuit** : 10 tokens offerts = **0,90 $** de coût réel, 0 $ de revenu, par compte créé.
- **Perte maximale sur 24 h** : **5 clés** en rotation × 5 req/min = 36 000 générations/jour
  × 0,090 $ = **~3 240 $/jour**, soit **9×** l'estimation initiale.

### RECOMMENDATION

1. **Retirer du menu les modèles à marge négative**, ou les conditionner à un palier tarifaire
   distinct. C'est un correctif XS avec le meilleur rendement du document.
2. **Faire dériver le coût en tokens du modèle réellement soumis** (cf. `AI-002`) : `z-image` à
   1 token, `nano-banana-pro` à 1, `flux-kontext-max` à 2, `gpt-image-2` high à 4.
3. **Afficher la marge dans le sélecteur de modèle**, et non le coût seul. Le choix est fait par un
   humain dans une interface : c'est là que l'information doit être.
4. **Fixer explicitement la qualité et la résolution** dans `submitPoyoTask`. Aujourd'hui vous
   subissez le défaut du fournisseur, qui peut changer sans préavis.
5. **Confirmer les prix de vente réels** sur App Store Connect et Play Console. Les valeurs
   ci-dessus proviennent des données de simulation du code — **la marge réelle peut différer, et si
   les prix réels sont inférieurs, davantage de modèles basculent en négatif.**

### DEPENDENCIES

Dépend d'`AI-002` pour les points 2 et 3. Le point 1 est applicable immédiatement.

---

*Fin des findings. **21 findings** : **7 × P0**, 8 × P1, 5 × P2, 1 × P3.*
*Confiance : **20 `Confirmed`**, 1 `Likely` (`ECON-001`, expérimentalement inisolable tant qu`ECON-002` existe). `PERF-001` reste `Likely` faute de mesure de bundle.*
