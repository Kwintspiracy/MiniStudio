/**
 * MiniStudio Design System - Unified Theme Export
 * 
 * Single import point for all design tokens.
 * 
 * Usage:
 *   import { colors, textStyles, spacing, borderRadius } from '@/theme';
 */

export { colors, type ColorToken } from './colors';
export {
    fontFamily,
    fontSize,
    fontWeight,
    letterSpacing,
    textStyles
} from './typography';
export {
    spacing,
    borderRadius,
    dimensions,
    shadows
} from './spacing';

// Convenience re-export of common combinations
export const theme = {
    colors: require('./colors').colors,
    typography: require('./typography'),
    spacing: require('./spacing'),
} as const;
