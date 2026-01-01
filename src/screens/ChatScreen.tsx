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
import { WebSocketService } from '../services/websocketService';
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

  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState({
    type: 'error' as 'error' | 'success' | 'confirm',
    title: '',
    message: '',
  });

  const flatListRef = useRef<FlatList>(null);
  const wsServiceRef = useRef<WebSocketService | null>(null);

  useEffect(() => {
    initialize();

    // Cleanup when leaving screen
    return () => {
      cleanup();
    };
  }, []);

  const initialize = async () => {
    try {
      const user = await authService.getCurrentUser();
      if (user) {
        setCurrentUserId(user.userId);
        await loadMessages(user.userId);
        setupWebSocket();
      }
    } catch (error: any) {
      setModalContent({
        type: 'error',
        title: 'Error Initializing Chat',
        message: error.message || 'An unexpected error occurred during initialization.',
      })
      setModalVisible(true);
      console.error('Error initializing:', error);
    } finally {
      setLoading(false);
    }
  };

  const setupWebSocket = () => {
    const wsService = WebSocketService.getInstance();
    wsServiceRef.current = wsService;

    // Listen for chat events
    wsService.on('newMessage', handleNewMessage);
    wsService.on('messageSent', handleMessageSent);

    console.log('✅ WebSocket listeners registered for chat');
  };

  const cleanup = () => {
    console.log('🧹 Cleaning up ChatScreen...');

    if (wsServiceRef.current) {
      wsServiceRef.current.off('newMessage', handleNewMessage);
      wsServiceRef.current.off('messageSent', handleMessageSent);
      console.log('✅ WebSocket listeners removed');
    }
  };

  const handleNewMessage = (data: any) => {
    // Only process messages for THIS conversation
    if (data.conversationId !== conversationId) {
      console.log('⏭️ Message for different conversation, ignoring');
      return;
    }

    console.log('💬 New message received for this conversation:', data);

    const newMessage: Message = {
      messageId: data.messageId,
      conversationId: data.conversationId,
      senderId: data.senderId,
      receiverId: currentUserId,
      content: data.content,
      timestamp: data.timestamp,
      status: 'delivered',
    };

    setMessages(prev => [...prev, newMessage]);

    // Auto-scroll to bottom
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleMessageSent = (data: any) => {
    // Only process confirmations for THIS conversation
    if (data.conversationId !== conversationId) {
      console.log('⏭️ Confirmation for different conversation, ignoring');
      return;
    }

    console.log('✅ Message sent confirmation:', data.messageId);

    // Update temp message with real ID and status
    setMessages(prev => prev.map(msg =>
      msg.messageId.startsWith('temp-') && msg.content === data.content
        ? { ...msg, messageId: data.messageId, status: 'sent' }
        : msg
    ));
  };

  const loadMessages = async (userId: string) => {
    try {
      const data = await chatService.getConversationMessages(conversationId);
      setMessages(data);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);

    } catch (error: any) {
      setModalContent({
        type: 'error',
        title: 'Error loading messages',
        message: error.message || 'An unexpected error occurred while loading messages.',
      })
      setModalVisible(true);
      console.error('Error loading messages:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !wsServiceRef.current) return;

    const messageContent = inputText.trim();
    const tempId = `temp-${Date.now()}`;
    const timestamp = new Date().toISOString();

    // Optimistic UI - show message immediately
    const optimisticMessage: Message = {
      messageId: tempId,
      conversationId,
      senderId: currentUserId,
      receiverId: otherUserId,
      content: messageContent,
      timestamp,
      status: 'sent',
    };

    setMessages(prev => [...prev, optimisticMessage]);
    setInputText('');

    // Auto-scroll
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    // Send via WebSocket
    try {
      chatService.sendMessage(
        wsServiceRef.current as any,
        conversationId,
        currentUserId,
        otherUserId,
        messageContent
      );

      console.log('📤 Message sent via WebSocket');
    } catch (error: any) {
      // Remove optimistic message on error
      setMessages(prev => prev.filter(msg => msg.messageId !== tempId));
      console.error('Error sending message:', error);
      setModalContent({
        type: 'error',
        title: 'Error sending message',
        message: error.message || 'An unexpected error occurred while sending your message.',
      });
    }
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
            <Text style={styles.emptyText}>No messages yet. Time To Start Chatting! 👋</Text>
          </View>
        }
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
          placeholderTextColor="#999"
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            !inputText.trim() && styles.sendButtonDisabled
          ]}
          onPress={sendMessage}
          disabled={!inputText.trim()}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>

      <CustomModal
        visible={modalVisible}
        title={modalContent.title}
        message={modalContent.message}
        type={modalContent.type}
        onClose={() => setModalVisible(false)}
      />
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
    color: '#000',
  },
  sendButton: {
    marginLeft: width * 0.025,
    backgroundColor: '#9420ceff',
    borderRadius: width * 0.05,
    paddingHorizontal: width * 0.05,
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: width * 0.035,
  },
});