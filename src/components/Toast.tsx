import React, { useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions, Modal } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming, 
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { fontFamily } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ToastProps {
  visible: boolean;
  message: string;
  onDismiss: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps & { useNativeModal?: boolean }> = ({ 
  visible, 
  message, 
  onDismiss, 
  duration = 3000,
  useNativeModal = true
}) => {
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(0);

  const hide = useCallback(() => {
    'worklet';
    opacity.value = withTiming(0, { duration: 200 });
    translateY.value = withTiming(-100, { duration: 300 }, () => {
      runOnJS(onDismiss)();
    });
  }, [onDismiss]);

  useEffect(() => {
    if (visible) {
      translateX.value = 0;
      opacity.value = withTiming(1, { duration: 300 });
      translateY.value = withTiming(60, { 
        duration: 500,
        easing: Easing.out(Easing.exp),
      });

      const timer = setTimeout(() => {
        hide();
      }, duration);

      return () => clearTimeout(timer);
    } else {
        // Ensure reset when hidden externally
        opacity.value = 0;
        translateY.value = -100;
        translateX.value = 0;
    }
  }, [visible, duration, hide]);

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      if (Math.abs(event.velocityX) > 500 || Math.abs(event.translationX) > SCREEN_WIDTH / 3) {
        // Swipe away
        translateX.value = withTiming(
            event.translationX > 0 ? SCREEN_WIDTH : -SCREEN_WIDTH, 
            { duration: 200 }, 
            () => {
                runOnJS(onDismiss)();
            }
        );
      } else {
        // Snap back
        translateX.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value }
    ],
  }));

  const content = (
    <View style={styles.outerContainer} pointerEvents="box-none">
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.container, animatedStyle]}>
          <Text style={styles.text}>{message}</Text>
        </Animated.View>
      </GestureDetector>
    </View>
  );

  if (useNativeModal) {
    return (
      <Modal
        transparent
        visible={visible}
        animationType="none"
        pointerEvents="box-none"
      >
        {content}
      </Modal>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  container: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    minWidth: 200,
    maxWidth: SCREEN_WIDTH - 80,
    alignItems: 'center',
  },
  text: {
    color: '#1A1A1A',
    fontSize: 14,
    fontFamily: fontFamily.primary,
    fontWeight: '600',
    textAlign: 'center',
  },
});
