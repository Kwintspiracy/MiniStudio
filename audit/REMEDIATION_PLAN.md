# MiniStudio — Plan de remédiation

Trois vagues. Chaque action porte un identifiant de finding, un effort et ses dépendances.
**Séquencement d'abord, exhaustivité ensuite** : plusieurs correctifs sont dangereux dans le mauvais
ordre, et c'est le point le plus important de ce document.

**Contexte favorable :** 1 utilisateur réel, 0 achat traité, 0 job en cours. **Tout est corrigeable
avant exposition.** Cette fenêtre se referme au lancement.

---

## ⚠️ Les trois pièges de séquencement

Avant toute chose. Chacun transforme un correctif en panne.

**1. Rotationner le secret JWT casse les deux applications installées.**
La rotation invalide simultanément la clé `service_role` divulguée **et** la clé `anon` figée dans
`app.json:78` et dans les builds MiniPainterDB déjà distribués.
→ *Ordre imposé :* migrer les deux apps vers la clé *publishable* déjà provisionnée
(`sb_publishable_…`, rotationnable indépendamment) → publier les builds → **puis** rotationner.

**2. Redéployer le webhook PoYo du dépôt casse toutes les générations. ✅ CONFIRMÉ.**
La documentation PoYo (relevée le 2026-08-05) est formelle : **PoYo n'émet aucun en-tête
`Authorization`.** L'authentification se fait par `X-Webhook-Signature` (HMAC-SHA256 de
`task_id + "." + timestamp`) et `X-Webhook-Timestamp` (fenêtre de 300 s). La version *fail-closed*
du dépôt, qui compare un Bearer, **rejetterait 100 % des callbacks légitimes**.
→ *Correctif déterminé :* implémenter la vérification HMAC, **et non** redéployer le fichier.

**3. Ajouter la soustraction des réservations sans expirer les jobs orphelins bloque des
utilisateurs légitimes.**
Dès que `(solde − réservations)` gouverne la décision, tout job resté `reserved` immobilise
définitivement un token.
→ *Ordre imposé :* expiration des réservations **dans la même migration** que la soustraction.

---

## Vague 1 — Tous les P0, plus les P1 en XS/S

**Objectif : rendre le système défendable. À faire avant toute acquisition d'utilisateurs.**

