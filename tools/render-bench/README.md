# Banc de comparaison de rendus

Soumet **une** image source et **un** prompt à N modèles en parallèle, puis produit une comparaison
côte à côte.

**Deux modes, même moteur** (`lib.mjs`) :

| | Pour quoi |
|---|---|
| **Interface** — `node serve.mjs` | Vous pilotez : image glissée-déposée, prompt éditable, modèles cochés, rendus qui apparaissent en direct. **C'est le mode à utiliser.** |
| **Ligne de commande** — `node bench.mjs …` | Passages répétables, scriptables, intégrables à un futur test de non-régression. |

## Interface — démarrage

```powershell
cd D:\APPS\MiniStudio\tools\render-bench
$env:POYO_API_KEY = "votre-cle-bench"
$env:GOOGLE_API_KEY = "votre-cle-google"    # facultatif
node serve.mjs
```

Puis ouvrez **http://localhost:5178**.

Le bandeau du haut indique en vert ou rouge si chaque clé a été détectée. Ce que vous contrôlez :

- **Image source** — glissée-déposée ou choisie, avec aperçu
- **Prompt** — pré-rempli depuis `prompt.txt`, entièrement éditable, compteur de caractères
- **Modèles** — cases à cocher avec le coût attendu, et quatre préréglages : *tous*, *décision de
  marge* (`nano-banana-2-edit` contre `nano-banana-pro-edit`), *les moins chers*, *aucun*
- **Débit** — nombre de tâches de front et intervalle de sondage
- **Coût estimé** avant lancement, **coût réel cumulé** pendant

Les cartes apparaissent immédiatement en *attente*, passent en *en cours*, puis se remplissent avec
le rendu, le coût relevé, le nombre de crédits et la durée. Elles se **reclassent automatiquement du
moins cher au plus cher**. Un clic agrandit une image. Tout est enregistré dans
`resultats/<horodatage>/`, avec un `resultats.json`.

### Podium

Sous chaque rendu, trois boutons — **1ᵉʳ · 2ᵉ · 3ᵉ**. Désignez vos trois meilleurs : la carte se
borde d'or, d'argent ou de bronze et reçoit sa médaille. Un modèle ne peut occuper qu'une place ;
cliquer une place déjà attribuée la libère. **L'enregistrement est immédiat**, dans le
`resultats.json` du passage.

### Onglet *Historique*

Tous les passages archivés, du plus récent au plus ancien : vignette de la source, date, nombre de
rendus, coût total, et le podium s'il a été rendu. **Cliquez sur un passage pour le rouvrir** — les
rendus, le prompt et le podium reviennent dans l'onglet *Banc*, et le podium reste modifiable.

### Onglet *Classement*

L'agrégation de tous les passages jugés.

| Colonne | Sens |
|---|---|
| Passages | nombre de fois où le modèle a été testé |
| 🥇 🥈 🥉 | podiums obtenus |
| **Points** | 3 par première place, 2 par deuxième, 1 par troisième |
| Coût moyen | coût réel relevé, moyenné sur tous les passages |
| Durée | temps de génération moyen |
| **Valeur** | **points par dollar dépensé** |

**La colonne *Valeur* est celle qui tranche.** Deux modèles peuvent être à égalité de points et
séparés d'un facteur 4 en rapport qualité/coût — c'est précisément l'arbitrage que ce banc existe
pour rendre.

Tout s'exécute sur votre machine. **Les clés restent dans l'environnement du processus Node et ne
sont jamais transmises au navigateur.**

---

## Ligne de commande

Il fait deux choses en un passage :

1. **Comparer les rendus** — c'est le critère qui prime.
2. **Relever le coût réel de chaque modèle.** La réponse de
   `GET /api/generate/status/{task_id}` contient `credits_amount`. C'est la **seule** source fiable
   pour les variantes `-edit`, que la grille publique poyo.ai ne détaille pas — et c'est ainsi qu'on
   a établi que `nano-banana-pro-edit` coûte 18 crédits là où la grille annonce 8 pour la variante
   texte.

Le banc signale tout écart entre le coût relevé et la valeur attendue.

---

## Prérequis

