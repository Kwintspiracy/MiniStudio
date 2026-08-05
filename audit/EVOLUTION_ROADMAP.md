# MiniStudio — Trajectoire d'évolution

Phase 10. Produite **après** les findings, et fondée sur eux : chaque proposition porte l'identifiant
du constat qui la motive. Aucune recommandation ici n'est motivée par la nouveauté.

---

## Le constat qui structure tout le reste

Trois défaillances majeures de cet audit — `SEC-001`, `CROSS-001`, `AI-001` — n'ont **aucune cause
technique commune**. Elles ont une cause *organisationnelle* commune : **rien ne relie ce qui est
écrit à ce qui tourne.**

- Un correctif de sécurité écrit le 1ᵉʳ mars n'a jamais été déployé — cinq mois.
- Une clé retirée du code n'a jamais été révoquée — sept mois.
- Une colonne ajoutée au schéma partagé n'a jamais été consommée — cinq semaines.

Ce ne sont pas trois erreurs. C'est une seule absence, observée trois fois. **Toute la trajectoire
qui suit part de là :** ajouter des fonctionnalités à un système qui ne sait pas se contrôler
multiplie les occasions de répéter le motif.

---

## 1. Fiabilité — de « ça marche » à « ça marche sous charge et en panne »

**Constats :** `OPS-001`, `TEST-001`, `ECON-005`, 10.07, 8.03.

**Le contrôle de dérive d'abord.** Un script comparant `list_migrations` aux fichiers et les
`ezbr_sha256` des edge functions à un build local. Quelques dizaines de lignes. **C'est ce qui aurait
révélé `SEC-001` cinq mois plus tôt** — et c'est le meilleur rapport valeur/effort de tout ce
document.

**Durabilité de la file.** Les jobs vivent dans `generation_jobs`, sans réconciliation serveur : la
seule reprise est côté client (poll 10 s, timeout 5 min, `AsyncStorage`). Si le client disparaît
entre la réservation et le callback, le job reste `reserved` indéfiniment. Aujourd'hui sans
conséquence — 0 job orphelin — mais dès que `(solde − réservations)` gouvernera la décision
(Vague 1), **chaque orphelin immobilisera définitivement un token**. La réconciliation devient un
prérequis, pas un confort.

**Le test comme filet, pas comme rituel.** `ECON-005` est la démonstration : un chemin cassé par une
contradiction entre deux fragments SQL écrits à des dates différentes, invisible six mois, qui
n'échouera qu'en production au premier compte VIP. Trois tests suffisent à couvrir ce qui compte —
concurrence, rejeu de webhook, assemblage de prompt. Viser une couverture globale serait du théâtre.

**Panne fournisseur.** Le disjoncteur existe et fonctionne, mais `fallback_enabled='false'` en
production : une panne PoYo est une panne totale. Comme le débit est postérieur au succès, aucun
token n'est perdu — c'est un bon design qu'il faut préserver en corrigeant `ECON-002`.

---

## 2. Sécurité des contenus — la pile minimale, ordonnée par exposition

**Constat :** `SAFETY-001` (P0), `SAFETY-002`.

Détaillé dans `AUDIT_SAFETY.md` §5. En résumé de trajectoire : **la détection CSAM et le refus des
visages ne sont pas des fonctionnalités, ce sont des conditions d'existence.** Tout ce que propose ce
document par ailleurs est sans objet si un signalement survient avant qu'elles n'existent.

Un point mérite d'être relevé comme **décision produit, pas seulement comme mitigation** : refuser
les photographies de personnes est **aligné avec ce que le produit prétend faire**. Vous peignez des
figurines. Ce refus est défendable auprès des utilisateurs, il clarifie le positionnement, et il
supprime d'un coup la classe de risque la plus lourde. C'est le rare cas où le correctif de sécurité
renforce la proposition de valeur.

---

## 3. Intégrité du revenu — avant de dépenser en acquisition

**Constats :** `ECON-001`, `ECON-002`, `ECON-004`, `ECON-006`.

