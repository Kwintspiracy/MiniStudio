# Gallery Drawer Implementation Guide

This document details how the Gallery drawer is implemented in MiniStudio, for
reference when implementing similar drawer behavior in other apps.

## Overview

MiniStudio uses **two different drawer implementations**:

1. **Main Gallery Drawer** - React Native's native `Modal` component
2. **FTUE Gallery Drawer** - `@gorhom/bottom-sheet` for gesture-controlled
   partial sheets

---

## 1. Main Gallery Drawer (Native Modal)

The main Gallery uses React Native's built-in `Modal` with native iOS/Android
sheet presentation.

### Implementation

```tsx
import { Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// State
const [isResultsDrawerOpen, setIsResultsDrawerOpen] = useState(false);

// Component
<Modal
  visible={isResultsDrawerOpen}
  animationType="slide"
  presentationStyle="pageSheet"
  onRequestClose={() => setIsResultsDrawerOpen(false)}
>
  <SafeAreaView style={styles.modalContainer} edges={["top"]}>
    {/* Grabber indicator */}
    <View style={styles.grabberContainer}>
      <View style={styles.grabber} />
    </View>

    {/* Header */}
    <View style={styles.modalHeader}>
      <TouchableOpacity onPress={() => setIsResultsDrawerOpen(false)}>
        <Text style={styles.doneButtonText}>Close</Text>
      </TouchableOpacity>
      <Text style={styles.modalTitle}>Gallery</Text>
    </View>

    {/* Content */}
    <ScrollView style={styles.modalContent}>
      {/* Your content here */}
    </ScrollView>
  </SafeAreaView>
</Modal>;
```

### Key Properties

| Property            | Value         | Purpose                                               |
| ------------------- | ------------- | ----------------------------------------------------- |
| `presentationStyle` | `"pageSheet"` | Native iOS page sheet with swipe-to-dismiss           |
| `animationType`     | `"slide"`     | Smooth native slide animation                         |
| `onRequestClose`    | callback      | Handles back button (Android) and swipe gesture (iOS) |

### Styles

```tsx
const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: "#1A1A2E", // Your background color
  },
  grabberContainer: {
    alignItems: "center",
    paddingVertical: 8,
  },
  grabber: {
    width: 36,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 2,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  modalContent: {
    flex: 1,
  },
});
```

---

## 2. FTUE Bottom Sheet (@gorhom/bottom-sheet)

For partial-height, gesture-controlled drawers with more customization options.

### Installation

```bash
npm install @gorhom/bottom-sheet

# Peer dependencies (if not already installed)
npm install react-native-reanimated react-native-gesture-handler
```

### Implementation

```tsx
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useRef } from "react";

// Ref for programmatic control
const sheetRef = useRef<BottomSheet>(null);

// State
const [isDrawerOpen, setIsDrawerOpen] = useState(false);

// Component
<BottomSheet
  ref={sheetRef}
  index={isDrawerOpen ? 0 : -1}
  snapPoints={["55%"]}
  enablePanDownToClose={true}
  onChange={(index) => {
    if (index === -1) {
      setIsDrawerOpen(false);
    }
  }}
  backdropComponent={(props) => (
    <BottomSheetBackdrop
      {...props}
      disappearsOnIndex={-1}
      appearsOnIndex={0}
      opacity={0.6}
      pressBehavior="none"
    />
  )}
  backgroundStyle={{ backgroundColor: "#1A1A2E" }}
  handleIndicatorStyle={{
    backgroundColor: "rgba(255,255,255,0.3)",
    width: 36,
  }}
>
  <BottomSheetView style={styles.sheetContent}>
    {/* Header */}
    <View style={styles.modalHeader}>
      <Text style={styles.modalTitle}>Gallery</Text>
      <TouchableOpacity onPress={() => sheetRef.current?.close()}>
        <Text style={styles.closeText}>Close</Text>
      </TouchableOpacity>
    </View>

    {/* Content */}
    <ScrollView>
      {/* Your content here */}
    </ScrollView>
  </BottomSheetView>
</BottomSheet>;
```

### Key Properties

| Property               | Value                      | Purpose                                         |
| ---------------------- | -------------------------- | ----------------------------------------------- |
| `index`                | `-1` (closed) / `0` (open) | Controls open/closed state                      |
| `snapPoints`           | `['55%']`                  | Height percentages where sheet snaps            |
| `enablePanDownToClose` | `true`                     | Swipe down gesture to close                     |
| `onChange`             | callback                   | Fires when snap point changes                   |
| `backdropComponent`    | component                  | Customizable backdrop overlay                   |
| `ref`                  | `useRef`                   | Programmatic control via `ref.current?.close()` |

### Programmatic Control

```tsx
// Open the sheet
sheetRef.current?.snapToIndex(0);

// Close the sheet
sheetRef.current?.close();
```

---

## Comparison

| Feature                | Native Modal        | @gorhom/bottom-sheet     |
| ---------------------- | ------------------- | ------------------------ |
| Setup complexity       | None (built-in)     | Requires installation    |
| Animation              | Native, very smooth | Reanimated-based, smooth |
| Partial height         | No (full screen)    | Yes (customizable)       |
| Multiple snap points   | No                  | Yes                      |
| Gesture control        | Basic               | Advanced                 |
| Backdrop customization | None                | Full control             |
| Programmatic control   | State-based only    | Ref-based + state        |

---

## Recommendation

- **Use Native Modal** for simple, full-screen drawers where you want the
  smoothest native feel with minimal code.

- **Use @gorhom/bottom-sheet** for partial-height sheets, multiple snap points,
  or when you need advanced gesture handling.

---

## Source Location

The Gallery drawer implementation can be found in:

- `app/(studio)/index.tsx` - Lines 790-899
