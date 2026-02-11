// src/screens/ChatListScreen.tsx
// STREAMLINED VERSION - Better real-time updates via conversation_update events
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Image,
  RefreshControl
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { chatService } from '../services/chatService';
import { authService } from '../services/authService';
import { dataService } from '../services/dataService';
import { WebSocketService } from '../services/websocketService';
import { useSubscriptions } from '@/contexts/SubscriptionContext';
import { getUrl } from 'aws-amplify/storage';
import CustomModal from '@/components/modal';

const { width } = Dimensions.get('screen');

type ChatConversation = {
  conversationId: string;
  participant1Id: string;
  participant2Id: string;
  lastMessageText: string | null;
  lastMessageTimestamp: string | null;
  lastMessageSenderId: string | null;
  unreadCountUser1: number | null;
  unreadCountUser2: number | null;
};

type ConversationWithUser = ChatConversation & {
  otherUser?: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
};

export default function ChatListScreen() {
  const [conversations, setConversations] = useState<ConversationWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  const wsServiceRef = useRef<WebSocketService | null>(null);
  const currentUserIdRef = useRef<string>('');

  // Current conversation
  const [curConversationId, setCurConversationId] = useState<string>('');

  const { decrementUnreadByConversation } = useSubscriptions();

  // Modal
  const [modalContent, setModalContent] = useState({
    type: 'error' as 'error' | 'success' | 'confirm',
    title: '',
    message: ''
  });
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    console.log('📱 ChatListScreen mounted');
    initialize();

    return () => {
      console.log('🧹 ChatListScreen unmounting');
      cleanup();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      console.log('🔄 ChatListScreen focused, reloading conversations');
      loadConversations(currentUserIdRef.current);
    }, [])
  )

  const initialize = async () => {
    try {
      const user = await authService.getCurrentUser();
      if (user) {
        setCurrentUserId(user.userId);
        currentUserIdRef.current = user.userId;
        await loadConversations(user.userId);
        setupWebSocket();
      }
    } catch (error : any) {
      setModalContent({
        type: 'error',
        title: 'Initialization Error',
        message: error.message || 'An error has occured during initialization.'
      });
      setModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const setupWebSocket = () => {
    const wsService = WebSocketService.getInstance();
    wsServiceRef.current = wsService;

    // Listen for conversation updates (new messages)
    wsService.on('conversation_update', handleConversationUpdate);
    wsService.on('new_message', handleNewMessage);
    wsService.on('message_sent', handleMessageSent);

    console.log('✅ ChatList WebSocket listeners registered');
  };

  const cleanup = () => {
    if (wsServiceRef.current) {
      wsServiceRef.current.off('conversation_update', handleConversationUpdate);
      wsServiceRef.current.off('new_message', handleNewMessage);
      wsServiceRef.current.off('message_sent', handleMessageSent);
      console.log('✅ ChatList WebSocket listeners removed');
    }
  };

  // Handle conversation_update events (optimized - no full reload)
  const handleConversationUpdate = useCallback((data: any) => {
    console.log('📋 Conversation update received:', data);

    setConversations(prev => {
      const index = prev.findIndex(c => c.conversationId === data.conversationId);

      if (index === -1) {
        // New conversation - need to load it
        console.log('🆕 New conversation, triggering reload');
        loadConversations(currentUserIdRef.current, true);
        return prev;
      }

      // Update existing conversation
      const updated = [...prev];
      const conv = updated[index];

      updated[index] = {
        ...conv,
        lastMessageText: data.lastMessageText || conv.lastMessageText,
        lastMessageTimestamp: data.lastMessageTimestamp || conv.lastMessageTimestamp,
        lastMessageSenderId: data.lastMessageSenderId || conv.lastMessageSenderId,
        // Increment unread if specified and message is from other user
        unreadCountUser1: conv.participant1Id === currentUserIdRef.current && data.incrementUnread
          ? (conv.unreadCountUser1 || 0) + 1
          : conv.unreadCountUser1,
        unreadCountUser2: conv.participant2Id === currentUserIdRef.current && data.incrementUnread
          ? (conv.unreadCountUser2 || 0) + 1
          : conv.unreadCountUser2,
      };

      // Re-sort by timestamp (newest first)
      updated.sort((a, b) => {
        const timeA = a.lastMessageTimestamp || '';
        const timeB = b.lastMessageTimestamp || '';
        return timeB.localeCompare(timeA);
      });

      console.log('✅ Conversation updated in list');
      return updated;
    });
  }, []);

  // Handle new_message events (for when we receive a message)
  const handleNewMessage = useCallback((data: any) => {
    console.log('💬 New message received in ChatList:', data);

    // Update the conversation in the list
    setConversations(prev => {
      const index = prev.findIndex(c => c.conversationId === data.conversationId);

      if (index === -1) {
        // New conversation - need to load it
        console.log('🆕 New conversation from message, triggering reload');
        loadConversations(currentUserIdRef.current, true);
        return prev;
      }

      // Update existing conversation
      const updated = [...prev];
      const conv = updated[index];
      const isUser1 = conv.participant1Id === currentUserIdRef.current;

      updated[index] = {
        ...conv,
        lastMessageText: data.content,
        lastMessageTimestamp: data.timestamp,
        lastMessageSenderId: data.senderId,
        // Increment unread count for this user
        unreadCountUser1: isUser1 ? (conv.unreadCountUser1 || 0) + 1 : conv.unreadCountUser1,
        unreadCountUser2: !isUser1 ? (conv.unreadCountUser2 || 0) + 1 : conv.unreadCountUser2,
      };

      // Re-sort by timestamp
      updated.sort((a, b) => {
        const timeA = a.lastMessageTimestamp || '';
        const timeB = b.lastMessageTimestamp || '';
        return timeB.localeCompare(timeA);
      });

      return updated;
    });
  }, []);

  // Handle message_sent events (for when we send a message)
  const handleMessageSent = useCallback((data: any) => {
    console.log('📤 Message sent update in ChatList:', data);

    // Update the conversation preview
    setConversations(prev => {
      const index = prev.findIndex(c => c.conversationId === data.conversationId);

      if (index === -1) return prev;

      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        lastMessageText: data.content,
        lastMessageTimestamp: data.timestamp,
        lastMessageSenderId: currentUserIdRef.current,
      };

      // Re-sort by timestamp
      updated.sort((a, b) => {
        const timeA = a.lastMessageTimestamp || '';
        const timeB = b.lastMessageTimestamp || '';
        return timeB.localeCompare(timeA);
      });

      return updated;
    });
  }, []);

  const loadConversations = async (userId: string, silent: boolean = false) => {
    if (!silent) setLoading(true);

    try {
      const convos = await chatService.getUserConversations(userId);

      // Load user data for each conversation
      const convosWithUsers = await Promise.all(
        convos.map(async (convo) => {
          const otherUserId = convo.participant1Id === userId
            ? convo.participant2Id
            : convo.participant1Id;

          try {
            const otherUser = await dataService.getUser(otherUserId);
            let avatarUrl: string | undefined;

            if (otherUser?.avatarKey) {
              try {
                const result = await getUrl({
                  path: otherUser.avatarKey,
                  options: {
                    validateObjectExistence: true,
                    expiresIn: 3600,
                  },
                });
                avatarUrl = result.url.toString();
              } catch {
                avatarUrl = undefined;
              }
            }

            return {
              ...convo,
              otherUser: {
                id: otherUserId,
                username: otherUser?.username || 'Unknown User',
                avatarUrl,
              },
            };
          } catch (error: any) {
            setModalContent({
              type: 'error',
              title: 'User Loading Error',
              message: error.message || 'An error(s) has occured while attempting to load user information'
            });
            setModalVisible(true);
            console.log(`Error loading user ${otherUserId}:`, error);
            return {
              ...convo,
              otherUser: {
                id: otherUserId,
                username: 'Unknown User',
              },
            };
          }
        })
      );

      setConversations(convosWithUsers);
    } catch (error : any) {
      setModalContent({
        type: 'error',
        title: 'Loading Error',
        message: error.message || 'An error has occured while attempting to load conversation'
      });
      setModalVisible(true);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // On a long press, call up modal to confirm 9ur deletion.
  const deleteConversation = async (conversation: ConversationWithUser) => {
    setModalContent({
      type: 'confirm',
      title: 'Conversation Deletion',
      message: `Confirm to delete conversation with ${conversation.otherUser?.username}?`
    })
    setModalVisible(true);
    setCurConversationId(conversation.conversationId);
    return;
  }

  const closeConversation = async () => {
    try {
      const curConvo = chatService.getConversation(curConversationId);

      const curUnread = chatService.getUnreadCount(curConvo, currentUserId);

      if (curUnread > 0) {
        decrementUnreadByConversation(curConversationId, curUnread);
      }

      await chatService.deleteConversationAndMessages(curConversationId);

      setModalVisible(false);

      setConversations(prev =>
        prev.filter(c => c.conversationId !== curConversationId)
      );

      setCurConversationId('');
      console.log('✅ Conversation deleted successfully');

    } catch (error : any) {
      setModalContent({
        type: 'error',
        title: 'Deletion Error',
        message: error.message || 'An error has occured while attempting close the conversation'
      });
      setModalVisible(true);
    }
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await loadConversations(currentUserId);
    setRefreshing(false);
  };

  const openConversation = (conversation: ConversationWithUser) => {
    if (!conversation.otherUser) return;

    router.push({
      pathname: `/chats/${conversation.conversationId}`,
      params: {
        otherUserId: conversation.otherUser.id,
      },
    });
  };

  const renderConversation = ({ item }: { item: ConversationWithUser }) => {
    if (!item.otherUser) return null;

    const unreadCount = chatService.getUnreadCount(item, currentUserId);
    const hasUnread = unreadCount > 0;

    console.log(`Current unread count: ${unreadCount} for conversation ${item.conversationId}`);

    // Determine if last message was sent by current user
    const isSentByMe = item.lastMessageSenderId === currentUserId;
    const lastMessagePreview = item.lastMessageText
      ? (isSentByMe ? 'You: ' : '') + item.lastMessageText
      : 'No messages yet';

    return (
      <TouchableOpacity
        style={styles.conversationItem}
        onPress={() => openConversation(item)}
        onLongPress={() => deleteConversation(item)}
      >
        <View style={styles.conversationInfo}>
          {item.otherUser.avatarUrl ? (
            <Image
              source={{ uri: item.otherUser.avatarUrl }}
              style={styles.avatar}
            />
          ) : (
            <View style={[styles.avatar, styles.placeholderAvatar]}>
              <MaterialIcons name="person" size={width * 0.08} color="#fff" />
            </View>
          )}

          <View style={styles.conversationDetails}>
            <Text style={[
              styles.username,
              hasUnread && styles.unreadUsername
            ]}>
              {item.otherUser.username}
            </Text>
            <Text
              style={[
                styles.lastMessage,
                hasUnread && styles.unreadMessage
              ]}
              numberOfLines={1}
            >
              {lastMessagePreview}
            </Text>
          </View>
        </View>

        {hasUnread && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#9420ceff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={conversations}
        renderItem={renderConversation}
        keyExtractor={(item) => item.conversationId}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{
          paddingTop: width * 0.03,
          paddingBottom: width * 0.03,
        }}
        ItemSeparatorComponent={() => <View style={{ height: width * 0.015 }} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="chat-bubble-outline" size={width * 0.20} color="#ddd" />
            <Text style={styles.emptyText}>
              No conversations yet. Start chatting with friends!
            </Text>
          </View>
        }
      />

      <CustomModal
        type={modalContent.type}
        visible={modalVisible}
        title={modalContent.title}
        message={modalContent.message}
        onClose={() => setModalVisible(false)}
        onConfirm={() => closeConversation()}
      >
      </CustomModal>
    </View>
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
  conversationItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    borderColor: '#9420ceff',
    borderWidth: width * 0.002,
    padding: width * 0.03,
    marginHorizontal: width * 0.03,
    borderRadius: width * 0.02,
  },
  conversationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: width * 0.15,
    height: width * 0.15,
    borderRadius: width * 0.075,
  },
  placeholderAvatar: {
    backgroundColor: '#9420ceff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  conversationDetails: {
    marginLeft: width * 0.030,
    flex: 1,
  },
  username: {
    fontSize: width * 0.04,
    fontWeight: '600',
    color: '#333',
  },
  unreadUsername: {
    fontWeight: 'bold',
    color: '#000',
  },
  lastMessage: {
    fontSize: width * 0.035,
    color: '#666',
    marginTop: width * 0.005,
  },
  unreadMessage: {
    fontWeight: '600',
    color: '#000',
  },
  unreadBadge: {
    backgroundColor: '#9420ceff',
    borderRadius: width * 0.03,
    minWidth: width * 0.06,
    height: width * 0.06,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: width * 0.01,
  },
  unreadText: {
    color: '#fff',
    fontSize: width * 0.03,
    fontWeight: 'bold',
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
    marginTop: width * 0.025,
    textAlign: 'center',
    paddingHorizontal: width * 0.1,
  },
});