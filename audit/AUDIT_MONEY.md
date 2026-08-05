# MiniStudio — Analyse économique

Consolidation des findings `ECON-*`, `BILL-*`, `AI-*` et `COST-001`.
Toutes les valeurs proviennent du code, du schéma déployé ou des données réelles de production.
**Ce qui manque est signalé explicitement, jamais comblé par estimation.**

---

## 1. Où vit l'argent

Table unique : **`public.user_entitlements`** (1 ligne en production).

| Colonne | Rôle |
|---|---|
| `purchased_balance` | solde principal — **reçoit aussi les tokens gratuits** |
| `tier_tokens` | solde de palier (0 partout aujourd'hui) |
| `daily_tokens`, `weekly_tokens`, `monthly_tokens` | compteurs hérités, non utilisés dans le chemin de décision |
| `is_unlimited` | contournement total — **et cassé, cf. `ECON-005`** |

**RLS live :** `SELECT` sur sa propre ligne uniquement. **Aucune politique d'écriture client.**
Le solde n'est donc mutable que par les RPC `SECURITY DEFINER`. C'est le bon design — et cela
déplace la totalité du risque *dans* ces fonctions.

**Aucun registre append-only n'existe** (`ECON-006`). La requête `somme(mouvements) == solde`
exigée par le cahier des charges **ne peut pas être écrite**.

---

## 2. Flux SORTANT — l'utilisateur dépense

```
client → generate-miniature (verify_jwt=true)
       → MODEL_COSTS[targetModel]  ────────────────► TOUJOURS 1
       → reserve_generation(user, 1, device_id, metadata)
            ├─ garde auth.uid() ✅
            ├─ si aucun entitlement → OCTROI DE 10 TOKENS (voir §3)
            ├─ authorize_generation(user, 1)
            │     └─ lit user_entitlements SEUL. Ignore generation_jobs. ❌ ECON-002
            │        aucun FOR UPDATE ❌ ECON-001
            └─ INSERT generation_jobs status='reserved'   ← AUCUN DÉBIT ICI
       → get_available_poyo_key()  [service_role]
       → uploadToPoyo + submitPoyoTask(model = app_config.poyo_model)
       → retour {job_id, 'processing'}
                          │
PoYo ─── callback ────────┘
       → poyo-webhook (AUCUNE AUTH ❌ SEC-001)
       → complete_poyo_job  [service_role, FOR UPDATE ✅]
            ├─ succès : UPDATE user_entitlements SET purchased_balance -= 1
            │           (sans condition de solde, sans CHECK ❌ ECON-004)
            │           + INSERT generation_logs
            └─ échec  : job → 'failed', aucun débit
```

**Le débit est postérieur au succès.** La réservation n'est qu'une écriture de suivi : elle
n'immobilise rien et n'est opposable à aucune décision.

---

## 3. Flux ENTRANT — « suivre l'argent à rebours »

| # | Chemin | Déclencheur | Montant | Contrôle réel |
|---|---|---|---:|---|
| **E1** | `reserve_generation`, branche device | 1ʳᵉ génération d'un **anonyme** avec `device_id` inconnu | **+10** | `device_tokens.device_id` **UNIQUE** ✅ |
| **E2** | `reserve_generation`, branche fallback | utilisateur **non anonyme** sans entitlement, **ou** `device_id` NULL | **+10** | **AUCUN** ⚠️ |
| **E3** | `increment_token_balance` via webhook | `INITIAL_PURCHASE` / `RENEWAL` sur `pro_monthly` / `pro_annual` | **+40** | idempotence globale ✅ |
| **E4** | `increment_token_balance` via webhook | `NON_RENEWING_PURCHASE` | 150/150/50/50/10 | idempotence globale ✅ |
| **E5** | `refill_tier_tokens` / `reset_tier_tokens` | cron | ? | **aucun cron trouvé** — code mort probable |
| **E6** | Admin | — | — | **aucune RPC de crédit admin parmi les 40 fonctions live** |

**E6 contredit une hypothèse de départ de la mission.** Il n'existe aucun chemin permettant à un
administrateur de créditer un solde. Le portail ne peut pas créer de monnaie. C'est un point
favorable, et il abaisse la criticité de `ADMIN-001` par rapport à ce qui était anticipé.

**E2 est le chemin à instruire.** Il octroie 10 tokens à tout compte dépourvu d'entitlement, sans
contrôle de device. Combiné à la cascade de `delete-account` (qui supprime `user_entitlements`),
un cycle supprimer/recréer pourrait le redéclencher. **Non prouvé — test d'écriture requis,
`BLOCKED`.**

**Les tokens gratuits atterrissent dans `purchased_balance`**, pas dans `tier_tokens`. Gratuit et
payé sont indiscernables : aucune politique différenciée d'expiration, de remboursement ou de
priorité n'est possible.

---

## 4. Table modèle → prix → coût → marge

### Ce qui est établi

| Élément | Valeur | Source |
|---|---|---|
| Prix facturé à l'utilisateur | **1 token, quel que soit le modèle** | `MODEL_COSTS`, edge l. 56-58 ; confirmé sur 379 lignes de `generation_logs` où `sum(cost_units) = count(*)` |
| Modèle actif en production | **`nano-banana-pro-edit`** | `app_config.poyo_model` (live) |
| Modèles sélectionnables par l'admin | **18** | `app/admin/index.tsx:40-64` |
| Coût PoYo supposé par le portail | **0,05 $ à plat, tous modèles** | `POYO_COST_PER_GENERATION`, `app/admin/index.tsx:1405` |
| Tarif Gemini connu | 0,25 $/1M entrée, **60,00 $/1M sortie** | `MODEL_PRICING`, l. 1402-1404 |

### Modèles réellement utilisés en production

| `model_used` | générations | tokens facturés | coût affiché par le portail |
|---|---:|---:|---|
| `poyo` (littéral hérité) | 181 | 181 | 0,05 $ |
| `nano-banana-pro-edit` | 157 | 157 | 0,05 $ |
| `nano-banana-2-edit` | 37 | 37 | 0,05 $ |
| `nano-banana-edit` | 2 | 2 | 0,05 $ |
| **`flux-kontext-max-edit`** | 1 | 1 | 0,05 $ |
| **`gpt-image-2-edit`** | 1 | 1 | 0,05 $ |

Un modèle haut de gamme et un modèle d'entrée ont été facturés **au même prix à l'utilisateur** et
affichés **au même coût** dans le portail.

### TABLE DE MARGE — tarifs réels PoYo, relevés le 2026-08-05

Source : `https://poyo.ai/pricing` (Classe E). 1 crédit ≈ 0,005 $.

Revenu net par token, commission magasin de 30 % *(prix issus des données de simulation
`purchaseService.ts:137-182` — **à confirmer sur App Store Connect / Play Console**)* :

| Offre | Prix | Tokens | Brut/token | **Net/token** |
|---|---:|---:|---:|---:|
| `pro_monthly` | 5,99 $ | 40 | 0,150 $ | **0,105 $** |
| `tokens_150` | 17,99 $ | 150 | 0,120 $ | **0,084 $** |
| `pro_annual` | 53,88 $ | 480 | 0,112 $ | **0,079 $** |

> ### ⚠️ CORRECTION — le modèle de production coûte **0,090 $**, pas 0,040 $
>
> Établi par la **console PoYo de l'utilisateur** (Classe D, capture du 2026-08-05) : chaque tâche
> `nano-banana-pro-edit` consomme **18 crédits**. À 0,005 $/crédit → **0,090 $/génération**.
> Corroboré : PoYo se positionne 40 % sous le tarif officiel Fal de 0,150 $ → 0,090 $.
>
> La page `/pricing` annonce 8 crédits pour `nano-banana-pro` @1K/2K. **La variante `-edit` — la
> seule utilisée par MiniStudio — coûte 2,25× plus.** Les variantes normales et `-edit` sont des
> modèles distincts et tarifés distinctement ; le commentaire de `submitPoyoTask` (l. 171) le dit
> d'ailleurs explicitement.
>
> **Conséquence : votre configuration de production est à marge négative sur 2 des 3 offres,
> à commission magasin de 30 %.**
>
> | Offre | Net/token @30 % | Coût réel | **Marge** | Net/token @15 % | **Marge @15 %** |
> |---|---:|---:|---:|---:|---:|
> | `pro_monthly` | 0,105 $ | 0,090 $ | **+0,015 $ (14 %)** | 0,127 $ | +0,037 $ (29 %) |
> | `tokens_150` | 0,084 $ | 0,090 $ | **−0,006 $** ❌ | 0,102 $ | +0,012 $ (12 %) |
> | `pro_annual` | 0,079 $ | 0,090 $ | **−0,011 $ (−14 %)** ❌ | 0,095 $ | +0,005 $ (6 %) |
>
> **Le taux de commission décide de la viabilité.** À 30 % (taux standard), deux offres sur trois
> perdent de l'argent à chaque génération. À 15 % (*Small Business Program* — accessible sous
> 1 M$/an de revenus, ce qui est certainement votre cas), tout est positif mais **l'offre annuelle
> ne dégage que 6 %**, avant frais de plateforme, support et TVA.
>
> **Vérifier votre inscription au Small Business Program est, en l'état, l'action à plus fort impact
> financier de tout cet audit.**

