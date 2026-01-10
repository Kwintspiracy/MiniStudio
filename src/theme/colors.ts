/**
 * MiniStudio Design System - Color Tokens
 * 
 * Single source of truth for all colors in the app.
 * Import this instead of hardcoding hex values.
 */

export const colors = {
    // Background colors
    background: {
        primary: '#12141C',
        secondary: '#0B0C0E',
        tertiary: '#202332',
        bottom: '#0B0C0E',
    },

    // Text colors
    text: {
        primary: '#F4F4F4',
        secondary: '#ACACAC',
        dark: '#1D1D1D',
    },

    // Button colors
    button: {
        primary: '#1645FF',
        danger: '#FA0439',
        secondary: 'rgba(255, 255, 255, 0.05)',
        dark: '#0B0C0E',
        white: '#F4F4F4',
    },

    // Accent colors
    accent: {
        blue: '#518CFF',
        red: '#FA0439',
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
