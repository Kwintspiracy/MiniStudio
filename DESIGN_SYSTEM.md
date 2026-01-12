# MiniStudio Design System

> **Version:** 1.0.0\
> **Platform:** React Native (iOS/Android) with Expo\
> **Last Updated:** January 2025

This document is the single source of truth for all UI/UX patterns in
MiniStudio. Use it to align MiniPainterDB and any other companion apps to the
MiniStudio aesthetic.

---

## Table of Contents

1. [Color System](#1-color-system)
2. [Typography](#2-typography)
3. [Spacing & Layout](#3-spacing--layout)
4. [Border Radius](#4-border-radius)
5. [Shadows](#5-shadows)
6. [Buttons](#6-buttons)
7. [Form Inputs](#7-form-inputs)
8. [Toggle Switches](#8-toggle-switches)
9. [Tabs & Navigation](#9-tabs--navigation)
10. [Modals & Overlays](#10-modals--overlays)
11. [Cards](#11-cards)
12. [Icons](#12-icons)
13. [Loading States](#13-loading-states)
14. [Navigation System](#14-navigation-system)
15. [Screen Layouts](#15-screen-layouts)
16. [Accessibility](#16-accessibility)

---

## 1. Color System

### Background Colors

| Token                  | Hex       | Usage                             |
| ---------------------- | --------- | --------------------------------- |
| `background.primary`   | `#12141C` | Main screen backgrounds           |
| `background.secondary` | `#0B0C0E` | Headers, footers, navigation bars |
| `background.tertiary`  | `#202332` | Input containers, subtle sections |
| `background.bottom`    | `#0B0C0E` | Footer areas                      |

### Text Colors

| Token            | Hex       | Usage                                               |
| ---------------- | --------- | --------------------------------------------------- |
| `text.primary`   | `#F4F4F4` | Primary text, headings, button labels               |
| `text.secondary` | `#ACACAC` | Subtitles, placeholders, secondary info             |
| `text.dark`      | `#1D1D1D` | Text on light buttons (Google Sign-In, active tabs) |

### Button Colors

| Token              | Hex                         | Usage                                             |
| ------------------ | --------------------------- | ------------------------------------------------- |
| `button.primary`   | `#1645FF`                   | Primary CTAs (Create, Sign In)                    |
| `button.danger`    | `#FA0439`                   | Destructive actions (Delete, Sign Out)            |
| `button.secondary` | `rgba(255, 255, 255, 0.05)` | Secondary/ghost buttons                           |
| `button.dark`      | `#0B0C0E`                   | Dark buttons (Apple Sign-In, Create Account)      |
| `button.white`     | `#F4F4F4`                   | White buttons (Google Sign-In, active selections) |

### Accent Colors

| Token           | Hex       | Usage                               |
| --------------- | --------- | ----------------------------------- |
| `accent.blue`   | `#518CFF` | Links, action text, active states   |
| `accent.red`    | `#FA0439` | Errors, warnings, destructive hints |
| `accent.purple` | `#BB51FF` | Special highlights (optional)       |
| `accent.yellow` | `#FFD60A` | Warnings, pro features              |

### Border Colors

| Token           | Value                       | Usage                              |
| --------------- | --------------------------- | ---------------------------------- |
| `border.subtle` | `rgba(255, 255, 255, 0.05)` | Input borders, dividers            |
| `border.strong` | `#66666B`                   | Dashed borders, prominent outlines |

### Semantic Colors

| Purpose        | Color                    |
| -------------- | ------------------------ |
| Error messages | `#FA0439`                |
| Success states | `#34A853` (Google green) |
| Warning        | `#FFD60A`                |
| Info           | `#518CFF`                |

---

## 2. Typography

### Font Families

| Token                  | iOS Value        | Android Value |
| ---------------------- | ---------------- | ------------- |
| `fontFamily.primary`   | `SF Pro Display` | `System`      |
| `fontFamily.secondary` | `SF Pro`         | `System`      |
| `fontFamily.text`      | `SF Pro Text`    | `System`      |

### Font Sizes

| Token  | Size | Usage                          |
| ------ | ---- | ------------------------------ |
| `xs`   | 13px | Captions, links, labels        |
| `sm`   | 14px | Body text, button text, inputs |
| `base` | 16px | Subheadings, regular UI text   |
| `lg`   | 18px | Modal titles, emphasized text  |
| `xl`   | 20px | Large titles                   |
| `2xl`  | 24px | Section headings               |
| `3xl`  | 32px | Main headings (Sign in, etc.)  |

### Font Weights

| Token      | Value | Usage                           |
| ---------- | ----- | ------------------------------- |
| `light`    | 300   | Links, captions                 |
| `normal`   | 400   | Body text, inputs               |
| `medium`   | 500   | Buttons, labels                 |
| `semibold` | 600   | Subheadings, emphasized buttons |
| `bold`     | 700   | Headings, section titles        |

### Letter Spacing

| Token    | Value   | Usage               |
| -------- | ------- | ------------------- |
| `tight`  | -0.41px | Most UI text        |
| `normal` | -0.29px | Body text           |
| `wide`   | -0.26px | Labels, subheadings |

### Predefined Text Styles

```typescript
// Heading (32px, Bold)
heading: {
    fontFamily: 'SF Pro Display',
    fontWeight: '700',
    fontSize: 32,
    letterSpacing: -0.41,
    color: '#F4F4F4',
}

// Subheading (16px, Normal)
subheading: {
    fontFamily: 'SF Pro Display',
    fontWeight: '400',
    fontSize: 16,
    letterSpacing: -0.26,
    color: 'rgba(244, 244, 244, 0.4)',
}

// Button Text (14px, Semibold)
button: {
    fontFamily: 'SF Pro Display',
    fontWeight: '600',
    fontSize: 14,
    letterSpacing: -0.41,
}

// Label (12px, Bold, Uppercase-style)
label: {
    fontFamily: 'SF Pro Display',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.5,
    color: 'rgba(244, 244, 244, 0.4)',
}

// Body (14px, Normal)
body: {
    fontFamily: 'SF Pro Display',
    fontWeight: '400',
    fontSize: 14,
    color: '#F4F4F4',
}

// Caption (13px, Light)
caption: {
    fontFamily: 'SF Pro',
    fontWeight: '300',
    fontSize: 13,
    letterSpacing: -0.41,
    color: '#F4F4F4',
}
```

---

## 3. Spacing & Layout

### Spacing Scale

| Token | Value | Usage                               |
| ----- | ----- | ----------------------------------- |
| `xs`  | 4px   | Tight gaps                          |
| `sm`  | 8px   | Small gaps between related items    |
| `md`  | 10px  | Input padding                       |
| `lg`  | 12px  | Button padding, card padding        |
| `xl`  | 16px  | Section padding, horizontal padding |
| `2xl` | 20px  | Large gaps                          |
| `3xl` | 24px  | Modal padding, major sections       |
| `4xl` | 32px  | Footer top padding                  |
| `5xl` | 48px  | Major vertical spacing              |

### Layout Patterns

| Element          | Horizontal Padding | Vertical Padding      |
| ---------------- | ------------------ | --------------------- |
| Screen content   | 16px               | varies                |
| Auth screens     | 40px               | varies                |
| Modal content    | 24px               | 24px                  |
| Footer container | 16px               | 32px top, 50px bottom |
| Nav tabs         | 16px               | 8px                   |

---

## 4. Border Radius

| Token  | Value | Usage                              |
| ------ | ----- | ---------------------------------- |
| `sm`   | 4px   | Small chips, tags, subtle buttons  |
| `md`   | 6px   | Primary buttons, inputs            |
| `lg`   | 8px   | Cards, containers, prompt areas    |
| `xl`   | 24px  | Large rounded buttons, CTA buttons |
| `full` | 32px  | Pill-shaped buttons, fully rounded |

### Common Patterns

```typescript
// Primary buttons (Sign In, Create)
borderRadius: 6; // md

// CTA buttons in footer (Create, Gallery)
borderRadius: 24; // xl

// Cards and containers
borderRadius: 8; // lg

// Modal containers
borderRadius: 32; // full

// Chips and tags
borderRadius: 4; // sm
```

---

## 5. Shadows

### Footer Shadow

```typescript
{
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 20,  // Android
}
```

### Modal Overlay

```typescript
backgroundColor: "rgba(0, 0, 0, 0.6)";
```

### Loading Overlay

```typescript
backgroundColor: "rgba(0, 0, 0, 0.7)";
```

---

## 6. Buttons

### Primary Button

```typescript
{
    height: 48,
    backgroundColor: '#1645FF',  // button.primary
    borderRadius: 6,
    paddingVertical: 16,
    paddingHorizontal: 12,
    // Text
    color: '#F4F4F4',
    fontWeight: '600',
    fontSize: 14,
}
```

### Secondary Button (Outline/Ghost)

```typescript
{
    height: 48,
    backgroundColor: '#0B0C0E',  // button.dark
    borderRadius: 6,
    paddingVertical: 16,
    paddingHorizontal: 12,
    // Text
    color: '#F4F4F4',
    fontWeight: '500',
    fontSize: 14,
}
```

### Footer CTA Button (Pill)

```typescript
{
    height: 52,
    backgroundColor: '#1645FF',  // button.primary
    borderRadius: 24,
    // Content: icon + text with gap: 5
    // Text
    color: '#F4F4F4',
    fontWeight: '500',
    fontSize: 16,
}
```

### Gallery Button (Outline Pill)

```typescript
{
    height: 52,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#66666B',  // border.strong
    borderRadius: 24,
    // Text
    color: '#ACACAC',  // text.secondary
    fontWeight: '500',
    fontSize: 16,
}
```

### Danger Button

```typescript
{
    height: 52,
    backgroundColor: '#91001F',  // darker danger
    borderRadius: 24,
    // Text
    color: '#F4F4F4',
    fontWeight: '500',
    fontSize: 16,
}
```

### Google Sign-In Button

```typescript
{
    backgroundColor: '#F4F4F4',
    borderRadius: 6,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    // Text
    color: '#1D1D1D',
    fontWeight: '600',
    fontSize: 14,
}
```

### Apple Sign-In Button

```typescript
{
    backgroundColor: '#0B0C0E',
    borderRadius: 6,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    // Text
    color: '#F4F4F4',
    fontWeight: '600',
    fontSize: 14,
}
```

### Disabled State

```typescript
{
    opacity: 0.5,
}
```

### Button Icon Sizing

- Standard icons: 16px
- Small icons: 15px (Google icon)
- Buttons with icons use `flexDirection: 'row'` and `gap: 4-8`

---

## 7. Form Inputs

### Text Input

```typescript
{
    height: 48,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.05)',  // border.subtle
    borderRadius: 6,
    paddingVertical: 16,
    paddingHorizontal: 12,
    // Text
    color: 'rgba(244, 244, 244, 0.4)',  // when typing: #F4F4F4
    fontSize: 14,
    fontWeight: '400',
}
```

### Placeholder Style

```typescript
{
    color: '#ACACAC',  // text.secondary
}
```

### Multi-line Text Input (Prompt)

```typescript
{
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 200,
    // Text
    color: '#F4F4F4',
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'top',
}
```

### Input with Dashed Border (Source Container)

```typescript
{
    backgroundColor: '#202332',  // background.tertiary
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#66666B',
    borderStyle: 'dashed',
    paddingVertical: 8,
    paddingHorizontal: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
}
```

---

## 8. Toggle Switches

### Container

```typescript
{
    width: 46,
    height: 24,
    padding: 3,
    borderRadius: 12,
    justifyContent: 'center',
}
```

### States

```typescript
// OFF State
{
    backgroundColor: '#ACACAC',  // text.secondary
    // Circle positioned: alignSelf: 'flex-start'
}

// ON State
{
    backgroundColor: '#F4F4F4',  // button.white
    // Circle positioned: alignSelf: 'flex-end'
}
```

### Toggle Circle

```typescript
{
    width: 18,
    height: 18,
    borderRadius: 9,
}

// Inactive circle
backgroundColor: '#1D1D1D'  // text.dark

// Active circle
backgroundColor: '#1645FF'  // button.primary
```

---

## 9. Tabs & Navigation

### Main Navigation Tab Bar

```typescript
// Container
{
    flexDirection: 'row',
    alignSelf: 'stretch',
    backgroundColor: '#0B0C0E',  // background.secondary
    paddingHorizontal: 16,
    paddingVertical: 8,
}

// Tab Button
{
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 6,
}

// Active Tab
backgroundColor: '#1645FF'  // button.primary

// Tab Text
{
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 4,
}
// Active: color: '#F4F4F4'
// Inactive: color: '#ACACAC'
```

### Concept/Sub-Navigation Tabs

```typescript
// Container
{
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
}

// Tab Button
{
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    borderRadius: 8,
    height: 40,
}

// Inactive
backgroundColor: 'rgba(0, 0, 0, 0.3)'
color: '#F4F4F4'

// Active
backgroundColor: '#F4F4F4'
color: '#1D1D1D'
```

### Style Selection Grid (Pills)

```typescript
// Grid Container
{
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
}

// Style Button
{
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    borderRadius: 4,
}

// Inactive
backgroundColor: 'rgba(0, 0, 0, 0.3)'
color: '#F4F4F4'
fontWeight: '500'

// Active
backgroundColor: '#F4F4F4'
color: '#1D1D1D'
fontWeight: '600'
```

---

## 10. Modals & Overlays

### Page Sheet Modal (Results Drawer)

```typescript
// Container
{
    flex: 1,
    backgroundColor: '#0B0C0E',  // background.secondary
}

// Grabber Container
{
    width: '100%',
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
}

// Grabber Handle
{
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
}

// Modal Header
{
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
}

// Modal Title
{
    flex: 1,
    textAlign: 'center',
    color: '#F4F4F4',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.41,
}

// Header Action Text (Done/Close)
{
    color: '#1645FF',
    fontSize: 16,
    fontWeight: '600',
}
```

### Alert/Dialog Modal

```typescript
// Overlay
{
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 24,
}

// Container
{
    width: '100%',
    maxWidth: 345,
    backgroundColor: '#292936',
    borderRadius: 32,
    padding: 24,
    gap: 24,
}

// Title
{
    fontWeight: '700',
    fontSize: 18,
    color: '#F4F4F4',
}

// Message
{
    fontWeight: '400',
    fontSize: 12,
    color: '#B6B6B6',
    lineHeight: 16,
}

// Button Container
{
    flexDirection: 'row',
    gap: 8,
}

// Modal Buttons
{
    flex: 1,
    height: 52,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
}

// Primary Button: backgroundColor from type (blue/red)
// Secondary Button: backgroundColor: '#777777'
```

### Modal Types

| Type       | Primary Button Color |
| ---------- | -------------------- |
| `default`  | `#0058DB`            |
| `error`    | `#FA0439`            |
| `critical` | `#FA0439`            |

---

## 11. Cards

### Profile Card

```typescript
{
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 16,
}
```

### Option Item Row

```typescript
{
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
}
```

### Color Chip

```typescript
{
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 4,
}

// Color Circle
{
    width: 16,
    height: 16,
    borderRadius: 8,
}
```

### History Grid Item

```typescript
{
    width: '23.5%',  // ~4 columns with gap
    aspectRatio: 1,
    minWidth: 82,
    minHeight: 82,
    borderRadius: 8,
    overflow: 'hidden',
}

// Active/Selected state
{
    borderWidth: 2,
    borderColor: '#1645FF',
}
```

---

## 12. Icons

### Icon Sizes

| Context           | Size |
| ----------------- | ---- |
| Tab icons         | 16px |
| Button icons      | 16px |
| Navigation icons  | 24px |
| User avatar icons | 32px |
| Large icons       | 48px |

### Icon Color Patterns

| State                      | Color                                         |
| -------------------------- | --------------------------------------------- |
| Default (light background) | `#1D1D1D`                                     |
| Default (dark background)  | `#F4F4F4`                                     |
| Inactive                   | `#ACACAC` / `rgba(244, 244, 244, 0.4)`        |
| Active                     | `#F4F4F4` (on primary) / `#1D1D1D` (on white) |
| Accent actions             | `#518CFF`                                     |
| Destructive                | `#FA0439`                                     |

### Icon Library (SVG-based)

Core icons include:

- Navigation: `DrawIcon`, `PaintIcon`, `SculptIcon`, `CameraLensIcon`
- Actions: `MagicWandIcon`, `ShareIcon`, `DownloadIcon`, `RefreshIcon`
- UI: `CheckIcon`, `CloseIcon`, `PlusIcon`, `XMarkIcon`
- Media: `PhotoCameraIcon`, `PhotoLibraryIcon`, `UploadIcon`
- User: `BiSolidUserCircleIcon`, `BiSolidUserCircle32Icon`
- State: `SpinnerIcon` (animated), `TbProgressCheckIcon`

---

## 13. Loading States

### Loading Overlay

```typescript
{
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
}

// Spinner size: 48px
// Animation: continuous rotation, 1000ms duration, linear easing
```

### Inline Spinner

- Size: 16px for buttons
- Color: Same as button text (`#F4F4F4`)
- Animation: Continuous rotation

### Activity Indicator

```typescript
<ActivityIndicator size="large" color="#1645FF" />;
```

---

## 14. Navigation System

### Stack Navigation

```typescript
// Stack Options
{
    headerShown: false,
    contentStyle: { backgroundColor: '#12141C' },
    animation: 'slide_from_right',
}
```

### Modal Presentation

```typescript
// Camera screen
{
    presentation: 'fullScreenModal',
    animation: 'slide_from_bottom',
}

// Page Sheet Modal (Results Drawer)
{
    animationType: 'slide',
    presentationStyle: 'pageSheet',
}
```

### Header Configuration (when shown)

```typescript
{
    headerStyle: { backgroundColor: '#1E1E2B' },
    headerTintColor: '#0A84FF',
    headerTitleStyle: {
        fontFamily: 'SF Pro Text',
        fontWeight: '600',
        fontSize: 17,
        color: '#fff',
    },
    headerShadowVisible: false,
}
```

### Top Navigation Bar (Custom)

```typescript
{
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 64,
    backgroundColor: '#0B0C0E',
    paddingHorizontal: 0,
}

// Side containers: width: 91
// Title: centered, flex: 1
```

---

## 15. Screen Layouts

### Auth Screen (Sign In)

```
┌─────────────────────────────────────┐
│  Status Bar (light-content)          │
├─────────────────────────────────────┤
│  SafeAreaView                        │
│  ┌─────────────────────────────────┐ │
│  │  Main Content (flex: 1)          │ │
│  │  paddingHorizontal: 40           │ │
│  │  gap: 32                         │ │
│  │  ┌─────────────────────────────┐ │ │
│  │  │  Header Section              │ │ │
│  │  │  - Title (32px, bold)        │ │ │
│  │  │  - Subtitle (16px)           │ │ │
│  │  └─────────────────────────────┘ │ │
│  │  ┌─────────────────────────────┐ │ │
│  │  │  Form Section               │ │ │
│  │  │  - Email Input              │ │ │
│  │  │  - Password Input           │ │ │
│  │  │  - Sign In Button           │ │ │
│  │  │  - Alternatively Text       │ │ │
│  │  │  - Google Button            │ │ │
│  │  │  - Apple Button             │ │ │
│  │  └─────────────────────────────┘ │ │
│  └─────────────────────────────────┘ │
│  ┌─────────────────────────────────┐ │
│  │  Bottom Section                  │ │
│  │  padding: 24px 40px 40px         │ │
│  │  - Create Account Button         │ │
│  │  - Forgot Password Link          │ │
│  └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### Studio Screen

```
┌─────────────────────────────────────┐
│  Status Bar Background              │
├─────────────────────────────────────┤
│  Top Navigation                     │
│  [Pro Badge]  [App Title]  [User]   │
├─────────────────────────────────────┤
│  Main Nav Tabs                      │
│  [DESIGN] [PAINT]                   │
├─────────────────────────────────────┤
│  ScrollView                         │
│  ┌─────────────────────────────────┐│
│  │  Source Input Container         ││
│  │  [Thumbnail] [Photo] [Files]    ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │  Mode Content (conditional)     ││
│  │  - Sub-tabs / Style Grid        ││
│  │  - Prompt Input                 ││
│  │  - Options & Effects            ││
│  └─────────────────────────────────┘│
├─────────────────────────────────────┤
│  Footer (with shadow)               │
│  [Gallery]  [Create/Cancel]         │
└─────────────────────────────────────┘
```

### Settings Screen

```
┌─────────────────────────────────────┐
│  Native Header (headerShown: true)  │
│  "User Settings"                    │
├─────────────────────────────────────┤
│  ScrollView (pull-to-refresh)       │
│  ┌─────────────────────────────────┐│
│  │  Profile Card                   ││
│  │  [Avatar] [Name] [Email]        ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │  Usage Tracker Component        ││
│  └─────────────────────────────────┘│
├─────────────────────────────────────┤
│  Footer (with shadow)               │
│  [Sign Out Button - danger]         │
└─────────────────────────────────────┘
```

---

## 16. Accessibility

### Required Accessibility Props

Every interactive element should include:

```typescript
accessibilityLabel="Descriptive label"
accessibilityRole="button | link | image | text"
accessibilityHint="What happens when you activate this"
accessibilityState={{ disabled: boolean, selected: boolean }}
```

### Focus Order

- Logical top-to-bottom, left-to-right flow
- Form inputs should be navigable in sequence
- Modal focus traps within modal content

### Color Contrast

All text colors maintain WCAG AA compliance:

- Primary text `#F4F4F4` on `#12141C` = 13.5:1 ✓
- Secondary text `#ACACAC` on `#12141C` = 7.1:1 ✓
- Button text `#F4F4F4` on `#1645FF` = 4.9:1 ✓

### Touch Targets

- Minimum touch target: 44x44 points (per Apple HIG)
- Button height: 48-52px
- Toggle size: 46x24px (including padding)

---

## Quick Reference

### Common Style Patterns

```typescript
// Screen container
{ flex: 1, backgroundColor: colors.background.primary }

// Centered loading
{ flex: 1, justifyContent: 'center', alignItems: 'center' }

// Row with icons and text
{ flexDirection: 'row', alignItems: 'center', gap: 8 }

// Section header
{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, marginTop: 12 }

// Section header text
{ fontWeight: '600', fontSize: 13, color: colors.text.secondary }
```

### Import Pattern

```typescript
import { borderRadius, colors, fontFamily, spacing, textStyles } from "@/theme";
```

---

## File References

| Resource           | Path                                |
| ------------------ | ----------------------------------- |
| Color tokens       | `src/theme/colors.ts`               |
| Typography tokens  | `src/theme/typography.ts`           |
| Spacing tokens     | `src/theme/spacing.ts`              |
| Theme index        | `src/theme/index.ts`                |
| Icons              | `src/components/Icons.tsx`          |
| AppModal           | `src/components/AppModal.tsx`       |
| ModalHeader        | `src/components/ModalHeader.tsx`    |
| LoadingOverlay     | `src/components/LoadingOverlay.tsx` |
| Design System JSON | `src/design-system.json`            |

---

_This design system is maintained as part of the MiniStudio project. For
questions or updates, refer to the source files listed above._
