// src/screens/ChatScreen.tsx - ACTUALLY FIXED VERSION
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
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
  ActivityIndicator,
  Image
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { chatService } from '../services/chatService';
import { authService } from '../services/authService';
import { dataService } from '../services/dataService';
import { WebSocketService } from '../services/websocketService';
import { getUrl } from 'aws-amplify/storage';
import { Ionicons } from '@expo/vector-icons';
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

type RouteParams = {
  conversationId: string;
  otherUserId: string;
};

export default function ChatScreen({ route }: any) {
  const navigation = useNavigation();
  const { conversationId, otherUserId } = route.params as RouteParams;

  // Friend info state
  const [friendUsername, setFriendUsername] = useState<string>('');
  const [friendAvatar, setFriendAvatar] = useState<string | null>(null);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [conversation, setConversation] = useState<any>(null);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState({
    type: 'error' as 'error' | 'success' | 'confirm',
    title: '',
    message: '',
  });

  const flatListRef = useRef<FlatList>(null);
  const wsServiceRef = useRef<WebSocketService | null>(null);

  // Track pending messages for better optimistic UI
  // tempId -> content
  const pendingMessageRef = useRef<Map<String, String>>(new Map());

  // ============================================
  // DYNAMIC HEADER SETUP
  // ============================================
  useLayoutEffect(() => {
    if (friendUsername) {
      navigation.setOptions({
        headerStyle: { backgroundColor: '#A910F5' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        headerTitle: () => (
          <View style={styles.headerContainer}>
            {friendAvatar ? (
              <Image
                source={{ uri: friendAvatar }}
                style={styles.headerAvatar}
              />
            ) : (
              <View style={[styles.headerAvatar, styles.placeholderAvatar]}>
                <Ionicons name="person" size={width * 0.05} color="#fff" />
              </View>
            )}
            <Text style={styles.headerTitle}>{friendUsername}</Text>
          </View>
        ),
      });
    }
  }, [navigation, friendUsername, friendAvatar]);

  // ============================================
  // INITIALIZATION
  // ============================================
  useEffect(() => {
    console.log('💬 ChatScreen mounted for conversation:', conversationId);
    initialize();

    return () => {
      console.log('🧹 ChatScreen unmounting, cleaning up...');
      cleanup();
    };
  }, [conversationId]);

  const initialize = async () => {
    try {
      const user = await authService.getCurrentUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      setCurrentUserId(user.userId);

      // Load friend data first (for header)
      await loadFriendData(otherUserId);

      // Load conversation data
      await loadConversation(conversationId);

      // Load messages
      await loadMessages(user.userId);

      // Setup WebSocket
      setupWebSocket();

    } catch (error: any) {
      console.error('Error initializing chat:', error);
      setModalContent({
        type: 'error',
        title: 'Error Initializing Chat',
        message: error.message || 'An unexpected error occurred',
      });
      setModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // DATA LOADING
  // ============================================
  const loadFriendData = async (friendId: string) => {
    try {
      const friendData = await dataService.getUser(friendId);
      if (friendData) {
        setFriendUsername(friendData.username || 'Unknown User');

        // Load avatar if exists
        if (friendData.avatarKey) {
          try {
            const result = await getUrl({
              path: friendData.avatarKey,
              options: {
                validateObjectExistence: true,
                expiresIn: 3600,
              },
            });
            setFriendAvatar(result.url.toString());
          } catch (error) {
            console.log('No avatar available for friend');
            setFriendAvatar(null);
          }
        }
      }
    } catch (error) {
      console.error('Error loading friend data:', error);
      setFriendUsername('Unknown User');
    }
  };

  const loadConversation = async (convId: string) => {
    try {
      const conv = await chatService.getConversation(convId);
      setConversation(conv);
    } catch (error) {
      console.error('Error loading conversation:', error);
    }
  };

  const loadMessages = async (userId: string) => {
    try {
      const data = await chatService.getConversationMessages(conversationId);

      console.log('📥 Messages from database:', data.length);

      // ✅ Double-check for valid messages (paranoid filtering)
      const validMessages = data
        .filter(msg => msg !== null && msg !== undefined)
        .filter(msg => msg.messageId && msg.content && msg.timestamp);

      console.log(`✅ Valid messages: ${validMessages.length}`);

      setMessages(validMessages);

      // Mark conversation as read
      if (conversation) {
        await chatService.markConversationAsRead(conversationId, userId, conversation);
      }

      // Auto-scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);

    } catch (error: any) {
      console.error('Error loading messages:', error);
      setModalContent({
        type: 'error',
        title: 'Error Loading Messages',
        message: error.message || 'Failed to load messages',
      });
      setModalVisible(true);
    }
  };


  // ============================================
  // WEBSOCKET SETUP
  // ============================================
  const setupWebSocket = () => {
    const wsService = WebSocketService.getInstance();
    wsServiceRef.current = wsService;

    // Listen for chat events
    wsService.on('new_message', handleNewMessage);
    wsService.on('message_sent', handleMessageSent);
    wsService.on('message_error', handleMessageError);
    wsService.on('typing_indicator', handleTypingIndicator);

    console.log('✅ WebSocket listeners registered for chat');
  };

  const cleanup = () => {
    if (wsServiceRef.current) {
      wsServiceRef.current.off('new_message', handleNewMessage);
      wsServiceRef.current.off('message_sent', handleMessageSent);
      wsServiceRef.current.off('message_error', handleMessageError);
      wsServiceRef.current.off('typing_indicator', handleTypingIndicator);
      console.log('✅ WebSocket listeners removed');
    }
  };

  // ============================================
  // WEBSOCKET EVENT HANDLERS
  // ============================================
  const handleNewMessage = (data: any) => {
    console.log('📨 New message received via WebSocket:', data);

    // Only process messages for THIS conversation
    if (data.conversationId !== conversationId) {
      console.log('⏭️ Message for different conversation, ignoring');
      return;
    }

    // Check if message is from the other person (not our own echo)
    if (data.senderId === currentUserId) {
      console.log('⏭️ Message is from self, already in UI');
      return;
    }

    console.log('💬 New message received for this conversation');

    const newMessage: Message = {
      messageId: data.messageId,
      conversationId: data.conversationId,
      senderId: data.senderId,
      receiverId: data.receiverId || currentUserId,
      content: data.content,
      timestamp: data.timestamp || new Date().toISOString(),
      status: 'delivered',
    };


    setMessages(prev => {
      // Prevent duplicates
      if (prev.some(msg => msg.messageId === newMessage.messageId)) {
        console.log('⏭️ Message already exists, skipping');
        return prev;
      }
      console.log('✅ Adding new message to UI');
      return [...prev, newMessage];
    });

    // Auto-scroll to bottom
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleMessageSent = (data: any) => {
    console.log('✅ Message sent confirmation:', data);

    // Only process confirmations for THIS conversation
    if (data.conversationId !== conversationId) {
      return;
    }

    // Find the temp message and update it with real ID
    setMessages(prev => {
      const tempId = Array.from(pendingMessageRef.current.entries())
        .find(([_, content]) => content === data.content)?.[0];

      if (!tempId) {
        console.log('⚠️ No matching temp message found for confirmation');
        return prev;
      }

      // Remove from pending map
      pendingMessageRef.current.delete(tempId);

      // Update the message with real ID and status
      return prev.map(msg =>
        msg.messageId === tempId
          ? { ...msg, messageId: data.messageId, status: 'sent' as const }
          : msg
      );
    });
  };

  const handleMessageError = (data: any) => {
    console.error('❌ Message send error:', data);

    // Remove the failed message from UI
    if (data.originalMessage?.conversationId === conversationId) {
      const content = data.originalMessage.messageText;

      setMessages(prev => {
        const tempId = Array.from(pendingMessageRef.current.entries())
          .find(([_, msgContent]) => msgContent === content)?.[0];

        if (tempId) {
          pendingMessageRef.current.delete(tempId);
          return prev.filter(msg => msg.messageId !== tempId);
        }
        return prev;
      });

      setModalContent({
        type: 'error',
        title: 'Failed to send message',
        message: 'Your message could not be delivered. Please try again.',
      });
      setModalVisible(true);
    }
  };

  const handleTypingIndicator = (data: any) => {
    // Only show typing indicator for this conversation
    if (data.conversationId === conversationId && data.senderId === otherUserId) {
      console.log(`💬 ${friendUsername} is ${data.isTyping ? 'typing' : 'stopped typing'}...`);
      // TODO: Implement typing indicator UI if desired
    }
  };



  // ============================================
  // SEND MESSAGE
  // ============================================
  const sendMessage = async () => {
    if (!inputText.trim() || !wsServiceRef.current) return;

    const messageContent = inputText.trim();
    const tempId = `temp-${Date.now()}`;
    const timestamp = new Date().toISOString();

    // Track this pending message
    pendingMessageRef.current.set(tempId, messageContent);


    // Optimistic UI - show message immediately
    const optimisticMessage: Message = {
      messageId: tempId,
      conversationId,
      senderId: currentUserId,
      receiverId: otherUserId,
      content: messageContent,
      timestamp,
      status: null,
    };

    setMessages(prev => [...prev, optimisticMessage]);
    setInputText('');

    // Auto-scroll
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    // Send via WebSocket using chatService.sendMessage()
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
      pendingMessageRef.current.delete(tempId);
      setMessages(prev => prev.filter(msg => msg.messageId !== tempId));

      console.error('Error sending message:', error);
      setModalContent({
        type: 'error',
        title: 'Error sending message',
        message: error.message || 'An unexpected error occurred while sending your message.',
      });
      setModalVisible(true);
    }
  };

  // ============================================
  // RENDER MESSAGE
  // ============================================
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
          {item.status === null && ' ⏳'}
          {item.status === 'sent' && ' ✓'}
          {item.status === 'delivered' && ' ✓✓'}
        </Text>
      </View>
    );
  };

  // ============================================
  // RENDER
  // ============================================
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
            <Text style={styles.emptyText}>
              No messages yet. Start chatting with {friendUsername}!
            </Text>
          </View>
        }
      />

      {/* Input Area */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder={`Type your message here...`}
          placeholderTextColor="#999"
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendButton,
            !inputText.trim()
              ? styles.sendButtonDisabled
              : styles.sendButtonActive
          ]}
          onPress={sendMessage}
          disabled={!inputText.trim()}
        >
          <Ionicons
            name="send"
            size={width * 0.06}
            color={'#fff'}
          />
        </TouchableOpacity>
      </View>

      <CustomModal
        visible={modalVisible}
        type={modalContent.type}
        title={modalContent.title}
        message={modalContent.message}
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
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: width * 0.025,
    fontSize: width * 0.04,
    color: '#666',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatar: {
    width: width * 0.08,
    height: width * 0.08,
    borderRadius: width * 0.04,
    marginRight: width * 0.02,
  },
  placeholderAvatar: {
    backgroundColor: '#666',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: width * 0.045,
    fontWeight: 'bold',
  },
  messageList: {
    padding: width * 0.025,
    flexGrow: 1,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: width * 0.03,
    borderRadius: width * 0.04,
    marginVertical: width * 0.01,
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
    fontSize: width * 0.028,
    color: '#666',
    marginTop: width * 0.01,
  },
  myTimestamp: {
    color: '#e0d0ff',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: width * 0.25,
  },
  emptyText: {
    fontSize: width * 0.04,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: width * 0.1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: width * 0.025,
    backgroundColor: '#fff',
    borderTopWidth: 1,
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
    width: width * 0.12,
    height: width * 0.12,
    borderRadius: width * 0.06,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonActive: {
    backgroundColor: '#9420ceff',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
});