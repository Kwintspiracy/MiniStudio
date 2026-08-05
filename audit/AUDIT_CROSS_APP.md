# MiniStudio ↔ MiniPainterDB — Frontière de confiance inter-applications

Phase 1 du cahier des charges. Une seule base Postgres, un seul espace d'identités, deux
applications, deux dépôts, deux cycles de publication.

---

## 1. Ce qui est réellement partagé

Projet Supabase **`gmbhkvpcebnwnzygcedi`**, nommé **« MiniPaintsDB »** — le nom du projet trahit son
origine : MiniStudio est l'invité.

| Table | Lignes | Propriétaire | Partage |
|---|---:|---|---|
| `paints` | 2 956 | **MiniPainterDB** | MiniStudio **lit** (`SELECT` public `USING (true)`) |
| `user_paints` | 53 | **MiniPainterDB** | MiniStudio **lit** (`fetchUserPaints`) |
| `profiles` | 21 | **partagée** | les deux |
| `auth.users` | 21 (dont 10 anonymes) | **partagée** | les deux |
| `app_config` | 8 | **partagée** | clés MiniStudio + limites |
| `user_entitlements` | 1 | MiniStudio | — |
| `generation_jobs` | 390 | MiniStudio | — |
| `generation_logs` | 379 | MiniStudio | — |
| `device_tokens` | 0 | MiniStudio | — |
| `prompt_configs` | 50 | MiniStudio | — |
| `provider_health` | 2 | MiniStudio | — |
| `processed_webhook_events` | 0 | MiniStudio | — |
| `private.poyo_api_keys` | ? | MiniStudio | — |

---

## 2. Rayon d'impact — établi, pas supposé

### 2.1 Le vecteur réalisé : `CROSS-001`

**La clé `service_role` du projet partagé a été committée en clair dans MiniPainterDB** — commit
initial `3e01431` (2026-01-01), dans `lib/supabase.ts` **comme clé du client React Native**, et dans
`REBUILD_INSTRUCTIONS.md` comme clé documentée. Retirée le 2026-01-05. **Jamais révoquée.**

Validité établie sans exercer la clé : elle porte le même `iat` (`1766371569`) et le même `exp`
(`2081947569`) que la clé `anon` que la Management API rapporte `"disabled": false` et qui tourne
en production dans `app.json:78`. Les clés *legacy* Supabase sont signées par un secret de projet
unique : le rotationner les invalide toutes ensemble. **`anon` vivante ⟹ `service_role` vivante.**

Ce que cela donne, en contournant toute RLS :

| Sur MiniStudio | Sur MiniPainterDB |
|---|---|
| écriture sur **tous les soldes** | lecture et **altération** de `paints` (2 956 lignes) |
| lecture de `private.poyo_api_keys` → **votre budget fournisseur** | lecture et altération de `user_paints` |
| tous les prompts et images de tous les utilisateurs | e-mails des 21 comptes |
| bascule du fournisseur, du modèle, des gabarits | API admin `auth` : créer, supprimer, forger des sessions |

**C'est la démonstration achevée du rayon d'impact.** Une négligence dans le dépôt sœur, six mois
plus tôt, confère aujourd'hui le contrôle intégral de l'économie de MiniStudio. Aucune faille de
MiniStudio n'était nécessaire.

### 2.2 Rôles et clés : non séparés

Les deux applications utilisent **le même projet, la même clé `anon`, le même rôle `authenticated`,
la même table `auth.users`**. Il n'existe aucun rôle de base distinct, aucune séparation de
privilèges, aucun cloisonnement de schéma entre les deux.

**Conséquence directe :** un utilisateur connecté à MiniPainterDB possède, de plein droit, une
session valide pour MiniStudio — et l'autorité de dépense qui va avec. `reserve_generation` n'exige
qu'un `auth.uid()` correspondant ; elle ne distingue pas l'application d'origine.

### 2.3 Le programme de remédiation d'une application modifie la sécurité de l'autre

`list_migrations` révèle une campagne du 2026-07-31 au 2026-08-02 — `sec001_*`, `logic001_*`,
`data002`, `data007_authz006`, `perf006`, `sec009`, `wave9`–`wave12` — manifestement conduite depuis
MiniPainterDB. **Trois d'entre elles touchent directement MiniStudio :**

- `a1_move_poyo_api_keys_to_private_schema` — déplace la clé API PoYo
- `a2_revoke_studio_credit_rpcs_from_anon` — révoque les RPC de crédit
- `sec001_get_provider_config_revoke_only` — révoque la config fournisseur

