-- LOGIC-001 etape 3 : classification des 180 Duncan (Two Thin Coats).
-- Leurs `set` (Wave 1/2/3) sont chronologiques : classification par le NOM.
-- 19 produits sur 180 sont declares incertains dans
-- audit/fixes-wave3/duncan_classification.sql (6 glazes + 5 metalliques + autres).
-- Applique quand meme : une classification imparfaite vaut mieux que NULL, qui
-- desactive entierement le filtre de categorie pour ces 180 SKU.

UPDATE public.paints SET product_type = 'opaque' WHERE brand = 'Duncan' AND code IN (
  'abyss-blue-wave-2', 'ambush-yellow-wave-3', 'amethyst-rayne-wave-1', 'amphora-red-wave-3', 'amulet-purple-wave-2', 'ancient-forest-wave-1', 'antiquity-green-wave-3', 'apocalypse-sky-wave-3', 'ares-flesh-wave-2', 'argonaut-skin-wave-2', 'ashen-grey-wave-2', 'asmodeus-red-wave-2', 'barbarian-brawn-wave-1', 'bard-skin-wave-2', 'berserker-red-wave-1', 'boar-hide-wave-1', 'boot-strap-brown-wave-3', 'carapace-green-wave-3', 'carcharodon-grey-wave-1', 'celestial-blue-wave-1', 'centurion-red-wave-3', 'cerberus-brown-wave-2', 'cold-corpse-blue-wave-1', 'contagion-green-wave-3', 'craven-yellow-wave-2', 'cuirass-leather-wave-1', 'cursed-blue-wave-2', 'cyber-pink-wave-3', 'dark-sun-yellow-wave-1', 'death-reaper-wave-1', 'decadent-purple-wave-3', 'demon-red-wave-1', 'doom-death-black-wave-1', 'dragon-fang-wave-1', 'dread-red-wave-2', 'druid-flesh-wave-2', 'dry-rust-brown-wave-2', 'dungeon-stone-grey-wave-1', 'dust-bowl-wave-1', 'dwarven-skin-wave-1', 'eidolon-grey-wave-2', 'elder-robe-wave-3', 'elixir-green-wave-3', 'elven-skin-wave-1', 'elysium-blue-wave-1', 'emperor-red-wave-3', 'emperor-s-purple-wave-3', 'enchantment-blue-wave-3', 'enchantress-purple-wave-3', 'enticing-purple-wave-3', 'ethereal-green-wave-1', 'evil-eye-red-wave-2', 'fanatic-orange-wave-1', 'faust-blue-wave-3', 'field-grey-wave-2', 'fire-opal-wave-3', 'flak-gun-yellow-wave-3', 'flaming-forge-orange-wave-2', 'frost-blue-wave-3', 'fury-green-wave-2', 'ghoul-green-wave-2', 'gigawatt-blue-wave-2', 'glistening-gums-wave-1', 'goblinoid-green-wave-2', 'gravestone-blue-wave-1', 'green-beret-wave-2', 'griffon-claw-wave-1', 'gung-ho-green-wave-2', 'gyzmo-fur-wave-2', 'hellspawn-red-wave-2', 'hot-pink-wave-2', 'hydra-green-wave-2', 'incubus-purple-wave-3', 'inferno-orange-wave-3', 'ion-blue-wave-3', 'ivory-tusk-wave-1', 'jade-green-wave-2', 'keleton-legion-wave-1', 'kobold-grey-wave-2', 'kronos-flesh-wave-2', 'legion-green-wave-3', 'leviathan-blue-wave-2', 'manticore-ochre-wave-2', 'marine-blue-wave-1', 'merald-green-wave-1', 'mythic-turquoise-wave-3', 'neo-pink-wave-2', 'noble-steed-brown-wave-2', 'omega-blue-wave-3', 'orange-flare-wave-1', 'orc-hide-wave-2', 'oxidation-green-wave-3', 'paladin-flesh-wave-2', 'pale-skin-wave-3', 'panzer-yellow-wave-3', 'perisher-pink-wave-2', 'pestilence-green-wave-3', 'ranger-cloak-wave-2', 'ray-gun-glow-wave-2', 'red-rage-wave-3', 'relic-blue-wave-3', 'rodent-grey-wave-2', 'royal-cloak-wave-1', 'runic-purple-wave-1', 'rust-orange-wave-1', 'sandstone-wave-1', 'sanguine-scarlet-wave-1', 'satyr-brown-wave-2', 'scabbard-brown-wave-3', 'scarab-red-wave-3', 'scorched-earth-wave-1', 'seafarer-blue-wave-3', 'sentient-turquoise-wave-2', 'septric-green-wave-3', 'serpent-eye-yellow-wave-3', 'shadow-blue-wave-3', 'skulker-yellow-wave-1', 'solar-flare-wave-3', 'sorceror-s-cloak-wave-1', 'spectral-purple-wave-3', 'sun-bleach-yellow-wave-3', 'sword-hilt-burgundy-wave-1', 'talisman-green-wave-2', 'temple-stone-wave-1', 'traitor-green-wave-3', 'troll-snot-green-wave-2', 'trooper-white-wave-1', 'twin-suns-yellow-wave-3', 'ur-cloak-wave-1', 'vambrace-brown-wave-3', 'vampire-fang-wave-1', 'von-evile-pimple-wave-3', 'war-master-green-wave-3', 'wasteland-brown-wave-1', 'white-star-wave-1', 'witching-hour-blue-wave-2', 'wizard-grey-wave-1', 'wolf-grey-wave-1', 'wyvern-green-wave-1', 'yellow-flame-wave-1', 'zombie-rot-wave-3'
);

