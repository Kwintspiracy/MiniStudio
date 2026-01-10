/**
 * MiniStudio Design System - Color Tokens
 * 
 * Single source of truth for all colors in the app.
 * Import this instead of hardcoding hex values.
 */

export const colors = {
    // Background colors
    background: {
        primary: '#1E1E2B',
        secondary: '#12121F',
        tertiary: 'rgba(255, 255, 255, 0.05)',
        bottom: 'rgba(255, 255, 255, 0.05)',
    },

    // Text colors
    text: {
        primary: '#F4F4F4',
        secondary: 'rgba(244, 244, 244, 0.4)',
        dark: '#1D1D1D',
    },

    // Button colors
    button: {
        primary: '#0058DB',
        danger: '#FA0439',
        secondary: 'rgba(255, 255, 255, 0.05)',
        dark: 'rgba(0, 0, 0, 0.3)',
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
    },
} as const;

// Type for accessing color paths like 'background.primary'
export type ColorToken =
    | `background.${keyof typeof colors.background}`
    | `text.${keyof typeof colors.text}`
    | `button.${keyof typeof colors.button}`
    | `accent.${keyof typeof colors.accent}`
    | `border.${keyof typeof colors.border}`;
