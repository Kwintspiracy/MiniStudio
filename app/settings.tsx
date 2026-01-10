import { View, Text, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { colors } from '../src/theme';

export default function SettingsScreen() {
    return (
        <View style={styles.container}>
            <Stack.Screen options={{ title: 'Settings', headerStyle: { backgroundColor: colors.background.secondary }, headerTintColor: '#fff' }} />
            <Text style={styles.text}>Settings Screen</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    text: {
        color: colors.text.primary,
        fontSize: 18,
    }
});
