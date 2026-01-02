// src/screens/ChatListScreen.tsx
import React, { useState, useEffect } from 'react';
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
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { chatService } from '../services/chatService';
import { authService } from '../services/authService';
import { dataService } from '../services/dataService';
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
    username: string;
    avatarUrl?: string;
  };
};

export default function ChatListScreen() {
  const [conversations, setConversations] = useState<ConversationWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    try {
      const user = await authService.getCurrentUser();
      if (user) {
        setCurrentUserId(user.userId);
        await loadConversations(user.userId);
      }
    } catch (error) {
      console.error('Error initializing:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadConversations = async (userId: string) => {
    try {
      const convos = await chatService.getUserConversations(userId);

      const convosWithUsers = await Promise.all(
        convos.map(async (convo) => {
          const otherUserId = convo.participant1Id === userId
            ? convo.participant2Id
            : convo.participant1Id;

          try {
            const otherUserData = await dataService.getUser(otherUserId);

            if (!otherUserData) {
              return {
                ...convo,
                otherUser: { username: otherUserId }
              };
            }

            let avatarUrl: string | undefined;
            if (otherUserData.avatarKey) {
              try {
                const result = await getUrl({ path: otherUserData.avatarKey });
                avatarUrl = result.url.toString();
              } catch (err) {
                console.log('Could not load avatar for:', otherUserData.username);
              }
            }

            return {
              ...convo,
              otherUser: {
                username: otherUserData.username,
                avatarUrl,
              }
            };
          } catch (err) {
            console.error('Error fetching user data:', err);
            return {
              ...convo,
              otherUser: { username: otherUserId }
            };
          }
        })
      );

      setConversations(convosWithUsers);
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (currentUserId) {
      await loadConversations(currentUserId);
    }
    setRefreshing(false);
  };

  const getUnreadCount = (conversation: ChatConversation) => {
    return conversation.participant1Id === currentUserId
      ? conversation.unreadCountUser1
      : conversation.unreadCountUser2;
  };

  const renderConversation = ({ item }: { item: ConversationWithUser }) => {
    const unreadCount = getUnreadCount(item) || 0;
    const username = item.otherUser?.username || 'Unknown User';
    const avatarUrl = item.otherUser?.avatarUrl;

    const otherUserId = item.participant1Id === currentUserId
      ? item.participant2Id
      : item.participant1Id;

    return (
      <TouchableOpacity
        style={styles.conversationItem}
        onPress={() => {
          router.push({
            pathname: `/chats/${item.conversationId}`,
            params: { otherUserId }
          });
        }}
        activeOpacity={0.7}
      >
        <View style={styles.conversationInfo}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatar}
            />
          ) : (
            <Ionicons name="person-circle" size={width * 0.15} color="#9420ceff" />
          )}

          <View style={styles.conversationDetails}>
            <Text style={styles.username}>{username}</Text>
            <Text style={styles.lastMessage} numberOfLines={1}>
              {item.lastMessageText || 'No messages yet'}
            </Text>
          </View>
        </View>

        {unreadCount > 0 && (
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
  conversationDetails: {
    marginLeft: width * 0.030,
    flex: 1,
  },
  username: {
    fontSize: width * 0.035,
    fontWeight: 'bold',
  },
  lastMessage: {
    fontSize: width * 0.030,
    color: '#666',
    marginTop: width * 0.005,
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