import { View, Text, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { colors } from '../src/theme';

export default function CameraScreen() {
    return (
        <View style={styles.container}>
            <Stack.Screen options={{ title: 'Camera', headerTintColor: '#fff', headerStyle: { backgroundColor: '#000' } }} />
            <Text style={styles.text}>Camera Screen</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
    },
    text: {
        color: '#fff',
        fontSize: 18,
    }
});