**Marge par génération, pour les 18 modèles sélectionnables depuis le portail admin :**

| Modèle | Coût PoYo | Marge @ annuel | Marge @ mensuel | Verdict |
|---|---:|---:|---:|---|
| `z-image` | 0,010 $ | +0,069 $ (87 %) | +0,095 $ | ✅ |
| `gpt-image-2` low 1K | 0,010 $ | +0,069 $ | +0,095 $ | ✅ |
| `wan-2.7-image` std | 0,021 $ | +0,058 $ | +0,084 $ | ✅ |
| `nano-banana`, `-2`, `seedream-4`, `-4.5` | 0,025 $ | +0,054 $ (68 %) | +0,080 $ | ✅ |
| **`nano-banana-pro` @1K/2K** *(prod)* | **0,040 $** | **+0,039 $ (49 %)** | +0,065 $ | ✅ |
| `flux-kontext-pro` | 0,040 $ | +0,039 $ | +0,065 $ | ✅ |
| `wan-2.7-image` pro | 0,052 $ | +0,027 $ | +0,053 $ | ✅ |
| `nano-banana-pro` @4K | 0,070 $ | +0,009 $ (11 %) | +0,035 $ | ⚠️ marge résiduelle |
| **`flux-kontext-max`** | 0,080 $ | **−0,001 $** | +0,025 $ | ❌ **négatif** |
| **`gpt-image-2` medium 4K** | 0,081 $ | **−0,002 $** | +0,024 $ | ❌ **négatif** |
| **`gpt-image-2` high 1K** | 0,169 $ | **−0,090 $** | **−0,064 $** | ❌❌ **négatif partout** |
| **`gpt-image-2` high 4K** | 0,321 $ | **−0,242 $ (−306 %)** | **−0,216 $** | ❌❌❌ |