| # | Action | Finding | Effort | Dépend de |
|---|---|---|---|---|
| 1.1 | ✅ **Fait** — Q9 tranchée : PoYo signe en **HMAC-SHA256**, sans en-tête `Authorization`. | `SEC-001` | — | — |
| 1.2 | **Fermer le webhook PoYo par vérification de signature.** Récupérer la clé (`GET /api/api-keys/webhook-secret`) · vérifier `X-Webhook-Timestamp` (fenêtre 300 s) · recalculer `base64(HMAC-SHA256(task_id + "." + timestamp, key))` · comparer **en temps constant** · ne traiter le corps qu'après validation. Supprimer ensuite `POYO_WEBHOOK_SECRET`, qui n'a jamais servi. | `SEC-001` | S | — |
| 1.2b | **Retirer du menu admin les 4 modèles à marge négative** (`flux-kontext-max`, `gpt-image-2` medium 4K et high 1K/4K), ou les conditionner à un palier tarifaire distinct. Meilleur rendement du plan. | `AI-003` | XS | — |
| 1.3 | **Valider `p_image_url`** dans `complete_poyo_job` contre l'allowlist d'hôtes déjà définie (`ALLOWED_SOURCE_IMAGE_HOSTS`). Referme la variante « image choisie par l'attaquant » même si le contrôle d'accès retombe. | `SEC-001` | XS | — |
| 1.4 | **Migrer les deux apps vers la clé *publishable*** et publier les builds. | `CROSS-001` | S | — |
| 1.5 | **Rotationner le secret JWT.** Invalide la clé `service_role` divulguée. | `CROSS-001` | XS | **1.4** |
| 1.6 | **Rotationner la clé API PoYo** — compromise par dérivation. | `CROSS-001` | XS | 1.5 |
| 1.7 | **Activer *secret scanning* et *push protection*** sur les deux dépôts. Coût nul, aurait bloqué le commit fautif. | `CROSS-001` | XS | — |
| 1.8 | **Détection CSAM sur l'upload**, avant `uploadToPoyo`, **plus une procédure de signalement écrite**. La détection sans procédure ne satisfait pas l'obligation. | `SAFETY-001` | M | — |
| 1.9 | **Refus des photographies de visages humains.** Cohérent avec la promesse produit, et supprime la classe de risque la plus lourde. Contrôle serveur obligatoire. | `SAFETY-001` | M | — |
| 1.10 | **Une seule migration économie** : `FOR UPDATE` sur `user_entitlements` dans `reserve_generation` · soustraction des réservations **dans la décision** · `CHECK (purchased_balance >= 0)` et `CHECK (tier_tokens >= 0)` · expiration des jobs `reserved` au-delà de N minutes. **Démontré en production le 2026-08-05 : 5 réservations accordées sur un compte à 1 token, solde retourné jusqu'à −4.** | `ECON-001` `ECON-002` `ECON-004` | M | — |
| 1.10b | **Fermer le farming de tokens gratuits.** Appliquer le contrôle `device_tokens` à **tous** les comptes, pas aux seuls anonymes (`IF p_device_id IS NOT NULL THEN`), et **enregistrer le device dans les deux branches**. Créer la ligne `user_entitlements` dans le trigger `handle_new_user` plutôt qu'à la première génération. Verser les tokens gratuits dans `tier_tokens`. **Démontré : 4 cycles supprimer/recréer = 10 tokens à chaque fois, device jamais enregistré, `device_tokens` vide depuis 6 mois.** | `ECON-003` | S | — |
| 1.11 | **Plafond de dépense global quotidien**, vérifié avant soumission, avec arrêt au franchissement. Le seul garde-fou dont l'absence n'a aucune borne. | `COST-001` | M | — |
| 1.12 | **Plafond de concurrence : 1 job `reserved` par utilisateur.** Simple, et referme `ECON-001` par construction. | `COST-001` | S | 1.10 |
| 1.13 | **Supprimer la politique `Users can insert own logs`.** Aucun chemin légitime n'en dépend. | `DATA-001` | XS | — |
| 1.14 | **Garde `auth.uid()`** sur les trois RPC de consommation. | `AUTHZ-001` | XS | — |
| 1.15 | **Renommer les deux préréglages** : `'Eavy Metal` → « Studio / Heroic », `Fantasy / D&D` → « Fantasy ». | `SAFETY-002` | XS | — |
| 1.16 | **Corriger `ECON-005`** : ajouter `'unlimited'` à la contrainte `consumption_source`. | `ECON-005` | XS | — |
| 1.17 | **Garde `is_admin()`** sur `get_provider_config()`. | `INFO-001` | XS | — |

**Effort Vague 1 : ~3 XS·h + 4 S·j + 4 M·j ≈ 2 à 3 semaines** pour un développeur unique.
**Bloque le lancement public :** 1.1→1.6, 1.8, 1.9.

---

## Vague 2 — P1 restants et P2 à forte valeur

**Objectif : rendre le système mesurable et gouvernable.**

