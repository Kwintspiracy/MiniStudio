/**
 * MiniStudio Design System - Color Tokens
 * 
 * Single source of truth for all colors in the app.
 * Import this instead of hardcoding hex values.
 */

export const colors = {
    // Background colors
    background: {
        primary: '#2D2F39',
        secondary: '#1F2128',
        tertiary: '#474A5D',
        bottom: 'red',
    },

    // Text colors
    text: {
        primary: '#EFEFF1',
        secondary: '#7E808B',
        dark: '#1D1D1D',
        textfieldbg: '#16171D',
    },

    // Button colors
    button: {
        primary: '#2C59FF',
        danger: '#FA0439',
        secondary: '#2C2F3A',
        dark: '#1D1D1D',
        white: '#F4F4F4',
    },

    // Accent colors
    accent: {
        blue: '#518CFF',
        red: '#FA0439',
        purple: '#BB51FF',
        yellow: '#FFD60A',
    },

    // Border colors
    border: {
        subtle: 'rgba(255, 255, 255, 0.05)',
        strong: '#66666B',
    },
} as const;

// Type for accessing color paths like 'background.primary'
export type ColorToken =
    | `background.${keyof typeof colors.background}`
    | `text.${keyof typeof colors.text}`
    | `button.${keyof typeof colors.button}`
    | `accent.${keyof typeof colors.accent}`
    | `border.${keyof typeof colors.border}`;
