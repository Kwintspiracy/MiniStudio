# État de la remédiation — 5 août 2026

Instantané daté. Les findings complets restent dans `AUDIT_FINDINGS.md` ; ce fichier dit seulement
où en est chacun.

## Corrigé et vérifié

| Finding | Preuve |
|---|---|
| `ECON-002` réservation qui ne réserve rien | 1 token → 1 réservation puis 3 refus (avant : 5 accordées, solde jusqu'à −4) |
| `ECON-003` tokens gratuits illimités | 3ᵉ cycle supprimer/recréer → `device_already_used`, device enfin enregistré |
| `ECON-001` absence de verrou | `FOR UPDATE` posé sur l'entitlement |
| `ECON-004` soldes négatifs | contraintes `CHECK >= 0` |
| `ECON-005` compte illimité bloqué | `'unlimited'` autorisé en `consumption_source` |
| `AUTHZ-001` IDOR sur 3 RPC | lecture croisée → `ERROR: unauthorized` |
| `DATA-001` `generation_logs` inscriptible | politique supprimée |
| `INFO-001` config fournisseur | garde `is_admin()` |
| `AI-001` catégories de peinture | `product_type` transmis, blocs dédiés, 8 tests dorés |
| `AI-002` télémétrie de coût | coût réel par modèle, marge affichée |
| `AI-003` modèles à marge négative | 4 retirés du menu admin |
| `SAFETY-002` marques protégées | 2 préréglages renommés |
| `TEST-001` (partiel) | premiers tests du dépôt — 8 cas, `npm test` |
| `CROSS-001` (partiel) | les 2 apps portent la clé publishable ; rotation en attente |
| `OPS-001` (partiel) | travail de juillet commité ; dérive dépôt↔base non réconciliée |

Migration appliquée : `20260805190000_econ_hardening`.
Commits : `9760dda`, `7930197`, `0aedfba`.

## Trouvé pendant les tests sur appareil — hors audit initial

Trois défauts que la lecture de code n'avait pas révélés, tous sur le parcours de premier lancement.

**Aucun nouvel utilisateur ne pouvait démarrer.** `handleGenerate` refusait d'appeler le serveur
quand `remaining_total` valait 0, or les 10 tokens sont octroyés *par* le serveur à la première
génération. Compte neuf → pas de ligne `user_entitlements` → 0 → blocage → octroi jamais exécuté.
Chaque installation aurait affiché « You've used all your tokens » avant la première image, sans
issue. Le serveur est désormais seul juge, et ses quatre messages de refus sont enfin reconnus
(l'ancien test cherchait `"Limit Reached"` quand l'edge répond `"Limit reached."`).

**Application gelée au lancement.** `WelcomeOnboarding` et `AppModal` sont deux `<Modal>` React
Native ; deux présentations simultanées cassent le view controller du premier sur iOS. L'onboarding
ne pouvant plus être terminé, le blocage se répétait à chaque lancement.

**Galerie illisible en développement.** `MenuView` est posé en `absoluteFillObject` sur chaque
vignette ; absent d'Expo Go, il se rendait en boîte d'erreur recouvrant l'image. Repli ajouté.

*À noter : ces trois défauts ne se déclenchent que sur un parcours qu'un développeur ne refait
jamais. La passe d'autocritique de l'audit signalait l'UX comme sa zone la plus faible, traitée par
déduction sans lancer l'application. Une demi-heure sur appareil a produit plus que six heures de
lecture sur ce périmètre.*

## Reste ouvert

| Finding | Ce qui bloque |
|---|---|
| **`SEC-001`** webhook PoYo non authentifié | **Une clé.** Le code HMAC est écrit et commité. `GET /api/api-keys/webhook-secret` sur votre compte PoYo, puis déploiement. |
| **`SAFETY-001`** aucune modération | Souscription à un service de détection, procédure de signalement écrite, décision produit sur les photos de personnes. Bloque le lancement public. |
| `ECON-006` aucun registre | Touche toutes les RPC qui écrivent un solde — à relire avant d'appliquer. À poser **avant** d'avoir des utilisateurs. |
| `COST-001` aucun plafond de dépense | Le montant est une décision commerciale. ~3 240 $/jour au plafond technique actuel. |
| `ADMIN-001` MFA + journal d'audit | Enrôlement MFA en console. |
| `PERF-001` bundle non mesuré | `expo export` à exécuter. |
| `ECON-003` porte résiduelle | Un compte sans `device_id` exploitable reçoit encore 10 tokens. Fermer suppose de créer l'entitlement dans `handle_new_user`. |

## Actions hors code

1. **Révoquer la clé PoYo** collée en conversation le 2026-08-05.
2. **Rotation des clés legacy Supabase**, dans cet ordre : publier MiniPainterDB → attendre
   l'adoption → migrer les 4 edge functions vers une clé `sb_secret_…` → **alors** révoquer.
   Sauter l'étape 3 fait tomber les quatre fonctions simultanément.
3. *Secret scanning* sur MiniPainterDB : refusé par GitHub, dépôt privé sans Advanced Security.

## Corrections apportées à l'audit lui-même

- **Le « slider de couleur erratique »** repris du cahier des charges n'existe pas dans MiniStudio.
  Le seul slider est `CreativitySlider` (température du modèle). Le `HueSlider` appartient à
  MiniPainterDB, hors périmètre. Le contrôle 13.11 devient `N/A`.
- **Premier diagnostic du gel erroné** : j'avais supposé qu'`AppModal` ne se fermait pas, sans lire
  ses gestionnaires de boutons — qui appellent `onClose()` en première ligne. Correctif annulé.
  C'est un journal d'état des surfaces superposées qui a donné la réponse.
