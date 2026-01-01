// app/(tabs)/chats/[conversationId].tsx
import { useLocalSearchParams } from 'expo-router';
import ChatScreen from '../../../src/screens/ChatScreen';

export default function ChatScreenRoute() {
  const params = useLocalSearchParams();

  return (
    <ChatScreen
      route={{
        params: {
          conversationId: params.conversationId,
          otherUserId: params.otherUserId,
        }
      }}
    />
  );
}