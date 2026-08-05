import { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, StatusBar, Pressable, Animated as RNAnimated, Dimensions, Platform } from 'react-native';
import { CameraView, useCameraPermissions, CameraType, FlashMode } from 'expo-camera';
import { useRouter, Stack } from 'expo-router';
import { colors } from '../src/theme';
import { XMarkIcon, FlashOnIcon, FlashOffIcon, FlashAutoIcon, CameraFlipIcon } from '../src/components/Icons';
import { useImageContext } from '../src/context/ImageContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppModal } from '../src/components/AppModal';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export default function CameraScreen() {
    const [permission, requestPermission] = useCameraPermissions();
    const [facing, setFacing] = useState<CameraType>('back');
    const [flash, setFlash] = useState<FlashMode>('off');
    const [isCapturing, setIsCapturing] = useState(false);
    const [focusPoint, setFocusPoint] = useState<{ x: number, y: number } | null>(null);
    const cameraRef = useRef<CameraView>(null);
    const focusAnim = useRef(new RNAnimated.Value(0)).current;
    const flashAnim = useRef(new RNAnimated.Value(0)).current;
    const router = useRouter();
    const { setSelectedImage } = useImageContext();

    const [modalConfig, setModalConfig] = useState<{
        visible: boolean;
        title: string;
        message: string;
        type?: 'default' | 'error' | 'critical';
        primaryAction?: { label: string; onPress: () => void };
        secondaryAction?: { label: string; onPress: () => void };
    }>({ visible: false, title: '', message: '' });

    const showModal = (
        title: string, 
        message: string, 
        type: 'default' | 'error' | 'critical' = 'default',
        primaryAction?: { label: string; onPress: () => void },
        secondaryAction?: { label: string; onPress: () => void }
    ) => {
        setModalConfig({ visible: true, title, message, type, primaryAction, secondaryAction });
    };

    const hideModal = () => {
        setModalConfig(prev => ({ ...prev, visible: false }));
    };

    if (!permission) {
        // Camera permissions are still loading.
        return <View style={styles.container} />;
    }

    if (!permission.granted) {
        // Camera permissions are not granted yet.
        return (
            <SafeAreaView style={styles.permissionContainer}>
                <Stack.Screen options={{ headerShown: false }} />
                <StatusBar barStyle="light-content" backgroundColor={colors.palette.black} />
                <Text style={styles.permissionText}>We need your permission to show the camera</Text>
                <TouchableOpacity onPress={requestPermission} style={styles.permissionButton}>
                    <Text style={styles.permissionButtonText}>Grant Permission</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.back()} style={styles.closeButtonFull}>
                    <Text style={styles.closeButtonText}>Cancel</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    const toggleFlash = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setFlash(current => {
            if (current === 'off') return 'on';
            if (current === 'on') return 'auto';
            return 'off';
        });
    };

    const handleTapToFocus = (event: any) => {
        const { locationX, locationY } = event.nativeEvent;
        setFocusPoint({ x: locationX, y: locationY });

        // Visual feedback
        focusAnim.setValue(0);
        RNAnimated.sequence([
            RNAnimated.timing(focusAnim, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
            }),
            RNAnimated.delay(800),
            RNAnimated.timing(focusAnim, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
            })
        ]).start(() => setFocusPoint(null));
    };

    const renderFlashIcon = () => {
        if (flash === 'on') return <FlashOnIcon color={colors.palette.white} size={24} />;
        if (flash === 'auto') return <FlashAutoIcon color={colors.palette.white} size={24} />;
        return <FlashOffIcon color={colors.palette.white} size={24} />;
    };

    const takePicture = async () => {
        if (cameraRef.current && !isCapturing) {
            try {
                setIsCapturing(true);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                
                // Shutter animation
                RNAnimated.sequence([
                    RNAnimated.timing(flashAnim, { toValue: 1, duration: 50, useNativeDriver: true }),
                    RNAnimated.timing(flashAnim, { toValue: 0, duration: 150, useNativeDriver: true })
                ]).start();

                // Capture without base64 — we downscale first, then encode the
                // resized result. Capturing full-res base64 directly produces
                // 4-7 MB payloads that fail generation requests on cellular.
                const photo = await cameraRef.current.takePictureAsync({
                    quality: 0.8,
                    skipProcessing: false, // Better quality for "source"
                });

                if (photo) {
                    // Downscale to 1024px wide JPEG (same pipeline as the gallery
                    // picker) to keep the generation upload small and reliable.
                    const resized = await ImageManipulator.manipulate(photo.uri)
                        .resize({ width: 1024 })
                        .renderAsync();
                    const result = await resized.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });

                    let dataUri: string;
                    if (Platform.OS === 'web') {
                        // expo-file-system's native readAsStringAsync is unavailable on
                        // web; the manipulator returns a blob:/data: URL, so read it
                        // via fetch + FileReader into a data URL.
                        const response = await fetch(result.uri);
                        const blob = await response.blob();
                        dataUri = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.onerror = () => reject(reader.error);
                            reader.readAsDataURL(blob);
                        });
                    } else {
                        const base64 = await FileSystem.readAsStringAsync(result.uri, {
                            encoding: FileSystem.EncodingType.Base64,
                        });
                        dataUri = `data:image/jpeg;base64,${base64}`;
                    }

                    setSelectedImage(dataUri);
                    router.back();
                }
            } catch (error) {
                console.error("Failed to take picture:", error);
                showModal("Error", "Failed to take selected photo.", 'error');
            } finally {
                setIsCapturing(false);
            }
        }
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <StatusBar barStyle="light-content" hidden />

            <Pressable 
                style={styles.camera} 
                onPress={handleTapToFocus}
            >
                <CameraView
                    style={StyleSheet.absoluteFill}
                    facing={facing}
                    flash={flash}
                    ref={cameraRef}
                />
                
                {focusPoint && (
                    <RNAnimated.View 
                        style={[
                            styles.focusRing,
                            { 
                                top: focusPoint.y - 35, 
                                left: focusPoint.x - 35,
                                opacity: focusAnim,
                                transform: [{ scale: focusAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [1.2, 1]
                                }) }]
                            }
                        ]}
                    />
                )}
            </Pressable>

            {/* Shutter Flash Overlay */}
            <RNAnimated.View 
                style={[
                    styles.shutterOverlay, 
                    { opacity: flashAnim }
                ]} 
                pointerEvents="none" 
            />

            <SafeAreaView style={styles.uiOverlay} pointerEvents="box-none">
                {/* Close Button - 24/24 Inset */}
                <View style={styles.closeButtonContainer}>
                    <TouchableOpacity
                        onPress={() => router.back()}
                        style={styles.iconButton}
                        accessibilityLabel="Close camera"
                        accessibilityRole="button"
                    >
                        <XMarkIcon color={colors.palette.white} size={24} />
                    </TouchableOpacity>
                </View>

                {/* Bottom Controls */}
                <View style={styles.bottomBar}>
                    <View style={styles.controlsRow}>
                        {/* Placeholder for left symmetry if needed, currently empty to keep flash on right */}
                        <View style={styles.sideButtonPlaceholder} />
                        
                        <TouchableOpacity
                            style={styles.captureButtonOuter}
                            onPress={takePicture}
                            disabled={isCapturing}
                            accessibilityLabel="Take photo"
                            accessibilityRole="button"
                        >
                            <View style={[styles.captureButtonInner, isCapturing && styles.capturing]} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={toggleFlash}
                            style={styles.sideButton}
                            accessibilityLabel={`Flash ${flash}`}
                            accessibilityRole="button"
                        >
                            {renderFlashIcon()}
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>
            <AppModal
                visible={modalConfig.visible}
                onClose={hideModal}
                title={modalConfig.title}
                message={modalConfig.message}
                type={modalConfig.type}
                primaryAction={modalConfig.primaryAction ? {
                    ...modalConfig.primaryAction,
                    onPress: () => {
                        modalConfig.primaryAction?.onPress();
                        hideModal();
                    }
                } : { label: "OK", onPress: hideModal }}
                secondaryAction={modalConfig.secondaryAction ? {
                    ...modalConfig.secondaryAction,
                    onPress: () => {
                        modalConfig.secondaryAction?.onPress();
                        hideModal();
                    }
                } : undefined}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.palette.black,
    },
    permissionContainer: {
        flex: 1,
        backgroundColor: colors.background.primary,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        gap: 20,
    },
    permissionText: {
        color: colors.text.primary,
        textAlign: 'center',
        fontSize: 16,
    },
    permissionButton: {
        backgroundColor: colors.button.primary,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 8,
    },
    permissionButtonText: {
        color: colors.palette.white,
        fontWeight: '600',
    },
    closeButtonFull: {
        padding: 10,
    },
    closeButtonText: {
        color: colors.text.secondary,
    },
    camera: {
        flex: 1,
    },
    uiOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'flex-end', // Changed from space-between to push controls to bottom
    },
    closeButtonContainer: {
        position: 'absolute',
        top: 24,
        left: 24,
        zIndex: 20,
    },
    iconButton: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.35)',
        borderRadius: 22,
    },
    bottomBar: {
        paddingBottom: 40,
        width: '100%',
    },
    controlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 30,
    },
    captureButtonOuter: {
        width: 74,
        height: 74,
        borderRadius: 37,
        borderWidth: 5,
        borderColor: colors.palette.white,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    sideButton: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 22,
        marginLeft: 30,
    },
    sideButtonPlaceholder: {
        width: 44,
        marginRight: 30,
    },
    captureButtonInner: {
        width: 58,
        height: 58,
        borderRadius: 29,
        backgroundColor: colors.palette.white,
    },
    focusRing: {
        position: 'absolute',
        width: 70,
        height: 70,
        borderWidth: 1.5,
        borderColor: '#FFD700', // Gold color for focus
        borderRadius: 4,
    },
    shutterOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.palette.white,
        zIndex: 10,
    },
    capturing: {
        backgroundColor: colors.text.muted,
        transform: [{ scale: 0.9 }],
    },
});