**Le registre est le prérequis non négociable.** Il ne se reconstitue pas rétroactivement : chaque
jour sans lui est de l'historique définitivement perdu. Avec **1 utilisateur et 0 achat**, le poser
aujourd'hui coûte une migration. Le poser après mille utilisateurs coûte une migration *et* un trou
comptable permanent.

**Le tier gratuit doit être repensé, pas seulement colmaté.** Aujourd'hui les 10 tokens gratuits
atterrissent dans `purchased_balance` — gratuit et payé deviennent indiscernables. Cela interdit
toute politique différenciée : expiration des gratuits, priorité de consommation, remboursement
partiel. Les séparer dans `tier_tokens` est une correction d'une ligne dans `reserve_generation`,
qui débloque une famille entière de décisions commerciales.

**L'anti-abus se juge par exécution, pas par intention.** Les vecteurs recensés en passe
« inconnues inconnues » — cycle supprimer/recréer, `device_id` web fabriqué, `x-forwarded-for`
falsifié — sont **tous non testés**. Ils doivent l'être avant l'acquisition, pas après le premier
pic de facture.

---

## 4. Coût et marge — les leviers réellement disponibles

**Constats :** `AI-002`, `COST-001`.

**Vous ne connaissez pas votre marge.** Ce n'est pas une figure de style : la table exigée par cet
audit n'a pas pu être produite (`AUDIT_MONEY.md` §4). Le coût fournisseur est une constante écrite en
dur à 0,05 $ dans une interface d'administration, jamais mesurée, appliquée indifféremment à
`nano-banana-2-edit` et à `gpt-image-2-edit`. **Aucune décision de tarification n'est fondée tant que
cela n'est pas corrigé.**

Une fois le coût réel enregistré, quatre leviers deviennent accessibles — dans cet ordre de
rendement :

1. **Routage par modèle.** 18 modèles sont sélectionnables ; un seul est actif à la fois, pour tout
   le monde. Router selon le mode (paint / sketch / sculpt) ou le palier d'abonnement permet de
   réserver les modèles coûteux aux usages qui les justifient. **Prérequis : `AI-002`.**
2. **Paliers de résolution.** `size:'1:1'` est figé côté serveur. Une résolution supérieure payante
   est un levier de revenu qui n'existe pas aujourd'hui.
3. **Validation avant dépense.** Aucune vérification de l'image d'entrée n'a lieu avant réservation
   (12.10). Chaque requête que le fournisseur refusera est payée pour rien.
4. **Cache.** Deux générations identiques coûtent deux fois. Un cache par empreinte
   `(prompt, image, modèle)` est trivial à poser et non mesurable en gain tant que le volume est
   d'un utilisateur — à garder en réserve.

**Le plafond de dépense n'est pas un levier, c'est une assurance.** ~360 $/jour/clé, sans borne
au-delà, et la première information disponible serait la facture.

---

## 5. Observabilité — ce qu'il faut pouvoir voir avant de croître

Aujourd'hui, le portail admin affiche des volumes. Il faudrait qu'il affiche des **décisions**.

| Indicateur | Aujourd'hui | Prérequis |
|---|---|---|
| Dépense fournisseur par utilisateur | ❌ | `AI-002` |
| Marge par génération | ❌ | `AI-002` + tarifs réels |
| Taux d'échec par modèle | partiel (`generation_jobs.status`) | — |
| Profondeur de file, jobs orphelins | ❌ | 10.07 |
| Signaux d'abus (comptes/appareil, comptes/IP) | ❌ | `ECON-006` |
| Solde réconcilié vs registre | ❌ | `ECON-006` |
| Actions d'administration | ❌ | `ADMIN-001` |

Aucun de ces indicateurs n'exige d'outillage tiers : tous se dérivent de `token_ledger` et de
`provider_cost_usd`. **Deux colonnes et une table débloquent l'ensemble du tableau.**

---

## 6. Architecture — faut-il séparer les deux bases ?

Traité en détail dans `AUDIT_CROSS_APP.md` §6. Position retenue :

**Ne pas séparer les bases. Séparer les privilèges.**