**Amplitude des coûts : 0,010 $ → 0,321 $, facteur 32. Prix utilisateur : 1 token, invariablement.**

**Quatre entrées du menu admin sont à marge négative sur l'offre annuelle ; deux le sont sur toutes
les offres.** Le portail affiche 0,05 $ pour toutes. Voir `AI-003`.

**Le modèle actif en production, `nano-banana-pro-edit`, dégage ~49 % de marge sur l'offre la plus
défavorable.** C'est sain. Le risque n'est pas la configuration actuelle — c'est qu'un changement
d'une seule valeur dans un menu déroulant la fasse basculer, sans aucun signal.

### Ce qui manque encore

1. **Une facture PoYo réelle** (Classe D) pour réconcilier — les tarifs publiés ne garantissent pas
   le tarif appliqué à votre compte.
2. **Les prix de vente réels** des SKU. **Si les prix réels sont inférieurs aux valeurs de
   simulation, davantage de modèles basculent en négatif.**
3. **La facturation des générations échouées** : la documentation PoYo ne l'aborde pas. 11 jobs
   `failed` en base — non débités côté utilisateur, mais probablement facturés côté fournisseur.

### Le coût du tier gratuit

Chaque nouveau compte reçoit **10 tokens**, soit **~0,50 $ de coût fournisseur, pour 0 $ de
revenu**. C'est le coût d'acquisition incompressible. Il devient le vecteur d'abus si `E2` est
farmable.

---

## 5. Perte maximale sur 24 heures

**Modèle établi à partir des garde-fous réellement en place.**

| Garde-fou | État |
|---|---|
| Limite IP horaire | anonymes seulement, 5/h, **échec ouvert**, `x-forwarded-for` fourni par le client |
| Limite par utilisateur authentifié | **AUCUNE** |
| Plafond de dépense global | **AUCUN** |
| Plafond de concurrence | **AUCUN** |
| Disjoncteur | sur le **taux d'échec**, pas sur la dépense |
| Alerte de dépense | **AUCUNE** |
| Rotation de clés PoYo | 5 requêtes/min/clé |