**Aucune n'a de fichier dans le dépôt MiniStudio.** La sécurité de MiniStudio est donc, en partie,
définie par des changements invisibles depuis son propre dépôt. Un développeur lisant MiniStudio ne
peut pas savoir ce qui protège MiniStudio.

### 2.4 La suppression de compte appartient à l'autre application

L'edge function **`delete-account`** (v11, redéployée le 2026-08-03) **n'existe pas dans le dépôt
MiniStudio** ; sa source est dans `MiniPainterDB/supabase/functions/delete-account/index.ts`. Elle
est pourtant celle qui détruit les données MiniStudio — son propre commentaire l'énumère :
« profiles, user_paints, **user_entitlements, generation_jobs, generation_logs, device_tokens** ».

Son allowlist d'origines est explicite :

```ts
const ALLOWED_ORIGINS = new Set(['https://minipainterdb.app', 'http://localhost:8081']);
```

**L'origine de MiniStudio n'y figure pas.** Sans conséquence pour les clients natifs (qui n'envoient
pas d'en-tête `Origin`), mais **la suppression de compte depuis MiniStudio sur le web serait
bloquée par CORS**. Non testé — noté comme à vérifier.

Son `APPLE_CLIENT_ID` est `com.kwintspiracy.MiniPainterDB`, alors que MiniStudio est
`com.minipainterstudio.app` : la révocation du jeton Apple ne peut pas fonctionner pour un compte
créé via MiniStudio.

**Effet économique non instruit :** la fonction supprime `user_entitlements`. Or `reserve_generation`
octroie 10 tokens à tout compte dépourvu de cette ligne (chemin `E2`, `AUDIT_MONEY.md` §3). Un cycle
supprimer/recréer pourrait donc reconstituer le crédit gratuit. **`BLOCKED` — test d'écriture
requis.**

---

## 3. Propagation de `LOGIC-001` — la réponse est contre-intuitive

La mission demandait d'évaluer si le défaut d'appariement aveugle à la catégorie, côté
MiniPainterDB, se propage dans les images générées par MiniStudio.

**`LOGIC-001` est remédié en base.** Les migrations `logic001_populate_product_type`,
`logic001_category_aware_matching` et `logic001_duncan_classification` sont appliquées (2026-07-31).
La table `paints` porte désormais `product_type`, `finish`, `opacity`, `pigment_info`, avec une
contrainte `CHECK` sur huit catégories, et un index dédié. La colonne est **complète sur les 2 956
lignes**.

**Mais MiniStudio ne la lit pas.** `src/services/paintService.ts:25` :

```ts
const PAINT_COLUMNS = 'id,brand,set,name,hex,hue,saturation,lightness,code,is_discontinued,r,g,b,finish';
```

`product_type` est absent. Le générateur de prompt ne dispose donc que de `finish`, et ne discrimine
que sur `finish === 'Metallic'` (`promptGenerator.ts:54-60`). Tout le reste devient `Nom: #hex`,
c'est-à-dire un aplat opaque.

Or `finish` est **NULL sur 2 823 des 2 956 lignes (95,5 %)** :

| Catégorie réelle | Lignes | Rendu par MiniStudio |
|---|---:|---|
| contrast | 254 | aplat — **faux** |
| wash / shade | 140 | aplat — **faux** |
| **metallic à `finish` NULL** | **78** | aplat — **faux** |
| technical, primer, airbrush, fluorescent | 798 | aplat |

**Conclusion : la propagation existe, mais elle est inversée par rapport à l'hypothèse.** Ce n'est
pas le défaut d'appariement de MiniPainterDB qui contamine MiniStudio — c'est **la correction de
MiniPainterDB qui n'atteint pas MiniStudio**, faute de consommateur mis à jour. 38 % des métalliques
reçoivent l'instruction inverse de celle qu'il leur faut. Détail complet dans `AI-001`.

C'est le symptôme le plus parlant du couplage : **un schéma partagé évolue, un seul de ses deux
consommateurs le sait.**

---

## 4. Matrice RLS croisée

Établie sur les 24 politiques live (`pg_policies`).

| Depuis une session… | `paints` | `user_paints` | `user_entitlements` | `generation_jobs` | `generation_logs` |
|---|---|---|---|---|---|
| MiniPainterDB (authentifiée) | lecture (public) | CRUD sa ligne | **sa ligne seule** | **sa ligne seule** | lecture sa ligne + **INSERT ⚠️** |
| MiniStudio (authentifiée) | lecture (public) | CRUD sa ligne | **sa ligne seule** | **sa ligne seule** | lecture sa ligne + **INSERT ⚠️** |
| Anonyme (rôle `authenticated`) | idem | idem | idem | idem | idem |
| Porteur de `service_role` | **tout** | **tout** | **tout** | **tout** | **tout** |

**La RLS tient dans les deux sens.** Aucune session d'une application ne peut lire les données d'un
autre utilisateur dans l'autre application. C'est un point favorable, à consigner.

**Deux réserves.**

1. **La dernière ligne annule les précédentes.** Tant que `CROSS-001` n'est pas rotationnée, la
   qualité de ces politiques est un point discutable.
2. **`generation_logs` accepte des `INSERT` client** avec un `client_ip` non contraint
   (`DATA-001`) — la seule politique d'écriture superflue de tout le schéma.

Par ailleurs, `admin_import_paints`, `admin_update_paint` et `admin_delete_paint` — fonctions
MiniPainterDB — sont exécutables par tout compte `authenticated` de MiniStudio. **Elles sont
correctement gardées** par `is_admin()`, vérifié sur chacune. La surface existe, la protection tient.

---

## 5. Gouvernance du schéma

| Question | Réponse établie |
|---|---|
| Le schéma partagé est-il versionné ? | **Partiellement, et dans les deux dépôts.** 68 migrations appliquées, 45 fichiers dans MiniStudio, 24 sans fichier. |
| Une migration d'une app peut-elle casser l'autre ? | **Oui, et c'est déjà arrivé** — `logic001_*` a ajouté `product_type` sans que MiniStudio le sache (`AI-001`). |
| Y a-t-il une source unique de vérité ? | **Non.** Deux dépôts mutent un schéma unique, plus des applications hors CLI (via MCP et l'éditeur SQL). |
| Processus documenté ? | **Aucun trouvé.** |
| Responsable de traitement RGPD ? | **Non désigné.** La suppression est assurée par l'app sœur, avec une allowlist qui exclut MiniStudio. |
| Sauvegarde et restauration ? | **Une restauration ramène les deux applications en arrière** — soldes de tokens et exécution de paiements compris. Ce n'est documenté nulle part, et cela a été un facteur concret dans le déroulement de cet audit : la sauvegarde la plus récente datait de 21 heures, ce qui a rendu inutilisable l'option « restaurer en cas de problème » pour un simple test. |

---

## 6. Faut-il séparer les deux bases ?

### Pour le maintien du partage

- `paints` et `user_paints` sont la **raison d'être** du lien : MiniStudio prend son sens parce que
  la palette est réelle et personnelle. Séparer imposerait une réplication ou une API, avec latence,
  incohérence et coût.
- Une identité unique est une vraie qualité produit : un compte, deux applications.
- Le volume actuel (2 956 peintures, 21 comptes) ne justifie aucune complexité supplémentaire.

### Pour la séparation

- **Le rayon d'impact est total et démontré** (`CROSS-001`).
- **Les cycles de publication sont désynchronisés**, et cela produit déjà des défauts (`AI-001`).
- **Le risque juridique diffère fortement** : MiniStudio accepte des photographies d'utilisateurs
  (`SAFETY-001`), MiniPainterDB non. Les faire cohabiter, c'est exposer les données de la seconde
  aux incidents de la première.
- **La restauration est indivisible.**

### Recommandation

**Ne pas séparer les bases. Séparer les privilèges.** Le partage apporte une valeur réelle ; le
rayon d'impact vient des identifiants et de la gouvernance, pas de la colocation.

Esquisse, par ordre de rendement :

1. **Rotationner le secret JWT** après bascule des deux applications sur les clés *publishable*
   modernes, rotationnables indépendamment. Ferme `CROSS-001`.
2. **Activer le *secret scanning* et la *push protection*** sur les deux dépôts. Coût nul, aurait
   bloqué le commit fautif.
3. **Un dépôt unique et faisant autorité pour le schéma partagé** — ou, à défaut, un contrôle de
   dérive automatique dans les deux (`OPS-001`).
4. **Déplacer les tables propres à MiniStudio dans un schéma dédié** (`studio.*`), avec des droits
   distincts. Cloisonnement logique sans coût de latence, et cela rend la propriété lisible.
5. **Un contrat explicite sur `paints`** : version de schéma, et les deux consommateurs qui
   déclarent les colonnes dont ils dépendent. C'est ce qui aurait évité `AI-001`.
6. **Désigner le responsable de traitement** et **unifier la suppression de compte** — actuellement
   assurée par une seule des deux applications, avec une allowlist qui exclut l'autre.
