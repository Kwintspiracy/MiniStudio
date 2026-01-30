# MiniStudio Design System

A comprehensive React Native design system documentation for ensuring visual
continuity across applications. This document covers colors, typography,
spacing, and standardized component structures for Headers, Footers, Drawers,
and Modals.

---

## 📁 File Structure

```
src/
├── theme/
│   ├── index.ts          # Unified export point
│   ├── colors.ts         # Color tokens
│   ├── typography.ts     # Font families, sizes, weights, text styles
│   └── spacing.ts        # Spacing, border radius, dimensions, shadows
└── design-system.json    # Static reference for tools/exports
```

**Usage:**

```tsx
import { borderRadius, colors, fontFamily, spacing, textStyles } from "@/theme";
```

---

## 🎨 Color System

### Background Colors

| Token                       | Hex                      | Usage                                   |
| --------------------------- | ------------------------ | --------------------------------------- |
| `background.primary`        | `#2C2F3A`                | Main app background (Studio)            |
| `background.secondary`      | `#1F2129`                | Headers, footers, navigation bars       |
| `background.tertiary`       | `#464B5D`                | Cards, toggles, secondary buttons       |
| `background.bottom`         | `#0F1014`                | Dark bottom areas                       |
| `background.highlight`      | `rgba(44, 89, 255, 0.1)` | Blue-tinted highlight for premium cards |
| `background.settings`       | `#1E1E2B`                | Settings screen containers              |
| `background.settingsFooter` | `#12121A`                | Settings footer background              |
| `background.modal`          | `#292936`                | Modal container background              |
| `background.panel`          | `#16181D`                | Studio footer panels                    |
| `background.card`           | `#2C3142`                | Gallery button backgrounds              |

### Text Colors

| Token              | Hex                        | Usage                         |
| ------------------ | -------------------------- | ----------------------------- |
| `text.primary`     | `#EFEFF1`                  | Primary text (headings, body) |
| `text.secondary`   | `#7E808B`                  | Secondary/muted text          |
| `text.muted`       | `rgba(244, 244, 244, 0.4)` | Placeholders, subdued text    |
| `text.dark`        | `#1D1D1D`                  | Text on light backgrounds     |
| `text.textfieldbg` | `#16171D`                  | Input field backgrounds       |
| `text.red`         | `#C4002B`                  | Error/warning text            |

### Button Colors

| Token               | Hex       | Usage                      |
| ------------------- | --------- | -------------------------- |
| `button.primary`    | `#2C59FF` | Primary action buttons     |
| `button.danger`     | `#FA0439` | Danger/destructive actions |
| `button.dangerDark` | `#91001F` | Sign out button            |
| `button.secondary`  | `#2C2F3A` | Secondary buttons          |
| `button.dark`       | `#1D1D1D` | Dark button backgrounds    |
| `button.white`      | `#F4F4F4` | Light/white buttons        |

### Accent Colors

| Token           | Hex       | Usage                  |
| --------------- | --------- | ---------------------- |
| `accent.blue`   | `#518CFF` | Links, navigation tint |
| `accent.red`    | `#FA0439` | Danger highlights      |
| `accent.purple` | `#BB51FF` | Premium features       |
| `accent.yellow` | `#FFD60A` | Warnings, highlights   |
| `accent.orange` | `#FF682C` | Pro mode indicators    |

### Overlay Colors

| Token            | Value                      | Usage                   |
| ---------------- | -------------------------- | ----------------------- |
| `overlay.soft`   | `rgba(255, 255, 255, 0.1)` | Light overlays on cards |
| `overlay.medium` | `rgba(255, 255, 255, 0.2)` | Grabber handles         |
| `overlay.dark`   | `rgba(0, 0, 0, 0.3)`       | Dark chip backgrounds   |
| `overlay.heavy`  | `rgba(0, 0, 0, 0.6)`       | Remove button overlays  |
| `overlay.modal`  | `rgba(0, 0, 0, 0.7)`       | Modal backdrop          |

### Border Colors

| Token           | Value                       | Usage             |
| --------------- | --------------------------- | ----------------- |
| `border.subtle` | `rgba(255, 255, 255, 0.05)` | Subtle borders    |
| `border.strong` | `#66666B`                   | Prominent borders |

---

## 🔤 Typography System

### Font Families

```tsx
export const fontFamily = {
    primary: Platform.OS === "ios" ? "SF Pro Display" : "Roboto",
    secondary: Platform.OS === "ios" ? "SF Pro" : "Roboto",
    text: Platform.OS === "ios" ? "SF Pro Text" : "Roboto",
};
```

### Font Sizes

| Token             | Size | Usage              |
| ----------------- | ---- | ------------------ |
| `fontSize.xs`     | 13px | Labels, captions   |
| `fontSize.sm`     | 14px | Body text, buttons |
| `fontSize.base`   | 16px | Standard body      |
| `fontSize.lg`     | 18px | Subheadings        |
| `fontSize.xl`     | 20px | Section titles     |
| `fontSize['2xl']` | 24px | Large headings     |
| `fontSize['3xl']` | 32px | Page headings      |