| # | Action | Finding | Effort | Dépend de |
|---|---|---|---|---|
| 2.1 | **Registre `token_ledger` append-only** — `(user_id, delta, reason, ref_id, created_at)`, écrit par **toutes** les RPC touchant un solde, sans droit d'écriture client. **À poser avant toute acquisition : il ne se reconstitue pas.** | `ECON-006` | L | 1.10 |
| 2.2 | **Enregistrer le coût fournisseur réel** par génération (`provider_cost_usd` sur `generation_jobs`). Sans lui, aucune décision de marge n'est possible. | `AI-002` | M | — |
| 2.3 | **Table de prix serveur indexée par modèle PoYo.** Le coût en tokens doit dériver du modèle réellement soumis, pas d'une constante Google. | `AI-002` | M | 2.2 |
| 2.4 | **Obtenir les tarifs PoYo réels et les prix de vente des SKU**, puis produire la table de marge. Ne dépend d'aucun développement. | `AI-002` | S | — |
| 2.5 | **Corriger `AI-001`** : ajouter `product_type` et `opacity` à `PAINT_COLUMNS`, brancher des blocs `[Washes]` / `[Contrast]` frères de `[Metallics]`, **et bumper la clé du cache `paints_cache`** (sinon 24 h de cache périmé). | `AI-001` | S | — |
| 2.6 | **Journal d'audit admin immuable.** Sans lui, aucun incident n'est instruisible. Le point le plus rentable d'`ADMIN-001`. | `ADMIN-001` | M | — |
| 2.7 | **MFA sur les comptes admin** (natif Supabase). Aligner le garde client sur `is_admin()`. | `ADMIN-001` | S | — |
| 2.8 | **Réconcilier dépôt et production** : `supabase db pull` (⚠️ Docker Desktop absent localement — premier obstacle), `migration repair`, **commiter le travail de juillet**. | `OPS-001` | M | — |
| 2.9 | **Contrôle de dérive automatique** : comparer `list_migrations` aux fichiers et les `ezbr_sha256` des edge functions à un build local. C'est ce qui aurait révélé `SEC-001` cinq mois plus tôt. | `OPS-001` | S | 2.8 |
| 2.10 | **Trois tests, par ordre de rendement** : concurrence sur `reserve_generation` · rejeu du webhook RevenueCat · unitaire sur `generatePaintPrompt` avec jeu doré des 8 `product_type`. | `TEST-001` | M | 2.5 |
| 2.11 | **Environnement de non-production** (branche Supabase, ~0,32 $/j) — **après** 2.8, sans quoi la branche ne reproduirait pas la production. | `TEST-001` | S | 2.8 |
| 2.12 | **Chemin de signalement et de retrait** dans l'interface. Exigé par les magasins. **Prérequis : maîtriser le stockage des images** — on ne retire pas ce qu'on n'héberge pas. | `SAFETY-001` | M | 2.13 |
| 2.13 | **Rapatrier le stockage des images** vers Supabase Storage avec URL signées. Referme aussi la suppression sur demande et la rétention. | `SAFETY-001` 13.12–13.15 | L | — |
| 2.14 | **Modération sémantique du prompt** côté serveur, en complément des sanitizers. | `SAFETY-001` | S | — |
| 2.15 | **Vérification d'âge** et **CGU / politique de confidentialité** (responsabilité utilisateur, propriété des images, transfert vers PoYo). | `SAFETY-001` §9.11 | S | 2.16 |
| 2.16 | **Obtenir les conditions PoYo** sur la rétention des images et des prompts. | 10.20 | XS | — |
| 2.17 | **Réconciliation des jobs orphelins** côté serveur, indépendante du client. | 10.07 | S | 1.10 |
| 2.18 | **Alerting** sur dépense anormale, taux d'échec, profondeur de file. | `COST-001` | S | 1.11, 2.2 |
| 2.19 | **Ne plus faire confiance à `x-forwarded-for`** client, ou l'assumer explicitement. | `COST-001` | XS | — |

**Effort Vague 2 : ~6 à 8 semaines.**

---

## Vague 3 — P2 et P3 restants, dette

