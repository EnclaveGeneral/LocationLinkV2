// This screen component displays the chat conversation between two users

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

// Define the structure of a single message
type Message = {
  messageId: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: string;
  status?: 'sent' | 'delivered' | 'read' | null;
}

export default function ChatScreen({ route }: any) {
  const { conversationId, otherUserId } = route.params;

  const [messages, setMessages] = useState<Message[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState({
    type: 'error' as 'error' | 'success' | 'confirm',
    title: '',
    message: ''
  });
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    initialize();
  }, []);

  // Initialize this specific chat conversation
  const initialize = async () => {
    try {
      // Step 1: Get current user
      const user = await authService.getCurrentUser();
      if (user) {
        setCurrentUserId(user.userId);

        // Step 2: Load messages
        await loadMessages(user.userId);
      }
    } catch (error) {
      console.error('Error initializing:', error);
    } finally {
      setLoading(false);
    }

  }

  // Load all prior messages for this conversation
  const loadMessages = async (userId: string) => {
    try {
      const data = await chatService.getConversationMessages(conversationId);
      setMessages(data);

      // Scroll to bottom after loading
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);

      // Mark conversation as read
      // TODO: We need the conversation object for this
      // We'll add this later

    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  // Send a new message, activate on button press
  const sendMessage = async () => {
    if (!inputText.trim()) return;



    console.log('Sending message:', inputText);
    setInputText('');
  }

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
          {item.content}  {/* ✅ Using 'content' field */}
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
        <Text style={{ marginTop: 10, color: '#666' }}>Loading messages...</Text>
      </View>
    );
  }

  // Render UI components
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
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
  messageList: {
    padding: 15,
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
    padding: 12,
    borderRadius: 20,
    marginBottom: 10,
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
    fontSize: 16,
    color: '#000',
  },
  myMessageText: {
    color: '#fff',
  },
  timestamp: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
  myTimestamp: {
    color: '#e0d0ff',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#9420ceff',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: width * 0.035,
  },
  sendButton: {
    marginLeft: 10,
    backgroundColor: '#9420ceff',
    borderRadius: 20,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: width * 0.035,
  },
});