### Font Weights

| Token                 | Value | Usage           |
| --------------------- | ----- | --------------- |
| `fontWeight.light`    | '300' | Captions        |
| `fontWeight.normal`   | '400' | Body text       |
| `fontWeight.medium`   | '500' | Buttons         |
| `fontWeight.semibold` | '600' | Section headers |
| `fontWeight.bold`     | '700' | Headings        |

### Predefined Text Styles

```tsx
export const textStyles = {
    heading: {
        fontFamily: fontFamily.primary,
        fontWeight: "700",
        fontSize: 32,
        letterSpacing: -0.41,
        color: colors.button.white,
    },
    subheading: {
        fontFamily: fontFamily.primary,
        fontWeight: "400",
        fontSize: 16,
        letterSpacing: -0.26,
        color: colors.text.muted,
    },
    button: {
        fontFamily: fontFamily.primary,
        fontWeight: "600",
        fontSize: 14,
        letterSpacing: -0.41,
    },
    body: {
        fontFamily: fontFamily.primary,
        fontWeight: "400",
        fontSize: 14,
        color: colors.button.white,
    },
    caption: {
        fontFamily: fontFamily.secondary,
        fontWeight: "300",
        fontSize: 13,
        letterSpacing: -0.41,
        color: colors.button.white,
    },
    label: {
        fontFamily: fontFamily.primary,
        fontWeight: "700",
        fontSize: 12,
        letterSpacing: 0.5,
        color: colors.text.muted,
    },
};
```

---

## 📐 Spacing & Layout

### Spacing Scale

| Token            | Value | Usage                 |
| ---------------- | ----- | --------------------- |
| `spacing.xs`     | 4px   | Tight spacing         |
| `spacing.sm`     | 8px   | Small gaps            |
| `spacing.md`     | 10px  | Medium gaps           |
| `spacing.lg`     | 12px  | Standard gaps         |
| `spacing.xl`     | 16px  | Large gaps            |
| `spacing['2xl']` | 20px  | Section padding       |
| `spacing['3xl']` | 24px  | Container padding     |
| `spacing['4xl']` | 32px  | Header/footer padding |
| `spacing['5xl']` | 48px  | Major spacing         |

### Border Radius

| Token               | Value | Usage                   |
| ------------------- | ----- | ----------------------- |
| `borderRadius.sm`   | 4px   | Inputs, small buttons   |
| `borderRadius.md`   | 6px   | Standard buttons        |
| `borderRadius.lg`   | 8px   | Cards, containers       |
| `borderRadius.xl`   | 24px  | Modal buttons           |
| `borderRadius.full` | 32px  | Pills, avatars, drawers |

### Component Dimensions

```tsx
export const dimensions = {
    button: {
        height: 48, // Primary buttons
        heightSmall: 40, // Secondary buttons
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
};
```

---

## 🧩 Component Structures

### Header (Navigation Bar)

**Standard Header Style:**

```tsx
const headerStyles = {
    container: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        height: 64,
        backgroundColor: colors.background.secondary,
        paddingHorizontal: 16,
    },
    title: {
        fontFamily: fontFamily.primary,
        fontWeight: "600",
        fontSize: 17,
        color: colors.text.primary,
        textAlign: "center",
    },
    backButton: {
        color: colors.accent.blue,
        fontSize: 17,
    },
};
```

**Screen Navigation Header (Expo Router):**

```tsx
<Stack.Screen
    options={{
        headerShown: true,
        title: "Screen Title",
        contentStyle: { backgroundColor: "transparent" },
        headerStyle: { backgroundColor: colors.background.secondary },
        headerTintColor: colors.accent.blue,
        headerTitleStyle: {
            fontFamily: fontFamily.primary,
            fontWeight: "600",
            fontSize: 17,
            color: colors.text.primary,
        },
        headerShadowVisible: false,
    }}
/>;
```

---

### Footer Container

**Standardized Footer (Used in Studio, Settings, Paywall):**

```tsx
const footerStyles = {
    footerContainer: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: colors.background.secondary, // Or 'transparent' for overlays
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingHorizontal: 24,
        paddingTop: 12,
        // Dynamic paddingBottom with safe area:
        // paddingBottom: Math.max(insets.bottom + 16, 24)
    },
};
```

**Primary Footer Button:**

```tsx
const primaryButtonStyles = {
    button: {
        height: 52,
        backgroundColor: colors.button.primary, // or colors.button.white for inverse
        borderRadius: 26,
        justifyContent: "center",
        alignItems: "center",
    },
    buttonText: {
        color: colors.text.primary, // or colors.text.dark for white button
        fontSize: 15,
        fontWeight: "600",
        fontFamily: fontFamily.primary,
    },
};
```

---

### Drawer / Bottom Sheet

**Standard Drawer Structure:**

