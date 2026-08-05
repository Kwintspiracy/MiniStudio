# MiniStudio — Sécurité des contenus et exposition juridique

> ## ⚠️ Correction du 2026-08-05 — deux erreurs de ce document
>
> **1. Le mécanisme de signalement ne s'applique pas.** Ce rapport réclamait un
> bouton « signaler » au titre des règles Apple et Google. Ces règles visent les
> applications où **un utilisateur voit le contenu d'un autre**. Vérifié depuis :
> MiniStudio est mono-utilisateur. Aucune galerie publique, aucun flux, aucune
> colonne de partage ; la galerie vit en `AsyncStorage`, la RLS limite
> `generation_jobs` à sa propre ligne, et `Share.share()` est la feuille de
> partage système — vers l'extérieur, pas vers d'autres utilisateurs. Il n'y a
> personne à signaler. **Exigence retirée.**
>
> **2. La modération de sortie est largement assurée par le modèle.** Le
> commanditaire l'a fait valoir et c'est exact : les modèles Gemini refusent de
> produire ce qui viole leur charte, et ils sont stricts. Ce document traitait
> l'absence de filtrage applicatif comme si rien ne filtrait.
>
> **Ce qui subsiste, et qui n'est pas couvert par ces deux points :**
>
> - **L'entrée, pas la sortie.** Un refus de génération signifie que le modèle
>   n'a rien fabriqué. Il ne signifie pas que rien n'est entré : l'image a déjà
>   quitté l'infrastructure vers un tiers. Les obligations en matière de CSAM
>   portent sur la réception et la transmission, pas sur la production.
> - **Le fournisseur réel est PoYo, pas Google.** `primary_provider = 'poyo'`,
>   `fallback_enabled = 'false'` : le chemin Gemini direct, celui qui bénéficie
>   des filtres par défaut, est désactivé. `submitPoyoTask` n'envoie aucun
>   paramètre de sécurité. Que les filtres Google s'appliquent à travers
>   l'agrégateur n'a pas pu être vérifié.
> - **La classification par âge** dans App Store Connect reste à renseigner.
>
> **Décision du commanditaire, enregistrée le 2026-08-05 :** risque assumé sur
> la modération d'entrée, au motif que le modèle refuse les contenus contraires
> à sa charte. Ce n'est pas un oubli ; c'est un arbitrage, pris en connaissance
> des trois points ci-dessus.

Consolidation de `SAFETY-001` (P0) et `SAFETY-002` (P2), et de la Phase 7 dans son ensemble.

---

## 1. Posture actuelle : néant

Recherche exhaustive sur `app/`, `src/` et `supabase/functions/`, portant sur `moderat`, `nsfw`,
`csam`, `safety`, `safetySetting`, `harmCategory`, `blocklist`, `banned word`, `content filter`,
`age gate`, `report abuse`, `takedown`.

**Une seule correspondance sur l'ensemble du dépôt :**

```
src/services/paintService.ts:67:    // Safety break to prevent infinite loops
```

un commentaire sur une boucle de pagination.

| Contrôle attendu | État |
|---|---|
| Modération des images téléversées | ❌ **aucune** |
| Détection CSAM | ❌ **aucune** |
| Détection de visages humains | ❌ **aucune** |
| Modération sémantique du prompt | ❌ **aucune** |
| Réglages de sécurité transmis au fournisseur | ❌ **aucun** (`submitPoyoTask` envoie `{model, input:{prompt, size}, callback_url}`) |
| Modération de la sortie | ❌ **aucune** |
| Signalement par l'utilisateur | ❌ **aucun** |
| Chemin de retrait | ❌ **aucun** |
| Vérification d'âge | ❌ **aucune** |
| Procédure d'incident | ❌ **aucune** |

**Corroboré côté infrastructure (Classe C) :** aucune des 11 tables live ne porte de statut de
modération, de signalement ou de vérification d'âge ; aucune des 40 RPC live n'en traite.

### Ce que les « sanitizers » font réellement

Ils sont parfois pris pour de la modération. Ils n'en sont pas.

