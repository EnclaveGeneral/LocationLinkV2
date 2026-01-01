// app/(tabs)/chats/_layout.tsx
import { Stack } from 'expo-router';

export default function ChatsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,  // We use custom header from parent tab layout
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        name="[conversationId]"
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: '#A910F5' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
          title: 'Chat',
        }}
      />
    </Stack>
  );
}