Node 18 ou supérieur (`fetch` natif). Aucune dépendance à installer.

```bash
export POYO_API_KEY=...          # obligatoire
export GOOGLE_API_KEY=...        # facultatif — ajoute Gemini en direct à la comparaison
```

Sous PowerShell :

```powershell
$env:POYO_API_KEY = "..."
$env:GOOGLE_API_KEY = "..."
```

> Utilisez une clé PoYo **dédiée au banc**, pas une de vos cinq clés de production : la rotation
> plafonne à 5 requêtes/minute par clé, et un banc sur dix modèles la saturerait.

---

## Usage

```bash
cd tools/render-bench

# 1. Voir le plan et le coût estimé, sans rien dépenser
node bench.mjs --image ./figurine.jpg --prompt "..." --dry-run

# 2. Lancer
node bench.mjs --image ./figurine.jpg --prompt-file ./prompt.txt --yes

# 3. Restreindre à quelques modèles
node bench.mjs --image ./figurine.jpg --prompt-file ./prompt.txt \
  --models nano-banana-2-edit,nano-banana-pro-edit,seedream-4-edit --yes
```

| Option | Effet |
|---|---|
| `--image <fichier>` | image source (jpg, png, webp) |
| `--prompt "..."` | prompt en ligne |
| `--prompt-file <f>` | prompt depuis un fichier — **recommandé**, les vôtres font plusieurs milliers de caractères |
| `--models a,b,c` | restreint la liste (défaut : les 10 modèles image-to-image) |
| `--out <dir>` | dossier de sortie (défaut `./resultats`) |
| `--concurrency N` | tâches menées de front (défaut **3**) |
| `--poll-interval S` | secondes entre deux sondages (défaut **6**) |
| `--dry-run` | n'appelle rien, affiche le plan et le coût estimé |
| `--yes`, `-y` | lance réellement — **obligatoire, ce banc dépense de l'argent** |

### Débit

PoYo plafonne à **5 requêtes par minute et par clé**. On ignore si ce plafond couvre aussi
`/status` — les valeurs par défaut (3 de front, sondage toutes les 6 s) sont donc prudentes. Le banc
gère les `429` en patientant 15 s puis en réessayant, mais si vous en voyez beaucoup :

```bash
node bench.mjs ... --concurrency 2 --poll-interval 10 --yes
```

---

## Sortie

```
resultats/
  comparaison.html      ← ouvrez ceci
  resultats.json        ← données brutes, réutilisables
  source.jpg
  nano-banana-2-edit.png
  nano-banana-pro-edit.png
  …
```

`comparaison.html` affiche la source et le prompt en tête, puis les rendus **classés du moins cher
au plus cher**, chacun avec son coût relevé, son nombre de crédits et sa durée. Un tableau récapitule
les coûts et marque les écarts avec la grille publique.

---

## Obtenir un prompt réaliste

Le banc ne sert à rien avec un prompt approximatif : ce sont vos gabarits qui font le rendu. Le plus
simple est de récupérer un prompt réellement soumis en production :

```sql
SELECT model_used, prompt
FROM public.generation_logs
WHERE prompt IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;
```

Collez-en un dans `prompt.txt`. Vous comparez alors les modèles sur ce que votre application produit
vraiment, et non sur un cas d'école.

---

## Coût d'un passage

Environ **0,35 $** pour les dix modèles image-to-image, au tarif attendu. Le banc affiche
l'estimation avant de lancer et le coût réel après.

---

## Ce que le banc ne fait pas

- **Il ne juge pas la qualité.** Il met les rendus côte à côte ; l'arbitrage vous revient, et il vous
  revient à vous seul — vous connaissez le rendu attendu d'un lavis ou d'un métallique, pas moi.
- **Il ne teste qu'un couple image/prompt à la fois.** Pour une décision solide, passez-en trois ou
  quatre : une figurine à métalliques dominants, une avec des lavis, une avec de la contrast, une
  avec beaucoup de textile. C'est là que les modèles se séparent.
- **Il ne touche ni à votre base, ni à vos crédits utilisateurs, ni à vos edge functions.** Il parle
  directement à PoYo et à Google.
