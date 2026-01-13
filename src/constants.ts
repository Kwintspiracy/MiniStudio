import type { StyleOption } from './types';

export const PAINTING_STYLES: StyleOption[] = [
  { id: 'none', name: 'None', prompt: '' },
  { id: 'heavy-metal', name: "'Eavy Metal", prompt: "in bright, saturated colors, clean execution, and high contrast highlights that make miniatures look crisp and heroic. It emphasizes smooth color transitions, sharp edge highlights, and precise brush control, often using bold complementary tones to make details pop. This style typically avoids heavy weathering or grime, focusing instead on clarity, readability, and visual impact, making every element—armor trim, weapon, and cloth—distinct and polished. The overall effect is vivid, clean, and idealized, giving models a high-fantasy, studio-showcase appearance where technical precision and color harmony take precedence over mood or realism." },
  { id: 'slapchop', name: 'SlapShop', prompt: "in the very popular quick and efficient painting technique involving priming in black, dry brushing light grey and white to highlight raised areas, then applying a contrast paint that flows into recesses. It creates good contrast with simple steps, suitable for tabletop quality minis." },
  { id: 'craftworld', name: 'Craftworld Studio', prompt: "Paint this miniature in the style of a master painter, focusing on vibrant and high-contrast effects. Utilize wet blending for seamless, smooth color transitions and abundant glazing layers to achieve rich, saturated colors with deep tonal harmony. Integrate Object Source Lighting (OSL) where appropriate, showing realistic colored light emanating from specific points. Employ a curated, harmonious color palette that features complementary cool shadows (blues, violets, deep greens) on warmer mid-tones (reds, oranges, yellows) to maximize depth and visual interest. Ensure razor-sharp edge highlighting on all hard surfaces and a high overall tonal contrast between the darkest shadows and brightest highlights. The final image must convey a professionally hand-painted, artisanal quality, feeling dynamic, intense, and exquisitely finished. The miniature's base should also be painted to perfectly match and enhance the overall aesthetic and color scheme." },
  { id: 'grimdark', name: 'Grimdark', prompt: "Paint this miniature with a desaturated, earthy color palette dominated by muted tones, incorporating occasional stark contrasts. Apply heavy weathering techniques throughout, including detailed rust, grime, and dirt, to create a distinct battle-worn and dystopian appearance. Utilize oil washes and glazes to achieve subtle shading and highlighting, enhancing the overall realism. Add intricate textures like scratches, dents, and corrosion to visibly convey wear and tear. The final image must evoke a gritty, dark, and oppressive atmosphere, as if the miniature exists in a war-torn, post-apocalyptic universe." },
  // { id: 'blanchitsu', name: 'Blanchitsu', prompt: "in a painterly, chaotic, and atmospheric miniature painting style that blends dark fantasy, surrealism, and religious iconography into a distinctive, moody aesthetic. It favors muted, earthy tones, stained and aged surfaces, and a sketch-like, expressive application of paint that prioritizes emotion and storytelling over technical precision." },
  // { id: 'cel-shaded', name: 'CelShaded', prompt: "in a cel-shaded, comic book style with bold black outlines and flat colors" },
  // { id: 'oil-painting', name: 'Oil Painting', prompt: "to look like a classical oil painting, with visible brushstrokes and rich, deep colors" },
];

export const BACKGROUND_THEMES = ['None', 'Fantasy', 'Sci-Fi', 'Modern', 'History'];

export interface PaintColor {
  name: string;
  hex: string;
}

export interface ColorBrand {
  id: string;
  name: string;
  colors: PaintColor[];
}

export const COLOR_BRANDS: ColorBrand[] = [
  {
    id: 'citadel',
    name: 'Citadel',
    colors: [
      { name: 'Mephiston Red', hex: '#9a1115' },
      { name: 'Macragge Blue', hex: '#0d407f' },
      { name: 'Caliban Green', hex: '#003d15' },
      { name: 'Averland Sunset', hex: '#ffb000' },
      { name: 'Abaddon Black', hex: '#231f20' },
      { name: 'White Scar', hex: '#ffffff' },
      { name: 'Leadbelcher', hex: '#888d8f' },
      { name: 'Balthasar Gold', hex: '#a67b5b' },
    ]
  },
  {
    id: 'vallejo',
    name: 'Vallejo',
    colors: [
      { name: 'Flat Red', hex: '#bf312d' },
      { name: 'Royal Blue', hex: '#1c3d7d' },
      { name: 'Olive Green', hex: '#4b5320' },
      { name: 'Gold Yellow', hex: '#f9d71c' },
      { name: 'Black', hex: '#000000' },
      { name: 'White', hex: '#ffffff' },
      { name: 'Gunmetal Grey', hex: '#545a5c' },
      { name: 'Polished Gold', hex: '#cfb53b' },
    ]
  },
  {
    id: 'army-painter',
    name: 'Army Painter',
    colors: [
      { name: 'Pure Red', hex: '#e21f26' },
      { name: 'Ultramarine Blue', hex: '#005596' },
      { name: 'Angel Green', hex: '#004d30' },
      { name: 'Daemonic Yellow', hex: '#fff200' },
      { name: 'Matt Black', hex: '#000000' },
      { name: 'Matt White', hex: '#ffffff' },
      { name: 'Plate Mail Metal', hex: '#a7a9ac' },
      { name: 'Greedy Gold', hex: '#b5943a' },
    ]
  }
];

export const DEFAULT_DESIGNER_TEMPLATES = {
  sketch: "Inspired by these images make a high-detail professional character concept art sketch, in the style of fantasy illustration. Use precise and clean linework with a consistent line weight to define the forms. {input}",
  sculpt: "A professional, high-resolution product photograph of a 32mm miniature. The figure, a {input}, is rendered as an unpainted, dark grey resin print. Emphasize extreme, hyperrealistic photorealism.",
  miniature: "A professional, high-resolution product photograph of a 32mm miniature. The figure, a {input}, is rendered as an unpainted, dark grey resin print. Emphasize extreme, hyperrealistic photorealism.",
  'pro-shot': "A studio product shot of a grey {input} miniature on a seamless black background. Soft diffused lighting.",
  combined: `Role: You are a Concept Artist using a "Style Transfer" workflow. Result: The subject described in my text, but painted as if it belongs in the universe of the reference images.`
};
