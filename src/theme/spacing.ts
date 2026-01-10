/**
 * MiniStudio Design System - Spacing & Layout Tokens
 */

// Spacing scale (in pixels)
export const spacing = {
    xs: 4,
    sm: 8,
    md: 10,
    lg: 12,
    xl: 16,
    '2xl': 20,
    '3xl': 24,
    '4xl': 32,
    '5xl': 48,
} as const;

// Border radius scale
export const borderRadius = {
    sm: 4,
    md: 6,
    lg: 8,
    xl: 24,
    full: 32,
} as const;

// Component-specific dimensions
export const dimensions = {
    button: {
        height: 48,
        heightSmall: 40,
    },
    input: {
        height: 48,
    },
    statusBar: {
        height: 47,
    },
    modal: {
        grabberWidth: 36,
        grabberHeight: 5,
    },
} as const;

// Shadow presets
export const shadows = {
    footer: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 20,
    },
} as const;
