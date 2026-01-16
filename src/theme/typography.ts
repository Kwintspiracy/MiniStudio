/**
 * MiniStudio Design System - Typography Tokens
 * 
 * Font families, sizes, weights, and predefined text styles.
 */
import { Platform, TextStyle } from 'react-native';
import { colors } from './colors';

// Font families with platform fallbacks
export const fontFamily = {
    primary: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto',
    secondary: Platform.OS === 'ios' ? 'SF Pro' : 'Roboto',
    text: Platform.OS === 'ios' ? 'SF Pro Text' : 'Roboto',
} as const;

// Font sizes in pixels
export const fontSize = {
    xs: 13,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 32,
} as const;

// Font weights
export const fontWeight = {
    light: '300' as TextStyle['fontWeight'],
    normal: '400' as TextStyle['fontWeight'],
    medium: '500' as TextStyle['fontWeight'],
    semibold: '600' as TextStyle['fontWeight'],
    bold: '700' as TextStyle['fontWeight'],
} as const;

// Letter spacing
export const letterSpacing = {
    tight: -0.41,
    normal: -0.29,
    wide: -0.26,
} as const;

// Predefined text styles matching design system
export const textStyles = {
    heading: {
        fontFamily: fontFamily.primary,
        fontWeight: fontWeight.bold,
        fontSize: fontSize['3xl'],
        letterSpacing: letterSpacing.tight,
        color: colors.button.white,
    } as TextStyle,

    subheading: {
        fontFamily: fontFamily.primary,
        fontWeight: fontWeight.normal,
        fontSize: fontSize.base,
        letterSpacing: letterSpacing.wide,
        color: colors.text.muted,
    } as TextStyle,

    button: {
        fontFamily: fontFamily.primary,
        fontWeight: fontWeight.semibold,
        fontSize: fontSize.sm,
        letterSpacing: letterSpacing.tight,
    } as TextStyle,

    buttonSecondary: {
        fontFamily: fontFamily.primary,
        fontWeight: fontWeight.semibold,
        fontSize: fontSize.sm,
        letterSpacing: letterSpacing.normal,
    } as TextStyle,

    input: {
        fontFamily: fontFamily.primary,
        fontWeight: fontWeight.normal,
        fontSize: fontSize.sm,
        letterSpacing: letterSpacing.normal,
    } as TextStyle,

    label: {
        fontFamily: fontFamily.primary,
        fontWeight: fontWeight.bold,
        fontSize: 12,
        letterSpacing: 0.5,
        color: colors.text.muted,
    } as TextStyle,

    body: {
        fontFamily: fontFamily.primary,
        fontWeight: fontWeight.normal,
        fontSize: fontSize.sm,
        color: colors.button.white,
    } as TextStyle,

    caption: {
        fontFamily: fontFamily.secondary,
        fontWeight: fontWeight.light,
        fontSize: fontSize.xs,
        letterSpacing: letterSpacing.tight,
        color: colors.button.white,
    } as TextStyle,
} as const;
