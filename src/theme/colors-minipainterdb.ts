/**
 * MiniPainterDB Design System - Color Tokens
 * 
 * IMPORTANT: This matches MiniStudio's design system exactly.
 * Single source of truth for all colors in the app.
 * Import this instead of hardcoding hex values.
 */

export const colors = {
  // Background colors
  background: {
    primary: '#2C2F3A',      // Main app background
    secondary: '#1F2129',    // Headers, footers, navigation bars
    tertiary: '#464B5D',     // Cards, toggles, secondary buttons
    bottom: '#0F1014',       // Dark bottom areas
    highlight: 'rgba(44, 89, 255, 0.1)', // Blue-tinted highlight
    settings: '#1E1E2B',     // Settings screen containers
    settingsFooter: '#12121A', // Settings footer background
    modal: '#292936',        // Modal container background
    panel: '#16181D',        // Footer panels
    card: '#2C3142',         // Card backgrounds
  },

  // Text colors
  text: {
    primary: '#EFEFF1',      // Primary text (headings, body)
    secondary: '#7E808B',    // Secondary/muted text
    muted: 'rgba(244, 244, 244, 0.4)', // Placeholders, subdued text
    dark: '#1D1D1D',         // Text on light backgrounds
    textfieldbg: '#16171D',  // Input field backgrounds
    red: '#C4002B',          // Error/warning text
  },

  // Button colors
  button: {
    primary: '#2C59FF',      // Primary action buttons
    danger: '#FA0439',       // Danger/destructive actions
    dangerDark: '#91001F',   // Sign out button
    secondary: '#2C2F3A',    // Secondary buttons
    dark: '#1D1D1D',         // Dark button backgrounds
    white: '#F4F4F4',        // Light/white buttons
  },

  // Accent colors
  accent: {
    blue: '#518CFF',         // Links, navigation tint
    red: '#FA0439',          // Danger highlights
    purple: '#BB51FF',       // Premium features
    yellow: '#FFD60A',       // Warnings, highlights
    orange: '#FF682C',       // Pro mode indicators
  },

  // Border colors
  border: {
    subtle: 'rgba(255, 255, 255, 0.05)', // Subtle borders
    strong: '#66666B',       // Prominent borders
  },

  // Overlay colors (semi-transparent backgrounds)
  overlay: {
    soft: 'rgba(255, 255, 255, 0.1)',    // Light overlays on cards
    medium: 'rgba(255, 255, 255, 0.2)',  // Grabber handles
    dark: 'rgba(0, 0, 0, 0.3)',          // Dark chip backgrounds
    heavy: 'rgba(0, 0, 0, 0.6)',         // Remove button overlays
    modal: 'rgba(0, 0, 0, 0.7)',         // Modal backdrop
  },

  // Pure Palette (Absolute Black/White)
  palette: {
    black: '#000000',
    white: '#FFFFFF',
  },

  // Social Brand Colors (for OAuth buttons)
  social: {
    googleBlue: '#4285F4',
    googleGreen: '#34A853',
    googleYellow: '#FBBC05',
    googleRed: '#EA4335',
  },
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
  | `social.${keyof typeof colors.social}`;
