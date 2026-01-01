// app/(tabs)/chats.tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ChatListScreen from '../../src/screens/ChatListScreen';
import ChatScreen from '../../src/screens/ChatScreen';

const Stack = createNativeStackNavigator();

export default function ChatsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="ChatList"
        component={ChatListScreen}
        options={{ headerShown: false }}  // We use custom header from tab layout
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={({ route }: any) => ({
          title: route.params?.otherUserId || 'Chat',
          headerStyle: { backgroundColor: '#A910F5' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        })}
      />
    </Stack.Navigator>
  );
}