| # | Action | Finding | Effort |
|---|---|---|---|
| 3.1 | **Mesurer le bundle** (`expo export --platform web`) puis, si confirmé, sortir le portail admin en import dynamique. | `PERF-001` | M |
| 3.2 | **Diagnostiquer le slider de couleur erratique** — mesure requise, écran de 1 834 lignes à lire. | 13.11 | M |
| 3.3 | **Stocker la version du gabarit de prompt avec chaque génération** — reproductibilité et traçabilité des régressions. | 12.05 | S |
| 3.4 | **Stocker les seeds** pour permettre l'itération sur un résultat. | 12.08 | S |
| 3.5 | **Normaliser l'image d'entrée** : redimensionnement, orientation EXIF, validation avant réservation. Évite de dépenser un token pour une requête que le fournisseur refusera. | 12.09, 12.10 | S |
| 3.6 | **Audit d'accessibilité WCAG 2.1 AA**, avec attention à l'information portée par la couleur seule — risque aigu dans cette famille de produits. | 13.25, 13.26 | M |
| 3.7 | **Traiter les 30 vulnérabilités npm** après avoir déterminé lesquelles atteignent le bundle expédié. Le correctif proposé est `expo@57` — un chantier, pas un patch. | 5B.18 | M |
| 3.8 | **Décider du sort de `app/api-key.tsx`** (vestige « bring your own key », 192 lignes). | 3.9 | XS |
| 3.9 | **Déployer ou supprimer `send-feedback`** — présente au dépôt, jamais déployée. | Q10 | XS |
| 3.10 | **Retirer `generate-miniature/index.ts.bak`** du dépôt. | hygiène | XS |
| 3.11 | **Protection de branche sur `main`** + décider si le dépôt reste public. | 5B.17, 5B.01 | XS |
| 3.12 | **Schéma `studio.*` dédié** avec droits distincts — cloisonnement logique sans coût de latence. | `AUDIT_CROSS_APP` §6 | L |
| 3.13 | **Contrat de schéma sur `paints`** : version, et déclaration par chaque consommateur des colonnes dont il dépend. C'est ce qui aurait évité `AI-001`. | `AUDIT_CROSS_APP` §6 | M |
| 3.14 | **Désigner le responsable de traitement** et unifier la suppression de compte entre les deux applications. | 5.09 | S |

---

## Matrice impact / effort

```
IMPACT
  ▲
  │  1.5 CROSS-001      │  1.8 SAFETY-001
Ê │  1.2 SEC-001        │  1.9 SAFETY-001
L │  1.13 DATA-001      │  1.10 ECON-001/002/004
E │  1.14 AUTHZ-001     │  1.11 COST-001
V │  1.7 scanning       │  2.1  ECON-006
É │  1.16 ECON-005      │  2.13 stockage images
  ├─────────────────────┼──────────────────────────
F │  1.15 SAFETY-002    │  2.6  ADMIN-001 (audit)
A │  1.17 INFO-001      │  2.8  OPS-001
I │  2.5  AI-001        │  2.10 TEST-001
B │  3.10 hygiène       │  3.1  PERF-001
L │  3.8/3.9 vestiges   │  3.12 schéma dédié
E │                     │  3.6  accessibilité
  └─────────────────────┴──────────────────────────► EFFORT
       XS / S                    M / L
```

**Quadrant supérieur gauche : à faire cette semaine.** Fort impact, effort minime.
`1.7` (activer le secret scanning) et `1.13` (supprimer une politique RLS superflue) coûtent
chacun quelques minutes.

---

## Ordre d'exécution recommandé

**Semaine 1** — 1.1, 1.7, 1.13, 1.14, 1.15, 1.16, 1.17, 1.3 *(tout le quadrant XS, plus la question
bloquante à PoYo).*
**Semaine 2** — 1.4, puis 1.5, 1.6 *(la rotation, dans l'ordre).* En parallèle : 1.2, une fois Q9
tranchée.
**Semaines 3-4** — 1.10, 1.11, 1.12 *(l'économie, en une migration).*
**Semaines 4-6** — 1.8, 1.9 *(la sécurité des contenus — bloquant pour le lancement).*
**Puis** Vague 2, en commençant par 2.8 *(réconcilier)* et 2.1 *(le registre)*, car tout le reste en
dépend.

**Ce qui casse si vous différez :**

- **1.2 différé** → le webhook reste ouvert à Internet ; la fenêtre d'exploitation s'ouvre à chaque
  génération.
- **1.5 différé** → une clé pleine autorité circule dans un historique git jusqu'en 2035.
- **1.8/1.9 différés** → vous ne pouvez pas lancer. Ce n'est pas un arbitrage, c'est une condition.
- **1.10/1.11 différés** → sans borne supérieure à votre facture PoYo.
- **2.1 différé** → le registre ne se reconstitue pas. Chaque jour d'attente est de l'historique
  définitivement perdu.
