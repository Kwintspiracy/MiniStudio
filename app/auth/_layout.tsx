import { Stack } from 'expo-router';

export default function AuthLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="sign-in" objectId="sign-in-screen" />
            <Stack.Screen name="sign-up" objectId="sign-up-screen" />
        </Stack>
    );
}
