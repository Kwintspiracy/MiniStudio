import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Image, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraIcon, SparklesIcon, XMarkIcon } from './Icons';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

interface OnboardingOverlayProps {
    visible: boolean;
    onDismiss: () => void;
}

export const OnboardingOverlay = ({ visible, onDismiss }: OnboardingOverlayProps) => {
    const [step, setStep] = useState(0);

    const handleNext = () => {
        Haptics.selectionAsync();
        if (step < 2) {
            setStep(step + 1);
        } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onDismiss();
        }
    };

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View className="flex-1 bg-black/90 items-center justify-center p-6">
                <View className="w-full max-w-sm bg-[#161B22] border border-zinc-700 rounded-3xl p-6 overflow-hidden">
                    {/* Progress Indicators */}
                    <View className="flex-row justify-center gap-2 mb-8">
                        {[0, 1, 2].map((i) => (
                            <View
                                key={i}
                                className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-indigo-500' : 'w-2 bg-zinc-800'
                                    }`}
                            />
                        ))}
                    </View>

                    {/* Content */}
                    <View className="items-center min-h-[200px]">
                        {step === 0 && (
                            <>
                                <View className="w-16 h-16 bg-indigo-500/20 rounded-2xl items-center justify-center mb-6">
                                    <SparklesIcon size={32} color="#818cf8" />
                                </View>
                                <Text className="text-white text-2xl font-bold mb-3 text-center">Welcome to MiniStudio</Text>
                                <Text className="text-zinc-400 text-center leading-6">
                                    Transform your miniature photos into stunning concept art and professional photography using AI.
                                </Text>
                            </>
                        )}

                        {step === 1 && (
                            <>
                                <View className="w-16 h-16 bg-emerald-500/20 rounded-2xl items-center justify-center mb-6">
                                    <CameraIcon size={32} color="#34d399" />
                                </View>
                                <Text className="text-white text-2xl font-bold mb-3 text-center">Capture & Import</Text>
                                <Text className="text-zinc-400 text-center leading-6">
                                    Snap a photo of your unpainted mini, or import one from your gallery. This will be the base for our AI.
                                </Text>
                            </>
                        )}

                        {step === 2 && (
                            <>
                                <View className="w-16 h-16 bg-purple-500/20 rounded-2xl items-center justify-center mb-6">
                                    <SparklesIcon size={32} color="#a78bfa" />
                                </View>
                                <Text className="text-white text-2xl font-bold mb-3 text-center">Craft Your Style</Text>
                                <Text className="text-zinc-400 text-center leading-6">
                                    Choose a painting style, describe your color scheme, and let the Craft Engine generate amazing results.
                                </Text>
                            </>
                        )}
                    </View>

                    {/* Button */}
                    <TouchableOpacity
                        onPress={handleNext}
                        className="w-full bg-white h-14 rounded-2xl items-center justify-center mt-8 active:scale-95 transform transition-all"
                    >
                        <Text className="text-black font-bold uppercase tracking-widest">
                            {step === 2 ? 'Get Started' : 'Next'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};
