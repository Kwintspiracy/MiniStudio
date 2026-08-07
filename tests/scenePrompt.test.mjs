/**
 * Mode Scène — une seule génération, quatre usages
 *
 * Le décor n'est pas un mode séparé : l'imposer comme une seconde passe ferait
 * payer deux générations — six tokens en Pro — ce qu'un seul appel produit.
 * `generatePaintPrompt` doit donc servir les quatre combinaisons, et une seule
 * requête part dans chacune.
 *
 *   style + pas de scène   → comportement historique, inchangé
 *   style + scène          → peinture ET décor
 *   garder + scène         → décor seul, peinture préservée
 *   garder + pas de scène  → bloqué côté interface, mais le prompt reste sûr
 *
 * Le piège que ces tests gardent fermé : réémettre le style, la palette ou les
 * effets quand l'utilisateur a demandé de préserver sa peinture. Le modèle
 * repeindrait la figurine tout en ajoutant des ruines derrière — le pire des
 * deux mondes, et la plainte serait « l'application a abîmé ma peinture ».
 *
 *   node --experimental-strip-types --import ./tests/alias-loader.mjs --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.__DEV__ = false;

const { generatePaintPrompt } = await import('../src/utils/promptGenerator.ts');
const { SCENE_PRESETS, EMPTY_SCENE } = await import('../src/constants/scenes.ts');

const STYLE_MARQUEUR = 'PAINT-THIS-VIVIDLY';
const gothic = SCENE_PRESETS.find(p => p.id === 'gothic');

const base = {
  isPro: false,
  selectedStyle: { id: 'vivid', name: 'Vibrant', prompt: STYLE_MARQUEUR },
  isPaletteEnabled: true,
  selectedBrands: ['Citadel'],
  loadedPaints: [],
  selectedColors: [{ name: 'Mephiston Red', hex: '#9a1115', product_type: 'opaque' }],
  isNMMEnabled: false,
  isOSLEnabled: false,
  isPhotoshootEnabled: false,
  effectPrompts: {},
  painterPrompt: '',
  criticalRules: 'KEEP-THE-SCULPT',
};

const scene = {
  ...EMPTY_SCENE,
  enabled: true,
  presetId: gothic.id,
  environment: gothic.environment,
  lighting: gothic.lighting,
  atmosphere: gothic.atmosphere,
  setting: gothic.setting,
  light: 'keep',
  ground: 'blend',
  dof: 'soft',
};

test('style seul — le comportement historique ne bouge pas', () => {
  const p = generatePaintPrompt(base);
  assert.ok(p.includes(STYLE_MARQUEUR), 'le style doit être émis');
  assert.ok(p.includes('Mephiston Red'), 'la palette doit être émise');
  assert.ok(!p.includes('[SCENE]'), 'aucune section scène sans scène');
});

test('style + scène — les deux dans le même prompt', () => {
  const p = generatePaintPrompt({ ...base, scene });
  assert.ok(p.includes(STYLE_MARQUEUR), 'la peinture est demandée');
  assert.ok(p.includes('[SCENE]'), 'le décor est demandé');
  // Les préréglages sont rédigés en anglais, comme toute l'interface : ce sont
  // des textes que l'utilisateur lit et modifie dans les champs.
  assert.ok(p.includes('ruined gothic cathedral'), 'la description du décor arrive intacte');
  assert.ok(!p.includes('ABSOLUTE SUBJECT PRESERVATION'),
    'on repeint : la préservation ne doit pas contredire le style');
});

test('garder ma peinture + scène — décor seul, rien n’est repeint', () => {
  const p = generatePaintPrompt({ ...base, keepExistingPaint: true, scene });
  assert.ok(p.includes('ABSOLUTE SUBJECT PRESERVATION'), 'la préservation est énoncée');
  assert.ok(p.includes('[SCENE]'), 'le décor est demandé');
  // Le cœur du test : aucune consigne de repeindre ne doit subsister.
  assert.ok(!p.includes(STYLE_MARQUEUR), 'le style ne doit pas être émis');
  assert.ok(!p.includes('Mephiston Red'), 'la palette ne doit pas être émise');
  assert.ok(!p.includes('[EFFECTS]'), 'les effets ne doivent pas être émis');
  assert.ok(!p.includes('KEEP-THE-SCULPT'),
    'rules.paint dit « applique la couleur aux formes existantes » : hors sujet ici');
});

test('garder ma peinture sans scène — rien qui puisse repeindre', () => {
  const p = generatePaintPrompt({ ...base, keepExistingPaint: true });
  assert.ok(p.includes('ABSOLUTE SUBJECT PRESERVATION'));
  assert.ok(!p.includes(STYLE_MARQUEUR));
  assert.ok(!p.includes('[SCENE]'));
});

test('une scène activée mais vide n’émet rien', () => {
  // L'utilisateur bascule le commutateur puis n'écrit rien : émettre une
  // section [SCENE] sans description laisserait le modèle inventer un décor
  // que personne n'a demandé.
  const vide = { ...EMPTY_SCENE, enabled: true };
  assert.ok(!generatePaintPrompt({ ...base, scene: vide }).includes('[SCENE]'));
});

test('une scène décrite mais désactivée n’émet rien', () => {
  // Le texte reste saisi quand on referme le commutateur ; il ne doit pas
  // partir pour autant.
  assert.ok(!generatePaintPrompt({ ...base, scene: { ...scene, enabled: false } }).includes('[SCENE]'));
});

test('les trois réglages de rendu atteignent le prompt', () => {
  const net = generatePaintPrompt({ ...base, scene: { ...scene, dof: 'none' } });
  assert.ok(net.includes('entire frame in sharp focus'));

  const flou = generatePaintPrompt({ ...base, scene: { ...scene, dof: 'strong' } });
  assert.ok(flou.includes('dissolves into soft bokeh'));

  const pose = generatePaintPrompt({ ...base, scene: { ...scene, ground: 'rest' } });
  assert.ok(pose.includes('base stays visible'));

  const adapte = generatePaintPrompt({ ...base, scene: { ...scene, light: 'adapt' } });
  assert.ok(adapte.includes('Relight the subject'));
});

test('la scène écarte l’effet Photoshoot, qui la contredirait', () => {
  // Photoshoot demande un fond de studio sans raccord ; une scène demande
  // l'inverse. Les deux ensemble donnent au modèle deux consignes opposées sur
  // le même arrière-plan.
  const avecPhoto = {
    ...base,
    isPhotoshootEnabled: true,
    effectPrompts: { 'effect.photoshoot': { default: 'SEAMLESS-STUDIO', pro: 'SEAMLESS-STUDIO' } },
  };
  assert.ok(generatePaintPrompt(avecPhoto).includes('SEAMLESS-STUDIO'),
    'sans scène, l’effet reste actif');
  assert.ok(!generatePaintPrompt({ ...avecPhoto, scene }).includes('SEAMLESS-STUDIO'),
    'avec scène, l’effet est écarté');
});

test('les champs de scène sont plafonnés et gardent leurs accents', () => {
  const long = { ...scene, environment: 'é'.repeat(900) };
  const p = generatePaintPrompt({ ...base, scene: long });
  const ligne = p.split('\n').find(l => l.startsWith('Environment: '));
  // 400 est le plafond de SCENE_LIMITS.environment.
  assert.equal(ligne.replace('Environment: ', '').length, 400);
  assert.ok(ligne.includes('é'), 'les accents survivent au filtrage');
});
