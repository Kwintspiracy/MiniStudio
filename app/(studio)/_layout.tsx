import { Stack } from 'expo-router';

export default function StudioLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0D1117' },
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