```tsx
const drawerStyles = {
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "flex-end",
    },
    drawer: {
        backgroundColor: colors.background.secondary,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingTop: 12,
        maxHeight: SCREEN_HEIGHT * 0.85,
        // paddingBottom: insets.bottom + 16
    },
    handleBar: {
        width: 36,
        height: 5,
        backgroundColor: colors.overlay.medium, // rgba(255, 255, 255, 0.2)
        borderRadius: 3,
        alignSelf: "center",
        marginBottom: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: "800",
        color: colors.text.primary,
        fontFamily: fontFamily.primary,
        textAlign: "center",
        marginBottom: 32,
        lineHeight: 32,
    },
    content: {
        paddingHorizontal: 24,
    },
};
```

**Drawer Header with Actions:**

```tsx
const drawerHeaderStyles = {
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingBottom: 16,
        paddingHorizontal: 24,
    },
    headerSide: {
        width: 80,
        justifyContent: "center",
    },
    headerTitle: {
        flex: 1,
        textAlign: "center",
        color: colors.text.primary,
        fontSize: 16,
        fontFamily: fontFamily.primary,
        fontWeight: "700",
        letterSpacing: -0.41,
    },
    actionButton: {
        color: colors.text.primary,
        fontSize: 16,
        fontFamily: fontFamily.primary,
        fontWeight: "600",
    },
};
```

---

### Modal Dialog

**Standard App Modal:**

```tsx
const modalStyles = {
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
    },
    container: {
        width: "100%",
        maxWidth: 345,
        backgroundColor: colors.background.modal, // #292936
        borderRadius: 32,
        padding: 24,
        gap: 24,
    },
    title: {
        fontFamily: fontFamily.primary,
        fontWeight: "700",
        fontSize: 20,
        color: colors.text.primary,
    },
    message: {
        fontFamily: fontFamily.primary,
        fontWeight: "400",
        fontSize: 16,
        color: colors.text.secondary,
        lineHeight: 21,
    },
    buttonContainer: {
        flexDirection: "row",
        gap: 8,
    },
    primaryButton: {
        flex: 1,
        height: 52,
        backgroundColor: colors.button.primary, // Dynamic based on type
        borderRadius: 24,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 12,
    },
    secondaryButton: {
        flex: 1,
        height: 52,
        backgroundColor: colors.button.secondary, // #2C2F3A
        borderRadius: 24,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 12,
    },
    buttonText: {
        fontFamily: fontFamily.primary,
        fontWeight: "500",
        fontSize: 16,
        color: colors.text.primary,
    },
};
```

**Modal Button Colors by Type:**

| Type       | Primary Button Color              |
| ---------- | --------------------------------- |
| `default`  | `colors.button.primary` (#2C59FF) |
| `error`    | `colors.button.danger` (#FA0439)  |
| `critical` | `colors.button.danger` (#FA0439)  |

---

### Cards

**Selectable Card (e.g., Plan Cards):**

```tsx
const cardStyles = {
    card: {
        backgroundColor: colors.background.tertiary, // #464B5D
        borderRadius: 21,
        borderWidth: 2,
        borderColor: colors.background.tertiary,
        paddingHorizontal: 16,
        paddingVertical: 24,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    cardSelected: {
        borderColor: colors.button.primary, // #2C59FF
    },
};
```

**Badge on Card:**

```tsx
const badgeStyles = {
    badge: {
        position: "absolute",
        top: -12,
        left: 16,
        backgroundColor: "#4ADE80", // Success green
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    badgeText: {
        color: colors.text.dark,
        fontSize: 13,
        fontWeight: "700",
        fontFamily: fontFamily.primary,
    },
};
```

---

### Grabber Handle

Consistent across all drawers and form sheets:

```tsx
const grabberStyles = {
    container: {
        width: "100%",
        height: 24,
        alignItems: "center",
        justifyContent: "center",
    },
    grabber: {
        width: 36,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: "rgba(255, 255, 255, 0.2)",
    },
};
```

---

## 🔧 Import Reference

```tsx
// Full import
import {
    borderRadius,
    colors,
    dimensions,
    fontFamily,
    fontSize,
    fontWeight,
    shadows,
    spacing,
    textStyles,
} from "@/theme";

// Or unified theme object
import { theme } from "@/theme";
// Usage: theme.colors.button.primary

// For TypeScript type checking
import type { ColorToken } from "@/theme";
```

---

## ✅ Checklist for New Components

When creating new screens or components, ensure:

- [ ] **Backgrounds**: Use `colors.background.secondary` for headers/footers
- [ ] **Text Colors**: Use `colors.text.primary` for main content
- [ ] **Button Heights**: Primary = 52px, Secondary = 40px
- [ ] **Border Radius**: Drawers/footers = 32px, Buttons = 26px, Cards = 8-21px
- [ ] **Horizontal Padding**: Containers = 24px
- [ ] **Safe Area**: Footer paddingBottom = `Math.max(insets.bottom + 16, 24)`
- [ ] **Fonts**: Always use `fontFamily.primary` for consistency
- [ ] **Modal Overlay**: Use `rgba(0, 0, 0, 0.5-0.6)` for backdrop

---

_Last Updated: January 2026_ _Source: MiniStudio v1.0_
