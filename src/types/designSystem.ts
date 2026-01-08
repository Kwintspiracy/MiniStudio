/**
 * MiniStudio Design System Types
 * Auto-generated from Figma design: minipainter (signing-screen)
 */

export interface DesignSystemColors {
  background: {
    primary: string;
    secondary: string;
    tertiary: string;
    bottom: string;
  };
  text: {
    primary: string;
    secondary: string;
    dark: string;
  };
  button: {
    primary: string;
    danger: string;
    secondary: string;
    dark: string;
    white: string;
  };
  accent: {
    blue: string;
    red: string;
  };
  border: {
    subtle: string;
  };
}

export interface TypographyStyle {
  fontFamily: string;
  fontWeight: string;
  fontSize: number;
  letterSpacing: string;
}

export interface DesignSystemTypography {
  fontFamily: {
    primary: string;
    secondary: string;
    system: string;
  };
  fontSize: {
    xs: number;
    sm: number;
    base: number;
    lg: number;
    xl: number;
    '2xl': number;
    '3xl': number;
  };
  fontWeight: {
    light: string;
    normal: string;
    medium: string;
    semibold: string;
    bold: string;
  };
  lineHeight: {
    tight: number;
    normal: number;
    relaxed: number;
  };
  letterSpacing: {
    tight: string;
    normal: string;
    wide: string;
    wider: string;
    widest: string;
  };
  styles: {
    heading: TypographyStyle;
    subheading: TypographyStyle;
    button: TypographyStyle;
    buttonSecondary: TypographyStyle;
    buttonTertiary: TypographyStyle;
    input: TypographyStyle;
    link: TypographyStyle;
    callout: TypographyStyle;
  };
}

export interface DesignSystemSpacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  '2xl': number;
  '3xl': number;
  '4xl': number;
  '5xl': number;
}

export interface DesignSystemBorderRadius {
  sm: number;
  md: number;
  lg: number;
  xl: number;
  full: number;
}

export interface ButtonComponentStyle {
  backgroundColor: string;
  textColor: string;
  borderRadius: number;
  paddingVertical?: number;
  paddingHorizontal?: number;
  height: number;
}

export interface InputComponentStyle {
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  paddingVertical: number;
  paddingHorizontal: number;
  height: number;
}

export interface DesignSystemComponents {
  button: {
    primary: ButtonComponentStyle;
    secondary: ButtonComponentStyle;
    danger: ButtonComponentStyle;
    outline: ButtonComponentStyle;
    google: ButtonComponentStyle;
    apple: ButtonComponentStyle;
  };
  input: InputComponentStyle;
  card: {
    backgroundColor: string;
    borderRadius: number;
  };
  statusBar: {
    height: number;
    blurRadius: number;
  };
}

export interface DesignSystem {
  name: string;
  version: string;
  colors: DesignSystemColors;
  typography: DesignSystemTypography;
  spacing: DesignSystemSpacing;
  borderRadius: DesignSystemBorderRadius;
  shadows: {
    blur: {
      backdrop: string;
    };
  };
  components: DesignSystemComponents;
  layout: {
    screen: {
      width: number;
      height: number;
    };
    contentPadding: {
      horizontal: number;
      vertical: number;
    };
    formBackground: {
      marginTop: number;
      width: number;
      height: number;
    };
  };
}

// Design System Color Constants (for use in StyleSheet)
export const Colors = {
  background: {
    primary: '#1E1E2B',
    secondary: '#12121F',
    tertiary: 'rgba(255, 255, 255, 0.05)',
    bottom: 'rgba(255, 255, 255, 0.05)',
  },
  text: {
    primary: '#F4F4F4',
    secondary: 'rgba(244, 244, 244, 0.4)',
    dark: '#1D1D1D',
  },
  button: {
    primary: '#0058DB',
    danger: '#FA0439',
    secondary: 'rgba(255, 255, 255, 0.05)',
    dark: 'rgba(0, 0, 0, 0.3)',
    white: '#F4F4F4',
  },
  accent: {
    blue: '#518CFF',
    red: '#FA0439',
  },
  border: {
    subtle: 'rgba(255, 255, 255, 0.05)',
  },
} as const;

// Design System Spacing Constants
export const Spacing = {
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

// Design System Border Radius Constants
export const BorderRadius = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 24,
  full: 32,
} as const;

// Design System Font Sizes
export const FontSize = {
  xs: 13,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
} as const;
