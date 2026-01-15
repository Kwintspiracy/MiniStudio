import { Stack } from 'expo-router';
import { Platform, View, Text } from 'react-native';
import { colors } from '../../src/theme';

export default function AdminLayout() {
    if (Platform.OS !== 'web') {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
                <Text style={{ color: 'white' }}>Admin interface is only available on Web.</Text>
            </View>
        );
    }

    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#161B22' }
            }}
        />
    );
}
