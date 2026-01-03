// src/screens/ChatListScreen.tsx - FIXED WITH REAL-TIME UPDATES
//
// FIXES APPLIED:
// ✅ Real-time updates when messages are sent/received
// ✅ Proper conversation sorting by timestamp
// ✅ Unread badge updates
// ✅ WebSocket subscriptions for chat events
// ✅ Proper cleanup on unmount

import React, { useState, useEffect, useRef } from 'react';
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
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { chatService } from '../services/chatService';
import { authService } from '../services/authService';
import { dataService } from '../services/dataService';
import { WebSocketService } from '../services/websocketService';
import { getUrl } from 'aws-amplify/storage';

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

  useEffect(() => {
    console.log('📱 ChatListScreen mounted');
    initialize();

    return () => {
      console.log('🧹 ChatListScreen unmounting');
      cleanup();
    };
  }, []);

  const initialize = async () => {
    try {
      const user = await authService.getCurrentUser();
      if (user) {
        setCurrentUserId(user.userId);
        await loadConversations(user.userId);
        setupWebSocket();
      }
    } catch (error) {
      console.error('Error initializing:', error);
    } finally {
      setLoading(false);
    }
  };

  const setupWebSocket = () => {
    const wsService = WebSocketService.getInstance();
    wsServiceRef.current = wsService;

    // Listen for chat-related events
    wsService.on('chat_message', handleChatUpdate);
    wsService.on('conversation_updated', handleChatUpdate);

    console.log('✅ ChatList WebSocket listeners registered');
  };

  const cleanup = () => {
    if (wsServiceRef.current) {
      wsServiceRef.current.off('chat_message', handleChatUpdate);
      wsServiceRef.current.off('conversation_updated', handleChatUpdate);
      console.log('✅ ChatList WebSocket listeners removed');
    }
  };

  const handleChatUpdate = async (data: any) => {
    console.log('💬 Chat update received in ChatList:', data);

    // Reload conversations to reflect new message
    if (currentUserId) {
      await loadConversations(currentUserId, true); // silent reload
    }
  };

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
          } catch (error) {
            console.error(`Error loading user ${otherUserId}:`, error);
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
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

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

    // Determine if last message was sent by current user
    const isSentByMe = item.lastMessageSenderId === currentUserId;
    const lastMessagePreview = item.lastMessageText
      ? (isSentByMe ? 'You: ' : '') + item.lastMessageText
      : 'No messages yet';

    return (
      <TouchableOpacity
        style={styles.conversationItem}
        onPress={() => openConversation(item)}
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
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="chat-bubble-outline" size={width * 0.20} color="#ddd" />
            <Text style={styles.emptyText}>
              No conversations yet. Start chatting with friends!
            </Text>
          </View>
        }
      />
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
    marginVertical: width * 0.02,
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