UPDATE public.paints SET product_type = 'metallic' WHERE brand = 'Duncan' AND code IN (
  'ancient-gold-wave-3', 'batle-axe-brass-wave-2', 'blue-steel-wave-3', 'chaos-bronze-wave-3', 'death-metal-wave-3', 'dragon-s-gold-wave-1', 'dwarven-iron-wave-2', 'glistening-gold-wave-1', 'heirloom-gold-wave-3', 'mythril-blade-wave-1', 'overlord-brass-wave-2', 'plate-armour-wave-1', 'platinum-crown-wave-2', 'ritz-o-tin-wave-3', 'sir-coates-silver-wave-1', 'spartan-bronze-wave-1', 'steampunk-copper-wave-2', 'top-brass-wave-2'
);

UPDATE public.paints SET product_type = 'wash' WHERE brand = 'Duncan' AND code IN (
  'archaic-sepia-wash-wave-1', 'aztec-turquoise-wash-wave-3', 'battle-mud-wash-wave-1', 'bone-wash-wave-3', 'flesh-wash-wave-1', 'hazard-yellow-wash-wave-3', 'helion-red-wash-wave-2', 'magi-purple-wash-wave-2', 'necrosis-green-wash-wave-1', 'oblivion-black-wash-wave-1', 'rc-flesh-wash-wave-1', 'smoke-grey-wash-wave-3', 'tempest-blue-wash-wave-2', 'blue-glaze-wave-2', 'green-glaze-wave-2', 'orange-glaze-wave-2', 'purple-glaze-wave-2', 'red-glaze-wave-2', 'yellow-glaze-wave-2'
);

UPDATE public.paints SET product_type = 'technical' WHERE brand = 'Duncan' AND code IN (
  'gloss-varnish-wave-3', 'matt-varnish-wave-3'
);

-- DATA-004 : verrouiller l'enumeration en base — le seul endroit que rien ne contourne.
ALTER TABLE public.paints
  ADD CONSTRAINT paints_product_type_check
  CHECK (product_type IN ('opaque','airbrush','metallic','wash','contrast','technical','primer','fluorescent'));

ALTER TABLE public.paints ALTER COLUMN product_type SET NOT NULL;;
