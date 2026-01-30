# MiniStudio Prompt Generation Scenarios

# This document outlines all possible prompt combinations for the Paint mode

## VARIABLES

### Mode (determines which template is used)

- BASE mode: Uses `selectedStyle.prompt` + basic effects
- PRO mode: Uses `selectedStyle.promptPro` + enhanced effects (costs 2 tokens)

### Styles (mutually exclusive - one must be selected)

- Craftworld Studio
- Competition Style
- Grimdark
- Speed Paint
- Contrast
- (Additional styles from database)

### Effects (can be combined)

- NMM (Non-Metallic Metal): ON/OFF
- OSL (Object Source Lighting): ON/OFF
- Photoshoot (Studio Lighting): ON/OFF

### Color Palette Options

- Brand Selection: All Brands, My Collection, specific brands (Army Painter,
  Citadel Colour, Scale75, Duncan, Vallejo)
- Custom Palette: User-selected specific paints

---

## SCENARIO MATRIX

| Scenario | Mode | Style | NMM | OSL | Photoshoot | Brand Selection | Custom Palette | Prompt Structure                                                                             |
| -------- | ---- | ----- | --- | --- | ---------- | --------------- | -------------- | -------------------------------------------------------------------------------------------- |
| 1        | BASE | Any   | OFF | OFF | OFF        | All Brands      | None           | [Style] + [Colors: Smart filtered from all brands] + [Effects: TMM default]                  |
| 2        | BASE | Any   | OFF | OFF | OFF        | Specific Brand  | None           | [Style] + [Colors: Brand paints, smart filtered if >50] + [Effects: TMM default]             |
| 3        | BASE | Any   | OFF | OFF | OFF        | My Collection   | None           | [Style] + [Colors: User paints only] + [Effects: TMM default]                                |
| 4        | BASE | Any   | OFF | OFF | OFF        | Any             | Custom colors  | [Style] + [Colors: STRICT - exact user selection] + [Effects: TMM default]                   |
| 5        | BASE | Any   | ON  | OFF | OFF        | All Brands      | None           | [Style] + [Colors: Smart filtered, NMM recipes] + [Effects: NMM instructions]                |
| 6        | BASE | Any   | ON  | OFF | OFF        | Any             | Custom colors  | [Style] + [Colors: STRICT user selection] + [Effects: NMM or NMM.mixed if metallics present] |
| 7        | BASE | Any   | OFF | ON  | OFF        | Any             | Any            | [Style] + [Colors] + [Effects: TMM + OSL instructions]                                       |
| 8        | BASE | Any   | ON  | ON  | OFF        | Any             | Any            | [Style] + [Colors] + [Effects: NMM + OSL instructions]                                       |
| 9        | BASE | Any   | OFF | OFF | ON         | Any             | Any            | [Style] + [Colors] + [Effects: TMM + Photoshoot instructions]                                |
| 10       | BASE | Any   | ON  | ON  | ON         | Any             | Any            | [Style] + [Colors] + [Effects: NMM + OSL + Photoshoot]                                       |
| 11       | PRO  | Any   | OFF | OFF | OFF        | All Brands      | None           | [Style Pro] + [Colors: Smart filtered] + [Effects: TMM Pro]                                  |
| 12       | PRO  | Any   | OFF | OFF | OFF        | Specific Brand  | None           | [Style Pro] + [Colors: Brand paints] + [Effects: TMM Pro]                                    |
| 13       | PRO  | Any   | OFF | OFF | OFF        | Any             | Custom colors  | [Style Pro] + [Colors: STRICT] + [Effects: TMM Pro]                                          |
| 14       | PRO  | Any   | ON  | OFF | OFF        | Any             | Any            | [Style Pro] + [Colors] + [Effects: NMM Pro]                                                  |
| 15       | PRO  | Any   | OFF | ON  | OFF        | Any             | Any            | [Style Pro] + [Colors] + [Effects: TMM Pro + OSL Pro]                                        |
| 16       | PRO  | Any   | ON  | ON  | ON         | Any             | Any            | [Style Pro] + [Colors] + [Effects: NMM Pro + OSL Pro + Photoshoot Pro]                       |

---

## DETAILED PROMPT STRUCTURE

### Section 1: [Style Prompt Details]

- Always included
- Content from selected style's `prompt` (BASE) or `promptPro` (PRO)
- May contain `{{METALLIC_PALETTE}}` placeholder for inline metallic colors

### Section 2: User Custom Details (optional)

- Inserted after style if user typed additional instructions
- Sanitized to prevent prompt injection

### Section 3: [Colors] (conditional)

Only included if any of these are true:

- User selected specific colors (Custom Palette)
- User selected brands
- Palette was enabled with any selection

**Sub-scenarios:**

1. **Custom Palette selected**: `STRICT COLOR PALETTE:` + exact user colors
2. **Brand selected, >50 paints**: Smart downsampling with categories:
   - [Flesh Tones]
   - [Neutrals]
   - [Colors]
   - Metallics (TMM or NMM recipes based on toggle)
3. **Brand selected, ≤50 paints**: Direct list of all brand paints
4. **No colors, only brands**: `using paints from these brands: [brand list]`

### Section 4: [Effects] (always included)

**NMM Toggle OFF:**

- TMM instructions (default metallic rendering)
- Uses `nmmEffect.negative_default` or `nmmEffect.negative_pro` or fallback
  constant

**NMM Toggle ON:**

- If user selected metallic paints: Uses `effect.nmm.mixed` (hybrid approach)
- If no metallics selected: Uses standard `effect.nmm` instructions

**OSL Toggle ON:**

- Adds OSL instructions from `effect.osl`

**Photoshoot Toggle ON:**

- Adds studio lighting instructions from `effect.photoshoot`

---

## SPECIAL CASES

### NMM with Metallic Paints Selected

When user enables NMM but also selects metallic paints:

- System uses "mixed mode" effect
- Metallic paints rendered with TMM texture based on their hues
- Non-metallic paints use NMM technique

### Smart Downsampling (>50 paints)

When brand has more than 50 paints:

- `filterPaintsByDiversity()` reduces to representative sample
- Ensures color diversity across categories
- Separate handling for skin tones, neutrals, chromatics, metallics

### My Collection

- Filters to only paints marked with `_isUserPaint: true`
- Shows empty state if user has no saved paints
- Prompts to download MiniPainterDB companion app

---

## MODEL SELECTION

| Mode | Model Used                 | Token Cost |
| ---- | -------------------------- | ---------- |
| BASE | gemini-2.5-flash-image     | 1 Token    |
| PRO  | gemini-3-pro-image-preview | 2 Tokens   |