```ts
// src/utils/sanitization.ts
sanitized = sanitized.replace(/[\[\]{}<>`]/g, '');
sanitized = sanitized.split('\n')
  .filter(line => !/^\s*(#|SYSTEM\s*:|IGNORE|OVERRIDE)/i.test(line)).join('\n');
sanitized = sanitized.replace(/[^\w\s.,?!'"\-\n]/g, '');
```

Ce sont des **filtres de caractères** doublés d'une heuristique naïve anti-injection. Toute demande
formulée en langage courant les traverse intégralement. Côté serveur, `sanitizeServerSide`
(`generate-miniature/index.ts:520-523`) ne retire que des caractères de contrôle.

Ils sont utiles contre l'injection de gabarit. **Ils ne peuvent pas être adaptés en modération de
contenu** — ce n'est pas la même classe d'outil.

---

## 2. Le chemin d'exposition, en entier

```
app/camera.tsx  (caméra système)          ─┐
src/hooks/useImagePicker.ts (photothèque) ─┴─► ImageFile { base64 }
                                                    │  aucun contrôle
                                                    ▼
             geminiService.ts:242  POST { baseImage: <base64 arbitraire> }
                                                    │  aucun contrôle
                                                    ▼
      generate-miniature : longueur, modèle, température, SSRF sur URL
                           ── AUCUN contrôle du CONTENU de l'image ──
                                                    ▼
                    uploadToPoyo(apiKey, base64, mimeType)   l. 96-124
                                                    │
                                    ┌───────────────┴──────────────┐
                                    ▼                              ▼
                        api.poyo.ai (tiers, hors UE ?)     résultat sur CDN PoYo
                        rétention inconnue                 URL persistée telle quelle
```

Deux points aggravants distincts :

- **Les photographies des utilisateurs quittent votre infrastructure** vers un tiers dont la
  rétention et la localisation n'ont pas été établies. Aucune politique de confidentialité n'a été
  trouvée dans le dépôt pour le refléter.
- **Les résultats ne sont jamais stockés chez vous** : `generation_jobs.result_image_url` conserve
  une URL du CDN PoYo. Vous ne pouvez donc **ni supprimer une image sur demande, ni la retirer en
  cas de signalement** — vous n'en avez pas la maîtrise.

---

## 3. Obligations concernées

Énoncées telles qu'elles s'appliquent à un service acceptant des images téléversées. Ce document
n'est pas un avis juridique ; ces points appellent une confirmation par un conseil.

**CSAM et signalement obligatoire.** Un service acceptant des uploads d'images relève, dans la
plupart des juridictions où vous distribuerez (États-Unis via l'App Store, Union européenne,
Royaume-Uni), d'obligations de détection et de **signalement obligatoire**. Il n'existe ici ni
détection, ni procédure, ni conservation de preuve, ni interlocuteur désigné. **C'est le seul risque
de cet audit qu'un correctif rétroactif ne répare pas** : un signalement reçu aujourd'hui ne
trouverait aucun dispositif pour y répondre.

**Images de personnes réelles.** Le flux « peins cette figurine » accepte n'importe quelle
photographie. Rien n'empêche techniquement la soumission du portrait d'une personne réelle, y
compris mineure, ni sa transformation. La législation sur les images intimes non consenties et sur
les représentations générées de mineurs se durcit rapidement dans plusieurs juridictions.

**RGPD.** Les deux applications partagent une base et une table `auth.users`. La suppression de
compte est assurée par une edge function appartenant à **MiniPainterDB** (`delete-account`), dont
l'allowlist d'origines (`https://minipainterdb.app`, `http://localhost:8081`) **n'inclut pas
MiniStudio**. Le responsable de traitement n'est pas désigné. Voir `AUDIT_CROSS_APP.md`.

**Politiques des magasins d'applications.** Apple et Google imposent, pour toute application
générant des images à partir de contenus utilisateur, des mécanismes de signalement et de
modération. Leur absence est un motif de **rejet ou de retrait** — mécanisme rapide, unilatéral,
qui interrompt le revenu sans préavis.

---

## 4. Propriété intellectuelle

### Ce qui est signalé — deux chaînes de caractères

```ts
// src/constants.ts:6
{ id: 'heavy-metal', name: "'Eavy Metal", prompt: "in bright, saturated colors, …" }

// src/constants.ts:17
{ id: 'fantasy', label: 'Fantasy / D&D' }
```

**« 'Eavy Metal »** est la marque déposée de Games Workshop désignant son équipe de peinture interne
et son style maison. **« D&D »** est une marque de Wizards of the Coast. Ce ne sont pas des mentions
descriptives : ce sont des **noms de fonctionnalités vendues** dans une application payante.

### Ce qui n'est **pas** signalé — et pourquoi la distinction compte

Les noms de marques de peinture (`Citadel`, `Vallejo`, `Army Painter`, `Scale75`, `Duncan` —
`app/(studio)/index.tsx:1145`) et les noms de références (`Mephiston Red`, `Abaddon Black`,
`Leadbelcher`, `Retributor Armour`) relèvent de l'**usage nominatif** : désigner un produit réel par
son nom, dans un catalogue de peintures, est la position la plus solide en droit des marques.

Cette distinction rend le finding actionnable : **deux chaînes sont à changer, pas le catalogue.**

### Ce qui reste ouvert

Les utilisateurs téléverseront des photographies de figurines Warhammer, Age of Sigmar, Star Wars
Legion et D&D — c'est le cœur d'usage du produit. Les questions non tranchées :

- Que disent les CGU sur la responsabilité de l'utilisateur quant aux droits des contenus
  téléversés ? **Aucune CGU n'a été trouvée dans le dépôt.**
- Qui possède les images générées ? Rien ne l'établit, ni dans le produit ni au regard des
  conditions de PoYo.
- Games Workshop fait valoir ses droits avec constance, et le public de MiniStudio est exactement sa
  clientèle. Le risque immédiat n'est pas un contentieux mais un **signalement aux magasins**.

---

## 5. Remédiation minimale, séquencée par exposition

**Le point 1 conditionne le lancement public. Les points 2 à 4 le conditionnent en pratique aussi,
via les politiques des magasins.**

| # | Action | Effort | Bloque le lancement ? |
|---|---|---|---|
| **1** | **Détection CSAM** sur l'upload, **avant** tout appel fournisseur. *Hash matching* : PhotoDNA (Microsoft, gratuit pour plateformes éligibles) ou l'API Safer (Thorn). Point d'insertion : `generate-miniature`, avant `uploadToPoyo` — l'image y est déjà décodée côté serveur. **Accompagner d'une procédure de signalement écrite** ; la détection sans procédure ne satisfait pas l'obligation. | M | **OUI** |
| **2** | **Refus des photographies de visages humains.** Cohérent avec la promesse produit — vous peignez des figurines — donc défendable auprès des utilisateurs, et cela supprime d'un coup la classe de risque la plus lourde. Détection locale en première barrière, contrôle serveur obligatoire (le client est hostile). | M | **OUI** en pratique |
| **3** | **Signalement et retrait** dans l'interface, avec traçabilité. Exigé par les magasins. **Prérequis :** maîtriser le stockage des images (§2) — on ne retire pas ce qu'on n'héberge pas. | M | **OUI** (magasins) |
| **4** | **Modération sémantique du prompt** côté serveur, en complément — jamais en remplacement — des sanitizers. | S | OUI (magasins) |
| **5** | **Vérification d'âge** au niveau requis pour une application de génération d'images. | S | OUI (magasins) |
| **6** | **CGU et politique de confidentialité** : responsabilité de l'utilisateur sur les contenus, propriété des images générées, transfert vers PoYo et rétention réelle. | S | OUI |
| **7** | **Renommer les deux préréglages** : `'Eavy Metal` → « Studio / Heroic », `Fantasy / D&D` → « Fantasy ». Les prompts sous-jacents ne nomment aucune propriété protégée. | XS | Non |
| **8** | **Procédure d'incident écrite** : qui agit, sous quel délai, ce qui est conservé, qui est notifié. | S | Non, mais à faire avant le premier signalement |

---

## 6. Ce qui n'a pas pu être vérifié

- **Les conditions de PoYo.ai** sur la rétention des images et des prompts (Classe E). Détermine ce
  que doit dire la politique de confidentialité.
- **La localisation du traitement chez PoYo** — pertinent pour un transfert hors UE.
- **L'existence de CGU publiées** hors du dépôt (site web, fiche de magasin).
- **Les exigences exactes** d'Apple et Google applicables à cette catégorie d'application (Classe E).
- **Le comportement réel des modèles PoYo** face à une demande manifestement problématique : non
  testé, et non testable sans soumettre un tel contenu — ce qui n'est pas une démarche d'audit
  acceptable.
