import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export function useHaptics() {
    const triggerImpact = async (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium) => {
        if (Platform.OS === 'web') return;
        await Haptics.impactAsync(style);
    };

    const triggerNotification = async (type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success) => {
        if (Platform.OS === 'web') return;
        await Haptics.notificationAsync(type);
    };

    const triggerSelection = async () => {
        if (Platform.OS === 'web') return;
        await Haptics.selectionAsync();
    };

    return {
        triggerImpact,
        triggerNotification,
        triggerSelection,
    };
}
