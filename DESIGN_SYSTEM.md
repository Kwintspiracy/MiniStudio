# MiniStudio Design System

> **Version:** 1.1.0 **Platform:** React Native (iOS/Android) with Expo **Last
> Updated:** January 12, 2026

This document is the single source of truth for all UI/UX patterns in
MiniStudio. Use it to align MiniPainterDB and any other companion apps to the
MiniStudio aesthetic.

---

## 1. Color System

### Background Colors

| Token                  | Hex       | Usage                                            |
| ---------------------- | --------- | ------------------------------------------------ |
| `background.primary`   | `#2D2F39` | Main screen backgrounds (Lightened from #12141C) |
| `background.secondary` | `#1F2128` | Headers, footers, navigation bars                |
| `background.tertiary`  | `#474A5D` | Input containers, option buttons                 |
| `background.bottom`    | `red`     | Footer areas (Debug/Placeholder currently)       |

### Text Colors

| Token              | Hex       | Usage                                               |
| ------------------ | --------- | --------------------------------------------------- |
| `text.primary`     | `#EFEFF1` | Primary text, headings, button labels               |
| `text.secondary`   | `#7E808B` | Subtitles, placeholders, secondary info             |
| `text.dark`        | `#1D1D1D` | Text on light buttons (Google Sign-In, active tabs) |
| `text.textfieldbg` | `#16171D` | Background for text inputs                          |
| `text.red`         | `#C4002B` | Error text                                          |

### Button Colors

| Token              | Hex       | Usage                                  |
| ------------------ | --------- | -------------------------------------- |
| `button.primary`   | `#2C59FF` | Primary CTAs (Create, Sign In)         |
| `button.danger`    | `#FA0439` | Destructive actions (Delete, Sign Out) |
| `button.secondary` | `#2C2F3A` | Secondary/ghost buttons                |
| `button.dark`      | `#1D1D1D` | Dark buttons (Apple Sign-In)           |
| `button.white`     | `#F4F4F4` | Active state background for options    |

### Accent Colors

| Token           | Hex       | Usage                             |
| --------------- | --------- | --------------------------------- |
| `accent.blue`   | `#518CFF` | Links, action text, active states |
| `accent.red`    | `#FA0439` | Errors, warnings                  |
| `accent.purple` | `#BB51FF` | Special highlights                |
| `accent.yellow` | `#FFD60A` | Warnings, pro features            |

---

## 2. Typography

### Font Families

| Token                  | iOS Value        | Android Value |
| ---------------------- | ---------------- | ------------- |
| `fontFamily.primary`   | `SF Pro Display` | `System`      |
| `fontFamily.secondary` | `SF Pro`         | `System`      |

### Font Sizes

| Token  | Size | Usage                          |
| ------ | ---- | ------------------------------ |
| `xs`   | 13px | Captions, links, labels        |
| `sm`   | 14px | Body text, button text, inputs |
| `base` | 16px | Subheadings, regular UI text   |
| `lg`   | 18px | Modal titles                   |
| `xl`   | 20px | Large titles                   |
| `3xl`  | 32px | Main headings                  |

---

## 3. UI Components

### Unified Option Button

Used for "Design Step" tabs, "Choose Style" grid, and "Color Palette Brands".

**Inactive State:**

```typescript
{
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    padding: 12,
    borderRadius: 4,
    backgroundColor: '#474A5D', // background.tertiary
}
// Text: #EFEFF1 (text.primary), Size 13, Weight 500
```

**Active State:**

```typescript
{
    backgroundColor: '#F4F4F4', // button.white
}
// Text: #1D1D1D (text.dark), Size 13, Weight 600
```

### Section Header Accent

Replaces icons in section headers (Design Step, Choose Style, etc.).

```typescript
const SectionAccent = () => (
  <View
    style={{
      width: 4,
      height: 16,
      backgroundColor: "#2C59FF", // button.primary
      borderRadius: 2,
    }}
  />
);
// Usage: Placed left of the Section Header Text
```

### User Profile Picture

Located in the top-right of the Studio screen header.

**Authenticated (with Avatar):**

```typescript
{
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#2C59FF', // button.primary
}
```

**Fallback / Guest:**

```typescript
<BiSolidUserCircle32Icon />; // Standard icon
```

### Toggle Switches

**Container:**

```typescript
{
    width: 46,
    height: 24,
    padding: 3,
    borderRadius: 12,
    justifyContent: 'center',
    backgroundColor: '#7E808B' // Off state (text.secondary)
    // On state: backgroundColor: '#F4F4F4'
}
```

**Circle:**

```typescript
{
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#1D1D1D', // Off state
    // On state: alignSelf: 'flex-end', backgroundColor: '#2C59FF'
}
```

---

## 4. Inputs

### Prompt Input (Multi-line)

```typescript
{
    backgroundColor: '#16171D', // text.textfieldbg
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 200,
    color: '#EFEFF1',
    textAlignVertical: 'top',
}
```

---

## 5. Navigation

### Top Navigation Bar

```typescript
{
    height: 64,
    backgroundColor: '#1F2128', // background.secondary
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
}
```

### Main Nav Tabs (DESIGN / PAINT)

```typescript
// Button
{
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 6,
    // Active: backgroundColor: '#2C59FF'
}
// Icon + Text (gap 8)
```

---

## 6. Modals

### Results Drawer (Page Sheet)

- **Grabber**: `rgba(255,255,255,0.2)`, 36x5px
- **Title**: 16px Bold, `#EFEFF1`
- **Actions**: "Select" / "Close" (Text buttons)

### History Grid

- **Item**: Aspect Ratio 1:1, Radius 8px
- **Selection Mode**: Overlay with checkmark circle (20px, `#2C59FF` filled when
  selected)

---