Le partage porte une valeur produit réelle — MiniStudio n'a de sens que parce que la palette est
réelle et personnelle, et une identité unique pour deux applications est une qualité, pas un défaut.
Le rayon d'impact démontré par `CROSS-001` ne vient **pas** de la colocation : il vient d'un
identifiant committé et d'une gouvernance de schéma inexistante. Séparer les bases coûterait une
réplication ou une API, sans traiter la cause.

Trajectoire : rotation des clés → schéma `studio.*` dédié avec droits distincts → contrat de schéma
versionné sur `paints`, chaque consommateur déclarant les colonnes dont il dépend. **Ce dernier point
est précisément ce qui aurait évité `AI-001`.**

---

## 7. Produit — les trois investissements les plus rentables

Justifiés par les findings, pas par la nouveauté.

### 7.1 Rendre la catégorie de peinture visible dans le résultat — `AI-001`

**Le plus rentable de tous les investissements produit.** Effort S, et il touche la promesse centrale.

Aujourd'hui, 254 contrast, 140 lavis et 78 métalliques sont rendus en aplat opaque. Pour le public
visé, c'est immédiatement identifiable : un Nuln Oil rendu en gris uniforme au lieu d'un jus qui se
loge dans les creux, une contrast dont tout le dégradé a disparu, un métallique sur trois en gris
plat.

La correction — lire `product_type`, ajouter des blocs `[Washes]` et `[Contrast]` — transforme le
lien au catalogue de peintures : de **décoratif** (le nom et la couleur) à **fonctionnel** (le
comportement du produit). C'est exactement ce que le produit prétend faire, et ce qui le distingue
d'un générateur d'images génériques.

Point favorable à préserver : **la valeur `hex` est déjà correctement transmise.** La fidélité
colorimétrique est réelle ; c'est la seule dimension du comportement qui manque.

### 7.2 Rendre la dépense lisible — `ECON-006`, 13.16 à 13.19

Un produit à monnaie réelle où l'utilisateur ne peut pas répondre à « qu'ai-je payé, et pour quoi ? »
génère des demandes de remboursement et de la défiance. Le registre (§3) n'est pas qu'un artefact
comptable : c'est **l'historique de consommation de l'utilisateur**, et il se rend directement dans
l'interface.

Corollaire : `13.19` (échec silencieux avec débit silencieux) est le pire défaut UX possible dans ce
produit. Le design actuel — débit au succès uniquement — est **correct** et protège déjà
l'utilisateur. Il faut le **dire** dans l'interface : « aucun token n'a été débité » sur un échec est
une phrase qui vaut des remboursements évités.

### 7.3 Un jeu doré de régression sur les prompts — `TEST-001`, 12.07

La qualité de génération est aujourd'hui évaluée « au ressenti » (`PromptTester.tsx` propose des
scénarios manuels). Les gabarits sont modifiables depuis le portail admin, en production, sans
version stockée avec la génération (12.05) et sans filet.

Un jeu doré — N peintures couvrant les 8 `product_type`, dont on vérifie que le prompt assemblé
contient les blocs attendus — est un **test unitaire pur**, sans réseau ni fournisseur, écrit en une
heure. C'est le premier test du dépôt, le moins cher, et il verrouille la correction produit la plus
visible (§7.1).

---

## 8. Ce qui n'est délibérément pas recommandé

Un audit qui ne propose que des ajouts se trompe de métier.

- **Ne pas séparer les bases** (§6) — traiterait un symptôme, pas la cause, à un coût élevé.
- **Ne pas viser une couverture de test globale** — trois tests ciblés couvrent le risque réel ;
  le reste serait du rituel.
- **Ne pas migrer vers Expo 57 dans l'immédiat.** `npm audit` propose ce correctif pour les 30
  vulnérabilités, mais elles sont, à première lecture, **toutes transitives via l'outillage de
  build** — pas dans le bundle expédié. Établir d'abord lesquelles atteignent les utilisateurs.
  C'est un chantier, pas un patch.
- **Ne pas ajouter de fonctionnalité avant la Vague 1.** Le produit est déjà riche : deux
  fournisseurs, 18 modèles, un portail d'administration complet, trois modes de génération, un
  catalogue de 2 956 peintures. **Ce qui manque n'est pas de la fonctionnalité — c'est la capacité à
  vérifier que ce qui existe fonctionne comme écrit.**
