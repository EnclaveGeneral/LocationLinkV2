// src/screens/ChatScreen.tsx
// STREAMLINED VERSION - Fixed init order, focus/blur typing, mark delivered on open
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
  status?: 'sent' | 'delivered' | null;
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

  // Typing indicator state
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInputFocusedRef = useRef(false);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState({
    type: 'error' as 'error' | 'success' | 'confirm',
    title: '',
    message: '',
  });

  const flatListRef = useRef<FlatList>(null);
  const wsServiceRef = useRef<WebSocketService | null>(null);
  const currentUserIdRef = useRef<string>('');

  // Track pending messages for optimistic UI (tempId -> content)
  const pendingMessageRef = useRef<Map<string, string>>(new Map());

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
      currentUserIdRef.current = user.userId;

      // Load friend data first (for header)
      await loadFriendData(otherUserId);

      // Load conversation data - returns the conversation object
      const conv = await loadConversation(conversationId);

      // Setup WebSocket BEFORE loading messages
      setupWebSocket();

      // Load messages and mark as delivered - pass conversation directly
      await loadMessages(user.userId, conv);

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

  const loadConversation = async (convId: string): Promise<any> => {
    try {
      const conv = await chatService.getConversation(convId);
      return conv;
    } catch (error) {
      console.error('Error loading conversation:', error);
      return null;
    }
  };

  // Load messages and mark as delivered - accepts conversation as parameter
  const loadMessages = async (userId: string, conversation: any) => {
    try {
      console.log('📥 Loading messages for conversation:', conversationId);

      const data = await chatService.getConversationMessages(conversationId);
      console.log('📥 Messages from database:', data.length);

      // Filter valid messages
      const validMessages = data
        .filter((msg: any) => msg !== null && msg !== undefined)
        .filter((msg: any) => msg.messageId && msg.content && msg.timestamp);

      console.log(`✅ Valid messages: ${validMessages.length}`);

      setMessages(validMessages);

      // Mark conversation as read (resets unread badge)
      if (conversation) {
        await chatService.markConversationAsRead(conversationId, userId, conversation);
        console.log("✅ Conversation marked as read");
      }

      // Mark other user's messages as delivered
      const undeliveredMessages = validMessages
        .filter((msg: any) => msg.senderId === otherUserId && msg.status !== 'delivered')
        .map((msg: any) => msg.messageId);

      if (undeliveredMessages.length > 0) {
        console.log(`📖 Marking ${undeliveredMessages.length} messages as delivered`);

        // Use WebSocket method if available, otherwise use GraphQL mutation
        if (wsServiceRef.current?.isConnected()) {
          chatService.sendMarkDelivered(
            wsServiceRef.current,
            undeliveredMessages,
            conversationId,
            userId
          );
        } else {
          await chatService.markMessagesDelivered(undeliveredMessages);
        }
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
    wsService.on('message_delivered', handleMessageDelivered);

    console.log('✅ WebSocket listeners registered for chat');
  };

  const cleanup = () => {
    // Send typing stop if we were typing
    if (isInputFocusedRef.current && wsServiceRef.current && currentUserIdRef.current) {
      chatService.sendTypingStop(
        wsServiceRef.current,
        conversationId,
        currentUserIdRef.current,
        otherUserId
      );
    }

    // Remove WebSocket listeners
    if (wsServiceRef.current) {
      wsServiceRef.current.off('new_message', handleNewMessage);
      wsServiceRef.current.off('message_sent', handleMessageSent);
      wsServiceRef.current.off('message_error', handleMessageError);
      wsServiceRef.current.off('typing_indicator', handleTypingIndicator);
      wsServiceRef.current.off('message_delivered', handleMessageDelivered);
      console.log('✅ WebSocket listeners removed');
    }

    // Clear typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  };

  // ============================================
  // WEBSOCKET EVENT HANDLERS
  // ============================================
  const handleNewMessage = async (data: any) => {
    console.log('📨 New message received via WebSocket:', data);

    // Only process messages for THIS conversation
    if (data.conversationId !== conversationId) {
      console.log('⏭️ Message for different conversation, ignoring');
      return;
    }

    // Check if message is from the other person (not our own echo)
    if (data.senderId === currentUserIdRef.current) {
      console.log('⏭️ Message is from self, already in UI');
      return;
    }

    console.log('💬 New message received for this conversation');

    const newMessage: Message = {
      messageId: data.messageId,
      conversationId: data.conversationId,
      senderId: data.senderId,
      receiverId: data.receiverId || currentUserIdRef.current,
      content: data.content,
      timestamp: data.timestamp || new Date().toISOString(),
      status: 'delivered', // We received it, so it's delivered
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

    // Mark this message as delivered via WebSocket
    if (wsServiceRef.current) {
      chatService.sendMarkDelivered(
        wsServiceRef.current,
        [data.messageId],
        conversationId,
        currentUserIdRef.current
      );
    }
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
    // Only show typing indicator for this conversation from the other user
    if (data.conversationId === conversationId && data.senderId === otherUserId) {
      console.log(`💬 ${friendUsername} is ${data.isTyping ? 'typing' : 'stopped typing'}...`);

      setIsOtherUserTyping(data.isTyping);

      // Auto-clear typing indicator after 30 seconds as safety fallback
      if (data.isTyping) {
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        typingTimeoutRef.current = setTimeout(() => {
          setIsOtherUserTyping(false);
        }, 30000);
      } else {
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
      }
    }
  };

  const handleMessageDelivered = (data: any) => {
    console.log('✅ Message(s) delivered:', data);

    // Update local UI state
    setMessages(prev => prev.map(msg => {
      const updated = data.messages?.find((m: any) => m.messageId === msg.messageId);
      if (updated && updated.status === 'delivered') {
        return { ...msg, status: 'delivered' as const };
      }
      return msg;
    }));
  };

  // ============================================
  // INPUT HANDLERS
  // ============================================
  const handleInputFocus = () => {
    console.log('⌨️ TextInput focused');
    isInputFocusedRef.current = true;

    if (wsServiceRef.current && currentUserIdRef.current) {
      chatService.sendTypingStart(
        wsServiceRef.current,
        conversationId,
        currentUserIdRef.current,
        otherUserId
      );
    }
  };

  const handleInputBlur = () => {
    console.log('⌨️ TextInput blurred');
    isInputFocusedRef.current = false;

    if (wsServiceRef.current && currentUserIdRef.current) {
      chatService.sendTypingStop(
        wsServiceRef.current,
        conversationId,
        currentUserIdRef.current,
        otherUserId
      );
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

    // Send via WebSocket
    try {
      chatService.sendMessage(
        wsServiceRef.current,
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
        message: error.message || 'An unexpected error occurred while sending your message. Please try again.',
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
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          })}
          {isMine && item.status === null && ' Sending...'}
          {isMine && item.status === 'sent' && ' Sent'}
          {isMine && item.status === 'delivered' && ' Read'}
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

      {/* Typing Indicator */}
      {isOtherUserTyping && (
        <View style={styles.typingIndicatorContainer}>
          <View style={styles.typingBubble}>
            <View style={styles.typingDots}>
              <View style={[styles.dot, styles.dot1]} />
              <View style={[styles.dot, styles.dot2]} />
              <View style={[styles.dot, styles.dot3]} />
            </View>
          </View>
          <Text style={styles.typingText}>{friendUsername} is typing...</Text>
        </View>
      )}

      {/* Input Area */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder="Type your message here..."
          placeholderTextColor="#999"
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            !inputText.trim() ? styles.sendButtonDisabled : styles.sendButtonActive
          ]}
          onPress={sendMessage}
          disabled={!inputText.trim()}
        >
          <Ionicons
            name="send"
            size={width * 0.06}
            color="#fff"
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
  typingIndicatorContainer: {
    paddingHorizontal: width * 0.025,
    paddingVertical: width * 0.015,
    flexDirection: 'row',
    alignItems: 'center',
  },
  typingBubble: {
    backgroundColor: '#e5e5ea',
    borderRadius: width * 0.04,
    paddingHorizontal: width * 0.03,
    paddingVertical: width * 0.02,
    marginRight: width * 0.02,
  },
  typingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: width * 0.01,
  },
  dot: {
    width: width * 0.015,
    height: width * 0.015,
    borderRadius: width * 0.0075,
    backgroundColor: '#999',
  },
  dot1: {
    opacity: 0.4,
  },
  dot2: {
    opacity: 0.6,
  },
  dot3: {
    opacity: 0.8,
  },
  typingText: {
    fontSize: width * 0.032,
    color: '#666',
    fontStyle: 'italic',
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