import React, { useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, StyleProp, ViewStyle, Dimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle, Rect, Filter, FeGaussianBlur, G } from 'react-native-svg';
import Animated, { 
    useSharedValue, 
    useAnimatedProps, 
    withRepeat, 
    withTiming, 
    Easing, 
    withSequence 
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface BreathingGradientButtonProps {
    onPress: () => void;
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Random Generators - Ranges for maximum spread
const randomRange = (min: number, max: number) => min + Math.random() * (max - min);
const randomScale = () => 1.0 + Math.random() * 0.8; // 1.0x to 1.8x (Huge)
const randomDuration = () => 4000 + Math.random() * 3000; // Slow, fluid movement

const MovingOrb = ({ gradId }: { gradId: string }) => {
    // Range extends SIGNIFICANTLY beyond edges to ensure no gaps
    // Min X: -100 (Way off left)
    // Max X: Screen Width + 100 (Way off right)
    const minX = -100;
    const maxX = SCREEN_WIDTH + 100;
    const minY = -50;
    const maxY = 110; // Button height is ~60, so this covers vertical fully

    // Pre-calculate random path steps
    const stepsX = Array.from({ length: 8 }).map(() => randomRange(minX, maxX));
    const stepsY = Array.from({ length: 8 }).map(() => randomRange(minY, maxY));
    const stepsScale = Array.from({ length: 8 }).map(() => randomScale());
    const dur = randomDuration();

    const cx = useSharedValue(stepsX[0]);
    const cy = useSharedValue(stepsY[0]);
    const scale = useSharedValue(stepsScale[0]);

    useEffect(() => {
        // X Animation Loop
        const sequenceX = stepsX.slice(1).map(val => 
            withTiming(val, { duration: dur, easing: Easing.inOut(Easing.ease) })
        );
        sequenceX.push(withTiming(stepsX[0], { duration: dur, easing: Easing.inOut(Easing.ease) }));
        cx.value = withRepeat(withSequence(...sequenceX), -1, true);

        // Y Animation Loop
        const sequenceY = stepsY.slice(1).map(val => 
            withTiming(val, { duration: dur, easing: Easing.inOut(Easing.ease) })
        );
        sequenceY.push(withTiming(stepsY[0], { duration: dur, easing: Easing.inOut(Easing.ease) }));
        cy.value = withRepeat(withSequence(...sequenceY), -1, true);

        // Scale Animation Loop
        const sequenceScale = stepsScale.slice(1).map(val => 
            withTiming(val, { duration: dur, easing: Easing.inOut(Easing.ease) })
        );
        sequenceScale.push(withTiming(stepsScale[0], { duration: dur, easing: Easing.inOut(Easing.ease) }));
        scale.value = withRepeat(withSequence(...sequenceScale), -1, true);
    }, []);

    const animatedProps = useAnimatedProps(() => ({
        cx: cx.value,
        cy: cy.value,
        r: 100 * scale.value // Base radius 100 -> Max effective radius ~180
    }));

    return (
        <AnimatedCircle 
            animatedProps={animatedProps}
            fill={`url(#${gradId})`}
            opacity={0.8}
        />
    );
};

export const BreathingGradientButton = ({ onPress, children, style }: BreathingGradientButtonProps) => {
    return (
        <TouchableOpacity 
            onPress={onPress} 
            activeOpacity={0.9}
            style={[styles.container, style]}
        >
            <View style={StyleSheet.absoluteFill}>
                <Svg height="100%" width="100%">
                    <Defs>
                        <Filter id="blur" x="-50%" y="-50%" width="200%" height="200%">
                            <FeGaussianBlur in="SourceGraphic" stdDeviation="25" />
                        </Filter>

                        <RadialGradient id="grad_blue" cx="50%" cy="50%" rx="50%" ry="50%" fx="50%" fy="50%">
                            <Stop offset="0%" stopColor="#0066FF" stopOpacity="1" />
                            <Stop offset="100%" stopColor="#0066FF" stopOpacity="0" />
                        </RadialGradient>
                        <RadialGradient id="grad_purple" cx="50%" cy="50%" rx="50%" ry="50%" fx="50%" fy="50%">
                            <Stop offset="0%" stopColor="#9D00FF" stopOpacity="1" />
                            <Stop offset="100%" stopColor="#9D00FF" stopOpacity="0" />
                        </RadialGradient>
                        <RadialGradient id="grad_pink" cx="50%" cy="50%" rx="50%" ry="50%" fx="50%" fy="50%">
                            <Stop offset="0%" stopColor="#FF00CC" stopOpacity="1" />
                            <Stop offset="100%" stopColor="#FF00CC" stopOpacity="0" />
                        </RadialGradient>
                        <RadialGradient id="grad_orange" cx="50%" cy="50%" rx="50%" ry="50%" fx="50%" fy="50%">
                            <Stop offset="0%" stopColor="#FF5500" stopOpacity="1" />
                            <Stop offset="100%" stopColor="#FF5500" stopOpacity="0" />
                        </RadialGradient>
                        <RadialGradient id="grad_teal" cx="50%" cy="50%" rx="50%" ry="50%" fx="50%" fy="50%">
                            <Stop offset="0%" stopColor="#00FFCC" stopOpacity="1" />
                            <Stop offset="100%" stopColor="#00FFCC" stopOpacity="0" />
                        </RadialGradient>
                    </Defs>
                    
                    <Rect x="0" y="0" width="100%" height="100%" fill="#1a0b2e" />

                    <G filter="url(#blur)">
                        {/* 8 Huge Orbs for Maximum Coverage without clutter */}
                        <MovingOrb gradId="grad_blue" />
                        <MovingOrb gradId="grad_purple" />
                        <MovingOrb gradId="grad_pink" />
                        <MovingOrb gradId="grad_orange" />
                        <MovingOrb gradId="grad_teal" />
                        <MovingOrb gradId="grad_blue" />
                        <MovingOrb gradId="grad_purple" />
                        <MovingOrb gradId="grad_pink" />
                    </G>
                </Svg>
            </View>
            
            <View style={styles.content}>
                {children}
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        height: 56,
        borderRadius: 28,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        backgroundColor: '#1a0b2e',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    }
});
