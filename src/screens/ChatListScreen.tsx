// src/screens/ChatScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ActivityIndicator
} from 'react-native';
import { chatService } from '../services/chatService';
import { authService } from '../services/authService';
import CustomModal from '@/components/modal';

const { width } = Dimensions.get('screen');

type Message = {
  messageId: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: string;
  status?: 'sent' | 'delivered' | 'read' | null;
};

export default function ChatScreen({ route }: any) {
  const { conversationId, otherUserId } = route.params;

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    try {
      const user = await authService.getCurrentUser();
      if (user) {
        setCurrentUserId(user.userId);
        await loadMessages(user.userId);
      }
    } catch (error) {
      console.error('Error initializing:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (userId: string) => {
    try {
      const data = await chatService.getConversationMessages(conversationId);
      setMessages(data);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);

    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim()) return;

    // TODO: WebSocket sending
    console.log('Sending message:', inputText);
    setInputText('');
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMine = item.senderId === currentUserId;

    return (
      <View style={[
        styles.messageBubble,
        isMine ? styles.myMessage : styles.theirMessage
      ]}>
        <Text style={[
          styles.messageText,
          isMine && styles.myMessageText
        ]}>
          {item.content}
        </Text>
        <Text style={[
          styles.timestamp,
          isMine && styles.myTimestamp
        ]}>
          {new Date(item.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#9420ceff" />
        <Text style={styles.loadingText}>Loading messages...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={width * 0.225}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.messageId}
        contentContainerStyle={styles.messageList}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No messages yet. Say hi! 👋</Text>
          </View>
        }
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={styles.sendButton}
          onPress={sendMessage}
          disabled={!inputText.trim()}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: width * 0.025,
    color: '#666',
    fontSize: width * 0.035,
  },
  messageList: {
    padding: width * 0.0375,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: width * 0.3,
  },
  emptyText: {
    fontSize: width * 0.04,
    color: '#999',
    textAlign: 'center',
  },
  messageBubble: {
    maxWidth: '75%',
    padding: width * 0.03,
    borderRadius: width * 0.05,
    marginBottom: width * 0.025,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#9420ceff',
  },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#e5e5ea',
  },
  messageText: {
    fontSize: width * 0.04,
    color: '#000',
  },
  myMessageText: {
    color: '#fff',
  },
  timestamp: {
    fontSize: width * 0.0275,
    color: '#666',
    marginTop: width * 0.01,
  },
  myTimestamp: {
    color: '#e0d0ff',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: width * 0.025,
    backgroundColor: '#fff',
    borderTopWidth: width * 0.002,
    borderTopColor: '#ddd',
  },
  input: {
    flex: 1,
    borderWidth: width * 0.002,
    borderColor: '#9420ceff',
    borderRadius: width * 0.05,
    paddingHorizontal: width * 0.0375,
    paddingVertical: width * 0.02,
    maxHeight: width * 0.25,
    fontSize: width * 0.035,
  },
  sendButton: {
    marginLeft: width * 0.025,
    backgroundColor: '#9420ceff',
    borderRadius: width * 0.05,
    paddingHorizontal: width * 0.05,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: width * 0.035,
  },
});