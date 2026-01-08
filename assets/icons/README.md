# Icon Assets for MiniStudio Sign In Screen

Download these icons from Figma and place them in this folder.

## Required Icons

### 1. Google Icon
- **Size:** 15x16 pixels
- **Figma Link:** https://www.figma.com/file/wovATQaYDmNY2GZ84UKi4e/minipainter?node-id=26:6247
- **Save as:** `google-icon.png` or `google-icon.svg`
- **Export Settings:** 
  - Format: PNG (2x for @2x) or SVG
  - Background: Transparent

### 2. Apple Icon
- **Size:** 13.02x16 pixels
- **Figma Link:** https://www.figma.com/file/wovATQaYDmNY2GZ84UKi4e/minipainter?node-id=26:6301
- **Save as:** `apple-icon.png` or `apple-icon.svg`
- **Export Settings:**
  - Format: PNG (2x for @2x) or SVG
  - Background: Transparent
  - Color: #F4F4F4 (white/light gray)

## How to Export from Figma

1. Open the Figma file using the link above
2. Select the icon node (use the node-id in the URL)
3. In the right sidebar, scroll to "Export"
4. Click "+" to add export settings
5. Choose format (PNG @2x recommended for React Native)
6. Click "Export" button

## Alternative: Use SVG Fallbacks

The `signin.tsx` file already includes SVG fallback components for both icons:
- `GoogleIcon` - Multi-colored Google "G" logo
- `AppleIcon` - Apple logo in white

These SVG components are used if you don't provide image files.

## Usage in Code

If you want to use image files instead of SVG components:

```tsx
import { Image } from 'react-native';

// Replace the GoogleIcon component with:
<Image 
  source={require('../assets/icons/google-icon.png')} 
  style={{ width: 15, height: 16 }} 
/>

// Replace the AppleIcon component with:
<Image 
  source={require('../assets/icons/apple-icon.png')} 
  style={{ width: 13, height: 16 }} 
/>
```
