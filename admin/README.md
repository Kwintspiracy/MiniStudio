# Poste d'administration MiniStudio

Application web séparée. Elle ne fait pas partie du paquet mobile — c'est le point :
le portail d'administration pesait 100 à 150 Ko gzip dans le bundle servi aux
utilisateurs, pour un écran qu'eux ne verront jamais.

## Démarrer

```powershell
cd D:\APPS\MiniStudio\admin
npm install          # la première fois seulement
npm run dev
```

Puis **http://localhost:5180**. Connectez-vous avec votre compte ; l'accès est refusé
si `is_admin()` répond non.

La configuration est dans `.env.local`, ignoré par git. `.env.example` sert de modèle.
La clé employée est la clé *publishable* : elle n'accorde par elle-même aucun privilège,
toute l'autorisation venant des politiques RLS et de `is_admin()`.

## Ce que l'écran mobile ne pouvait pas faire

Trois blocages tenaient à la base, pas à l'interface. Ils sont levés par la migration
`20260806090000_admin_prompt_workbench.sql`.

| | Avant | Après |
|---|---|---|
| Lecture des versions | politique `is_active = true` : **22 des 50 versions invisibles** à leur auteur | l'administrateur voit tout l'historique |
| Écriture | politiques testant le JWT, où le rôle n'est pas porté | alignées sur `is_admin()`, comme le reste du schéma |
| Une seule version active | convention signalée par un ⚠️ | index unique partiel : l'état invalide est inatteignable |

## L'atelier de prompts

Trois panneaux : clés, versions, édition. Quatre modes sur le panneau de droite.

**Éditer** — les quatre champs (standard, pro, négatif, négatif pro) avec leur longueur,
`⌘S` pour enregistrer.

**Comparer** — différence au mot entre deux versions, avec le compte de mots ajoutés et
retirés. Le découpage est au mot et non à la ligne : un prompt est un paragraphe continu,
et une comparaison ligne à ligne signalerait un bloc entier modifié pour un adjectif changé.

**Aperçu** — le texte réellement envoyé au modèle, assemblé par `generatePaintPrompt`,
**la fonction de production elle-même**, importée depuis `../src` par un alias de Vite.
Réécrire l'assemblage ici donnerait un aperçu juste le jour de son écriture et faux au
premier changement du générateur. Les peintures viennent de la vraie table, avec un
échantillon couvrant chaque catégorie — sans wash ni contrast dans l'échantillon, les
blocs correspondants n'apparaîtraient pas.

**Tester** — une génération réelle par `generate-miniature`, avec le prompt de la version
en cours, active ou non. Débite un token du compte connecté et engage un coût fournisseur
réel, annoncé avant confirmation.

## La bibliothèque de blocs

Un gabarit cite un fragment partagé par `{{block:repère}}`. La référence est résolue **à
l'enregistrement**, pas à la génération : la production ne lit que du texte plein, sans
indirection ni requête supplémentaire sur le chemin chaud. Le gabarit non résolu est
conservé dans `template_source`, faute de quoi rouvrir une version en perdrait les
références.

Contrepartie assumée : modifier un bloc ne réécrit pas d'office les prompts qui
l'emploient — ce serait changer la production sans l'avoir demandé. La colonne « emploi »
de la bibliothèque indique lesquels rouvrir et réenregistrer.

## Structure

```
src/
  lib/
    supabase.ts   client et garde is_admin()
    api.ts        tous les accès aux données
    nav.ts        carte de navigation
    diff.ts       comparaison au mot (plus long sous-mot commun)
    blocs.ts      résolution des références {{block:…}}
    apercu.ts     assemblage par le générateur de production
  components/
    CommandPalette.tsx   ⌘K
    ui.tsx               messages, confirmations, indicateurs, formatage
  pages/          un fichier par écran
```

## Déployer

`npm run build` produit un site statique dans `dist/` — déposable sur n'importe quel
hébergeur. Aucun serveur n'est nécessaire : tout passe par Supabase, et l'autorisation
reste côté base.

Avant d'exposer ce site publiquement, gardez en tête que la sécurité repose entièrement
sur les politiques RLS. Elles ont été vérifiées, mais un hébergement derrière une
authentification supplémentaire — un accès réservé sur Vercel ou Cloudflare — reste la
disposition prudente.
