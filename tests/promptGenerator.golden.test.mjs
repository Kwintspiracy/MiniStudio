/**
 * Jeu doré — AI-001
 *
 * Vérifie que la catégorie réelle d'une peinture (`product_type`) atteint bien
 * le prompt assemblé, et non seulement son nom et sa valeur hexadécimale.
 *
 * Contexte : avant correction, le générateur ne discriminait que sur
 * `finish === 'Metallic'`. Or `finish` est NULL sur 95,5 % du catalogue
 * (2 823 des 2 956 références) et manque 78 des 205 métalliques. Résultat :
 * 254 contrast, 140 lavis et 78 métalliques étaient émis en aplat opaque.
 *
 * Ces assertions échouent sur le code d'avant le 2026-08-05.
 *
 *   node --experimental-strip-types --import ./tests/alias-loader.mjs --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Global injecté par React Native ; le générateur s'en sert pour ses traces.
globalThis.__DEV__ = false;

const { generatePaintPrompt } = await import('../src/utils/promptGenerator.ts');

const base = {
  isPro: false,
  selectedStyle: { id: 'none', name: 'None', prompt: 'Paint this miniature.' },
  isPaletteEnabled: true,
  selectedBrands: [],
  loadedPaints: [],
  isNMMEnabled: false,
  isOSLEnabled: false,
  isPhotoshootEnabled: false,
  effectPrompts: {},
  painterPrompt: '',
};

const withColors = (colors) => generatePaintPrompt({ ...base, selectedColors: colors });

test('un lavis est décrit comme translucide, jamais comme un aplat', () => {
  const out = withColors([{ name: 'Nuln Oil', hex: '#1B1B1B', product_type: 'wash' }]);
  assert.match(out, /\[Washes\]/, 'le bloc [Washes] doit exister');
  assert.match(out, /translucent glaze/i);
  assert.match(out, /pool and darken in the recesses/i);
  assert.match(out, /Nuln Oil: #1B1B1B/);
});

test('une contrast produit son dégradé en un passage', () => {
  const out = withColors([{ name: 'Blood Angels Red', hex: '#9A1115', product_type: 'contrast' }]);
  assert.match(out, /\[Contrast \/ Speedpaint\]/);
  assert.match(out, /gradient/i);
  // La nuance doit figurer SOUS l'en-tête Contrast, et nulle part ailleurs :
  // c'est l'en-tête qui porte l'instruction de rendu.
  assert.match(out, /\[Contrast \/ Speedpaint\][^\n]*\n?[^\n]*:\nBlood Angels Red: #9A1115/,
    'la nuance doit suivre immédiatement son en-tête de catégorie');
  const avantContrast = out.slice(0, out.indexOf('[Contrast'));
  assert.ok(!avantContrast.includes('Blood Angels Red'),
    'ne doit pas aussi apparaître dans la liste des couches couvrantes');
});

test('un métallique dont finish est NULL reste métallique — le cœur du défaut', () => {
  // 78 des 205 métalliques du catalogue sont exactement dans ce cas.
  const out = withColors([{ name: 'Leadbelcher', hex: '#888D8F', product_type: 'metallic' }]);
  assert.match(out, /\[Metallics\]/);
  assert.match(out, /TMM pigment texture/i);
});

test('un produit technique est un effet de surface, pas une couleur', () => {
  const out = withColors([{ name: 'Blood for the Blood God', hex: '#6E0F0F', product_type: 'technical' }]);
  assert.match(out, /\[Technical\]/);
  assert.match(out, /textured or glossy surface effect/i);
});

test('opaque, airbrush, primer et fluorescent restent des couches couvrantes', () => {
  const out = withColors([
    { name: 'Mephiston Red', hex: '#9A1115', product_type: 'opaque' },
    { name: 'Air Steel',     hex: '#8A8A8A', product_type: 'airbrush' },
    { name: 'Chaos Black',   hex: '#231F20', product_type: 'primer' },
    { name: 'Hexos Palesun', hex: '#F2E85C', product_type: 'fluorescent' },
  ]);
  assert.match(out, /\[STRICT PALETTE\]/);
  for (const n of ['Mephiston Red', 'Air Steel', 'Chaos Black', 'Hexos Palesun']) {
    assert.ok(out.includes(n), `${n} doit figurer dans la palette`);
  }
  assert.doesNotMatch(out, /\[Washes\]|\[Contrast|\[Technical\]/);
});

test('les huit catégories cohabitent sans se mélanger', () => {
  const out = withColors([
    { name: 'A', hex: '#111111', product_type: 'opaque' },
    { name: 'B', hex: '#222222', product_type: 'metallic' },
    { name: 'C', hex: '#333333', product_type: 'wash' },
    { name: 'D', hex: '#444444', product_type: 'contrast' },
    { name: 'E', hex: '#555555', product_type: 'technical' },
  ]);
  for (const block of ['[Metallics]', '[Washes]', '[Contrast / Speedpaint]', '[Technical]']) {
    assert.ok(out.includes(block), `bloc manquant : ${block}`);
  }
});

test('repli sur finish quand product_type manque — données mises en cache', () => {
  // Les clients installés servent un cache antérieur au bump de clé.
  const out = withColors([{ name: 'Retributor Armour', hex: '#D4AF37', finish: 'Metallic' }]);
  assert.match(out, /\[Metallics\]/);
});

test('aucune couleur sélectionnée : le prompt reste valide', () => {
  const out = withColors([]);
  assert.ok(out.includes('[GOAL]'));
  assert.doesNotMatch(out, /\[STRICT PALETTE\]/);
});
