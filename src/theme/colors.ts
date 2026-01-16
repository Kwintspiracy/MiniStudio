/**
 * MiniStudio Design System - Color Tokens
 * 
 * Single source of truth for all colors in the app.
 * Import this instead of hardcoding hex values.
 */

export const colors = {
    // Background colors
    background: {
        primary: '#2C2F3A',   // Restored original Studio BG
        secondary: '#1F2129', // Restored original Secondary
        tertiary: '#464B5D',  // Restored original Tertiary
        bottom: '#0F1014',
        highlight: 'rgba(44, 89, 255, 0.1)', // Blue tinted highlight (paywall cards)
        
        // Preserved Legacy Colors
        settings: '#1E1E2B',  // Settings Container
        settingsFooter: '#12121A', // Settings Footer
        modal: '#292936',     // AppModal
        panel: '#16181D',     // Studio Footer
        card: '#2C3142',      // Gallery Button
    },

    // Text colors
    text: {
        primary: '#EFEFF1',   // Restored original text color
        secondary: '#7E808B', // Restored original secondary text
        muted: 'rgba(244, 244, 244, 0.4)', // Placeholder/subdued text
        dark: '#1D1D1D',
        textfieldbg: '#16171D', // Restored original input bg
        red: '#C4002B',         // Restored original red
    },

    // Button colors
    button: {
        primary: '#2C59FF',   // Restored original Blue
        danger: '#FA0439',
        dangerDark: '#91001F', // Restored original Sign Out Red
        secondary: '#2C2F3A', // Restored original secondary button
        dark: '#1D1D1D',
        white: '#F4F4F4',
    },

    // Accent colors
    accent: {
        blue: '#518CFF',
        red: '#FA0439',
        purple: '#BB51FF',
        yellow: '#FFD60A',
        orange: '#FF682C',
    },

    // Border colors
    border: {
        subtle: 'rgba(255, 255, 255, 0.05)',
        strong: '#66666B',
    },

    // Overlay colors (semi-transparent backgrounds)
    overlay: {
        soft: 'rgba(255, 255, 255, 0.1)',    // Light overlay for cards/tracks
        medium: 'rgba(255, 255, 255, 0.2)',  // Grabber handles
        dark: 'rgba(0, 0, 0, 0.3)',          // Dark chip backgrounds
        heavy: 'rgba(0, 0, 0, 0.6)',         // Remove buttons
        modal: 'rgba(0, 0, 0, 0.7)',         // Modal backdrops
    },

    // Pure Palette (Absolute Black/White)
    palette: {
        black: '#000000',
        white: '#FFFFFF',
    },

    // Social Brand Colors
    social: {
        googleBlue: '#4285F4',
        googleGreen: '#34A853',
        googleYellow: '#FBBC05',
        googleRed: '#EA4335',
    },

    // Admin Dashboard Palette (GitHub Dark Dimmed)
    admin: {
        background: '#0D1117',
        sidebar: '#161B22',
        card: '#161B22',
        border: '#30363D',
        text: '#F0F6FC',
        textSecondary: '#8B949E',
        textCode: '#C9D1D9',
        active: '#1F6FEB',
        success: '#238636',
        successText: '#3FB950',
        danger: '#DA3633',
        badgeBg: 'rgba(35, 134, 54, 0.2)',
    }
} as const;

// Type for accessing color paths like 'background.primary'
export type ColorToken =
    | `background.${keyof typeof colors.background}`
    | `text.${keyof typeof colors.text}`
    | `button.${keyof typeof colors.button}`
    | `accent.${keyof typeof colors.accent}`
    | `border.${keyof typeof colors.border}`
    | `overlay.${keyof typeof colors.overlay}`
    | `palette.${keyof typeof colors.palette}`
    | `social.${keyof typeof colors.social}`
    | `admin.${keyof typeof colors.admin}`;