Le seul plafond effectif est celui de la rotation de clés — un plafond de **débit**, non de
**dépense**. Recalculé avec les données réelles.

**Le nombre de clés est désormais connu :** la console PoYo (Classe D, 2026-08-05) montre **5 clés**
en rotation — `MiniPainter Studio`, `… 2`, `… 3`, `… 4`, `… 5`.

```
5 clés × 5 req/min = 25 req/min = 1 500/heure = 36 000 générations/jour

× 0,090 $  (nano-banana-pro-edit, modèle ACTUEL)  =   3 240 $/jour
× 0,080 $  (flux-kontext-max)                     =   2 880 $/jour
× 0,321 $  (gpt-image-2 high 4K)                  =  11 556 $/jour
```

**~3 240 $/jour** au plafond théorique de la configuration actuelle — soit **9× l'estimation
initiale** de 360 $, qui reposait sur une clé unique et sur la constante inventée de 0,05 $.
Aucune alerte n'existe. La première information serait la facture.

*Nuance honnête : ce plafond suppose les 5 clés saturées en permanence, ce qui exige un abus
délibéré et soutenu. Il ne décrit pas un régime probable — il décrit **l'absence de borne**, qui est
précisément le finding.*

**Nombre de clés en rotation : inconnu** (table `private.poyo_api_keys`, hors périmètre de lecture).
La perte maximale est donc **360 $ × N**, où N vous est connu et ne l'est pas de moi.

**Première information disponible en cas d'incident : la facture.** Aucun mécanisme ne signale
l'anomalie avant.

---

## 6. Intégrité de la facturation

| Contrôle | Verdict |
|---|---|
| Exécution déclenchée par webhook serveur vérifié, non par URL de retour | ✅ `revenuecat-webhook`, `verify_jwt=false` mais secret Bearer contrôlé — **401 vérifié par exécution** |
| Idempotence du webhook | ✅ garde globale **avant** tout octroi (l. 62-81), marquage **après** succès (l. 176-180), index unique sur `event_id` |
| Montant issu d'un catalogue serveur | ✅ `TOKEN_PACK_MAP` côté serveur, jamais du client |
| Comparaison du secret à temps constant | ❌ `authHeader !== \`Bearer ${SECRET}\`` — P3, exploitabilité très faible sur un endpoint HTTPS distant |
| Non-2xx sur erreur interne | ⚠️ le bloc `catch` retourne **400**. Avec l'idempotence désormais correcte, un rejeu est inoffensif ; le défaut est de mal étiqueter une panne serveur. Rétrogradé en P3. |
| `tokens_200` → 150 tokens | ⚠️ **`BLOCKED`** — statut et promesse du SKU non vérifiables sans App Store Connect / Play Console |
| Remboursements, rétrofacturations, litiges | ❌ aucun traitement de `CANCELLATION` autre que le statut ; **aucun chemin de reprise de crédits** |
| Reçus, factures | ❌ aucun |
| Correspondance `app_user_id` RevenueCat ↔ `auth.uid()` | ✅ `Purchases.logIn(session.user.id)` (`AuthContext.tsx:141,232`) |

**Zéro événement webhook traité à ce jour** (`processed_webhook_events` = 0 ligne) : **le chemin
d'encaissement n'a jamais été exercé en production.** Il doit être testé avant lancement — c'est le
test le plus rentable de tout le plan.

---

## 7. Ordre de priorité économique

1. **`COST-001`** — plafond de dépense global. C'est le seul garde-fou dont l'absence n'a aucune
   borne supérieure.
2. **`ECON-002` + `ECON-001` + `ECON-004`** — verrou, soustraction des réservations, contrainte
   `CHECK`. Une seule migration.
3. **`ECON-006`** — le registre. À poser **avant** toute acquisition : il ne se reconstitue pas
   rétroactivement.
4. **`AI-002`** — enregistrer le coût fournisseur réel. Sans lui, aucune décision de marge n'est
   possible, y compris celles de ce document.
5. **Obtenir les tarifs PoYo et les prix de vente réels.** C'est bloquant pour tout le reste, et
   cela ne dépend pas de développement.
