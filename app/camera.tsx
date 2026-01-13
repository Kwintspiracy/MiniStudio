import { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, StatusBar, Alert } from 'react-native';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import { useRouter, Stack } from 'expo-router';
import { colors } from '../src/theme';
import { XMarkIcon, ArrowsPointingOutIcon, CameraLensIcon } from '../src/components/Icons';
import { useImageContext } from '../src/context/ImageContext';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CameraScreen() {
    const [permission, requestPermission] = useCameraPermissions();
    const [facing, setFacing] = useState<CameraType>('back');
    const [isCapturing, setIsCapturing] = useState(false);
    const cameraRef = useRef<CameraView>(null);
    const router = useRouter();
    const { setSelectedImage } = useImageContext();

    if (!permission) {
        // Camera permissions are still loading.
        return <View style={styles.container} />;
    }

    if (!permission.granted) {
        // Camera permissions are not granted yet.
        return (
            <SafeAreaView style={styles.permissionContainer}>
                <Stack.Screen options={{ headerShown: false }} />
                <StatusBar barStyle="light-content" backgroundColor="#000" />
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

    const toggleCameraFacing = () => {
        setFacing(current => (current === 'back' ? 'front' : 'back'));
    };

    const takePicture = async () => {
        if (cameraRef.current && !isCapturing) {
            try {
                setIsCapturing(true);
                const photo = await cameraRef.current.takePictureAsync({
                    quality: 0.8,
                    base64: true,
                    skipProcessing: true, // Faster capture
                });

                if (photo) {
                    // Use the data URI format if base64 is available, otherwise file URI
                    const imageUri = photo.base64
                        ? `data:image/jpeg;base64,${photo.base64}`
                        : photo.uri;

                    setSelectedImage(imageUri);
                    router.back();
                }
            } catch (error) {
                console.error("Failed to take picture:", error);
                Alert.alert("Error", "Failed to take selected photo.");
            } finally {
                setIsCapturing(false);
            }
        }
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <StatusBar barStyle="light-content" hidden />

            <CameraView
                style={styles.camera}
                facing={facing}
                ref={cameraRef}
            />
            <SafeAreaView style={styles.uiOverlay} pointerEvents="box-none">
                {/* Top Bar */}
                <View style={styles.topBar}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                        <XMarkIcon color="#FFF" size={28} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={toggleCameraFacing} style={styles.iconButton}>
                        <ArrowsPointingOutIcon color="#FFF" size={28} />
                    </TouchableOpacity>
                </View>

                {/* Bottom Controls */}
                <View style={styles.bottomBar}>
                    <TouchableOpacity
                        style={styles.captureButtonOuter}
                        onPress={takePicture}
                        disabled={isCapturing}
                    >
                        <View style={[styles.captureButtonInner, isCapturing && styles.capturing]} />
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
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
        color: '#FFF',
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
        justifyContent: 'space-between',
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 10,
    },
    iconButton: {
        padding: 10,
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 20,
    },
    bottomBar: {
        paddingBottom: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    captureButtonOuter: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 4,
        borderColor: '#FFF',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.1)',
    },
    captureButtonInner: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#FFF',
    },
    capturing: {
        backgroundColor: colors.accent.red,
        transform: [{ scale: 0.9 }],
    },
});
