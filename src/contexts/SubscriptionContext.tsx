// src/contexts/SubscriptionContext.tsx - FULLY FIXED VERSION
//
// FIXES APPLIED:
// 1. ✅ Proper cleanup of WebSocket subscriptions
// 2. ✅ Badge updates correctly when friends are added/removed
// 3. ✅ Friend requests clear properly when accepted
// 4. ✅ Parallel data loading for performance
// 5. ✅ Proper error handling with Promise.allSettled

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { WebSocketService } from '../services/websocketService';
import { chatService } from '@/services/chatService';
import { authService } from '../services/authService';
import { dataService } from '../services/dataService';
import { getUrl } from 'aws-amplify/storage';
import type { Schema } from '../../amplify/data/resource';

type User = Schema['User']['type'];
type FriendRequest = Schema['FriendRequest']['type'];
type UserWithAvatar = User & { avatarUrl?: string };

interface SubscriptionContextType {
  pendingRequests: FriendRequest[];
  sentRequests: FriendRequest[];
  friends: UserWithAvatar[];
  friendsOnline: number;
  unreadMessages: number;
  decrementUnreadByConversation: (conversationId: string, amount: number) => void;
  friendsMap: Map<string, UserWithAvatar>;
  forceReload: () => Promise<void>;
  isWebSocketConnected: boolean;
  isInitialLoading: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  pendingRequests: [],
  sentRequests: [],
  friends: [],
  friendsOnline: 0,
  unreadMessages: 0,
  decrementUnreadByConversation: () => {},
  friendsMap: new Map(),
  forceReload: async () => {},
  isWebSocketConnected: false,
  isInitialLoading: true,
});

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<UserWithAvatar[]>([]);
  const [friendsMap, setFriendsMap] = useState<Map<string, UserWithAvatar>>(new Map());
  const [friendsOnline, setFriendsOnline] = useState<number>(0);
  const [unreadMessages, setUnreadMessages] = useState<number>(0);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const initialLoadComplete = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);
  const wsServiceRef = useRef<WebSocketService | null>(null);

  // ============================================
  // BATCH FETCH PROFILE PICTURES
  // ============================================
  const fetchProfilePicturesBatch = useCallback(async (users: User[]): Promise<UserWithAvatar[]> => {
    const validUsers = users.filter((f): f is User => f !== null && f !== undefined);

    const avatarPromises = validUsers.map(async (user): Promise<UserWithAvatar> => {
      if (!user.avatarKey) return user;

      try {
        const result = await getUrl({ path: user.avatarKey });
        return { ...user, avatarUrl: result.url.toString() };
      } catch {
        return user;
      }
    });

    const results = await Promise.allSettled(avatarPromises);

    return results.map((result, index) =>
      result.status === 'fulfilled' ? result.value : validUsers[index]
    );
  }, []);


  // ============================================
  // UPDATE FRIENDS STATE (single source of truth)
  // ============================================
  const updateFriendsState = useCallback((newFriends: UserWithAvatar[]) => {
    const newMap = new Map<string, UserWithAvatar>();
    newFriends.forEach(friend => {
      if (friend && friend.id) {
        newMap.set(friend.id, friend);
      }
    });

    setFriendsMap(newMap);
    setFriends(newFriends);

    const onlineCount = newFriends.filter(f => f?.isLocationSharing).length;
    setFriendsOnline(onlineCount);

    console.log(`📊 Context state updated: {"online": ${onlineCount}, "total": ${newFriends.length}}`);
  }, []);


  // =====================
  // Fetch total number of Unread messages
  // =====================
  const fetchUnreadMessages = useCallback(async (userId: string) => {

    try {
      const allConversations = await chatService.getUserConversations(userId);

      // calculate the total number of unread messages
      let total = 0;
      allConversations.forEach(conv => {
        userId === conv.participant1Id
          ? (total += conv.unreadCountUser1 ?? 0)
          : (total += conv.unreadCountUser2 ?? 0)
      });

      setUnreadMessages(total);
    } catch (error : any) {
      console.log('Error loading unread: ', error);
    }
  }, []);

  const decrementUnreadByConversation = useCallback((conversationId: string, amount: number) => {
    console.log(`📉 Decrementing unread by ${amount} for conversation ${conversationId}`);
    setUnreadMessages(prev => Math.max(0, prev - amount));
  }, []);


  // ============================================
  // LOAD ALL DATA (parallel for performance)
  // ============================================
  const loadAllData = useCallback(async (): Promise<void> => {
    if (!currentUserIdRef.current) return;

    const userId = currentUserIdRef.current;
    const startTime = Date.now();

    try {
      // Step 1: Load friendships and requests in parallel
      const [friendshipsResult, pendingResult, sentResult] = await Promise.all([
        dataService.listFriends({
          or: [
            { userId: { eq: userId } },
            { friendId: { eq: userId } },
          ],
        }),
        dataService.listFriendRequests({
          and: [
            { receiverId: { eq: userId } },
            { status: { eq: 'PENDING' } },
          ],
        }),
        dataService.listFriendRequests({
          and: [
            { senderId: { eq: userId } },
            { status: { eq: 'PENDING' } },
          ],
        }),
      ]);

      console.log(`📥 Step 1 complete (${Date.now() - startTime}ms): ${friendshipsResult.length} friendships, ${pendingResult.length} requests`);

      setPendingRequests(pendingResult);
      setSentRequests(sentResult);


      // Step 2: Get friend IDs
      const friendIds = friendshipsResult
        .map(f => {
          // Defensive check - ensure friendship record has required fields
          if (!f.userId || !f.friendId) {
            console.warn('⚠️ Invalid friendship record:', f);
            return null;
          }

          // If f.userId is the current user, return friendId, otherwise return userId
          if (f.userId === userId) {
            return f.friendId;
          } else if (f.friendId === userId) {
            return f.userId;
          }

          // If neither matches (shouldn't happen), log warning and return null
          console.warn('⚠️ Friendship record does not involve current user:', f);
          return null;
        })
        .filter((id): id is string =>
          id !== null && id !== undefined && id.trim() !== ''
        );

      console.log(`📥 Step 2 complete: ${friendIds.length} valid friend IDs extracted`);

      // Step 3: Fetch all friend user data in parallel
      const friendDataPromises = friendIds.map(id =>
        dataService.getUser(id).catch(err => {
          console.error(`❌ Error fetching user ${id}:`, err);
          return null;
        })
      );

      const friendDataResults = await Promise.allSettled(friendDataPromises);

      const friendsData: User[] = [];
      friendDataResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value !== null) {
          friendsData.push(result.value);
        } else if (result.status === 'rejected') {
          console.error(`❌ Failed to fetch friend ${friendIds[index]}:`, result.reason);
        }
      });

      console.log(`📥 Step 3 complete (${Date.now() - startTime}ms): ${friendsData.length} friends loaded`);

      // Fetch all unread message count
      fetchUnreadMessages(userId);

      // Update state with friends (without avatars first for speed)
      updateFriendsState(friendsData);
      console.log(`✅ Core data load complete (${Date.now() - startTime}ms)`);

      // Step 4: Load avatars in background (don't block)
      fetchProfilePicturesBatch(friendsData).then(friendsWithAvatars => {
        updateFriendsState(friendsWithAvatars);
        console.log(`📥 Avatars loaded (${Date.now() - startTime}ms)`);
      });

    } catch (error) {
      console.error('❌ Error loading data:', error);
    }
  }, [updateFriendsState, fetchProfilePicturesBatch]);

  // ============================================
  // FORCE RELOAD (public method)
  // ============================================
  const forceReload = useCallback(async () => {
    // Guard mechanism
    if (!currentUserIdRef.current) {
      console.warn('⚠️ Cannot reload - user not initialized');
      return;  // ✅ Add this guard
    }

    console.log('🔄 Force reload triggered');
    await loadAllData();
  }, [loadAllData]);


  // ============================================
  // INITIALIZATION & WEBSOCKET SETUP
  // ============================================
  useEffect(() => {
    let mounted = true;
    let wsService: WebSocketService | null = null;

    const initialize = async () => {
      try {
        const user = await authService.getCurrentUser();
        if (!user || !mounted) return;

        currentUserIdRef.current = user.userId;

        // Start data loading immediately
        const dataLoadPromise = loadAllData();

        // Setup WebSocket
        wsService = WebSocketService.getInstance();
        wsServiceRef.current = wsService;

        // ============================================
        // WEBSOCKET EVENT HANDLERS
        // ============================================

        wsService.on('connected', async () => {
          console.log('✅ WebSocket connected event');
          if (mounted) {
            setIsWebSocketConnected(true);

            // ✅ Calculate initial unread count from all conversations
            try {
              const conversations = await chatService.getUserConversations(currentUserIdRef.current!);
              const totalUnread = conversations.reduce((sum, conv) => {
                const isUser1 = conv.participant1Id === currentUserIdRef.current;
                const count = isUser1 ? (conv.unreadCountUser1 || 0) : (conv.unreadCountUser2 || 0);
                return sum + count;
              }, 0);
              console.log(`📊 Initial unread count: ${totalUnread}`);
              setUnreadMessages(totalUnread);
            } catch (error) {
              console.error('❌ Error calculating initial unread:', error);
            }
          }
        });


        wsService.on('disconnected', () => {
          console.log('❌ WebSocket disconnected');
          if (mounted) {
            setIsWebSocketConnected(false);

            // ✅ ADD RECONNECTION LOGIC
            setTimeout(() => {
              if (mounted && currentUserIdRef.current && wsServiceRef.current) {
                console.log('🔄 Attempting WebSocket reconnection...');
                wsServiceRef.current.connect(currentUserIdRef.current);
              }
            }, 3000);  // Wait 3 seconds before reconnecting
          }
        });

        // Friend location/status updates
        wsService.on('userUpdate', (data: any) => {
          if (!mounted) return;

          setFriends(prev => {
            const index = prev.findIndex(f => f.id === data.id);
            if (index === -1) return prev;

            const newFriends = [...prev];
            newFriends[index] = {
              ...newFriends[index],
              latitude: data.latitude,
              longitude: data.longitude,
              locationUpdatedAt: data.locationUpdatedAt,
              isLocationSharing: data.isLocationSharing ?? prev[index].isLocationSharing,
            };
            updateFriendsState(newFriends);
            return newFriends;
          });
        });

        // ✅ FIX: Friend added - also clear related requests
        wsService.on('friendAdded', async (message: any) => {
          console.log('👥 Friend added via WebSocket:', message);
          if (!mounted) return;

          const data = message.data;
          const newFriendId = data.userId === currentUserIdRef.current ? data.friendId : data.userId;

          // ✅ Add validation
          if (!newFriendId || typeof newFriendId !== 'string') {
            console.error('❌ Invalid friend ID from FRIEND_ADDED event:', message);
            return;
          }

          try {
            const newFriend = await dataService.getUser(newFriendId);
            if (newFriend && mounted) {
              // Add to friends list
              setFriends(prev => {
                if (prev.some(f => f.id === newFriend.id)) return prev;
                const newFriends = [...prev, newFriend];
                updateFriendsState(newFriends);
                return newFriends;
              });

              // Clear any pending/sent requests involving this friend
              setPendingRequests(prev => prev.filter(r =>
                r.senderId !== newFriendId && r.receiverId !== newFriendId
              ));
              setSentRequests(prev => prev.filter(r =>
                r.senderId !== newFriendId && r.receiverId !== newFriendId
              ));

              console.log(`✅ Friend ${newFriend.username} added, related requests cleared`);
            }
          } catch (error) {
            console.error('❌ Error fetching new friend:', error);
          }
        });

        // ✅ FIX: Friend removed - clean up properly
        wsService.on('friendRemoved', (data: any) => {
          console.log('💔 Friend removed via WebSocket:', data);
          if (!mounted) return;

          let friendToRemove: string | null = null;

          if (data.userId === currentUserIdRef.current) {
            friendToRemove = data.friendId;
          } else if (data.friendId === currentUserIdRef.current) {
            friendToRemove = data.userId;
          }

          if (friendToRemove) {
            setFriends(prev => {
              const newFriends = prev.filter(f => f.id !== friendToRemove);
              updateFriendsState(newFriends);
              console.log(`✅ Friend removed from list, ${newFriends.length} friends remaining`);
              return newFriends;
            });
          }
        });

        // Friend request received
        wsService.on('friendRequestReceived', async (data: any) => {
          console.log('📬 Friend request received:', data);
          if (!mounted) return;

          const requests = await dataService.listFriendRequests({
            and: [
              { receiverId: { eq: currentUserIdRef.current } },
              { status: { eq: 'PENDING' } },
            ],
          });
          if (mounted) setPendingRequests(requests);
        });

        // Friend request sent
        wsService.on('friendRequestSent', async (data: any) => {
          console.log('📤 Friend request sent:', data);
          if (!mounted) return;

          const requests = await dataService.listFriendRequests({
            and: [
              { senderId: { eq: currentUserIdRef.current } },
              { status: { eq: 'PENDING' } },
            ],
          });
          if (mounted) setSentRequests(requests);
        });

        // Friend request accepted - clear from sent, add to friends
        wsService.on('friendRequestAccepted', async (data: any) => {
          console.log('✅ Friend request accepted:', data);
          if (!mounted) return;

          // Remove from sent requests (if I was the sender)
          setSentRequests(prev => prev.filter(r => r.id !== data.requestId));

          // Remove from pending requests (if I was the receiver)
          setPendingRequests(prev => prev.filter(r => r.id !== data.requestId));

          // If I'm the receiver, the new friend is the sender
          // If I'm the sender, the new friend is the receiver
          const newFriendId = data.receiverId === currentUserIdRef.current
            ? data.senderId  // I'm the receiver, friend is the sender
            : data.receiverId; // I'm the sender, friend is the receiver

          if (!newFriendId) {
            console.error('❌ Cannot determine new friend ID from:', data);
            return;
          }

          console.log(`👥 Adding new friend: ${newFriendId}`);

          // Fetch the new friend's data
          try {
            const newFriend = await dataService.getUser(newFriendId);
            if (newFriend && mounted) {
              setFriends(prev => {
                // Don't add duplicates
                if (prev.some(f => f.id === newFriend.id)) {
                  console.log('⚠️ Friend already in list');
                  return prev;
                }
                const newFriends = [...prev, newFriend];
                updateFriendsState(newFriends);
                console.log(`✅ Friend ${newFriend.username} added to list`);
                return newFriends;
              });
            }
          } catch (error) {
            console.error('❌ Error fetching new friend data:', error);
          }
        });


        // Listen for changes on the number of unread messages
        wsService.on('conversation_update', (data: any) => {
          console.log('📬 Conversation update for badge:', data);

          if (data.incrementUnread) {
            setUnreadMessages(prev => prev + 1);
          }
        });

        // Friend request deleted (rejected/cancelled)
        wsService.on('friendRequestDeleted', (data: any) => {
          console.log('🗑️ Friend request deleted:', data);
          if (!mounted) return;

          setPendingRequests(prev => prev.filter(r => r.id !== data.requestId));
          setSentRequests(prev => prev.filter(r => r.id !== data.requestId));
        });

        // Update unread number of message

        // Error handling
        wsService.on('error', (error: any) => {
          console.error('❌ WebSocket error:', error);
        });

        // Start WebSocket connection
        wsService.connect(user.userId);

        // Wait for initial data load
        await dataLoadPromise;

        if (mounted) {
          setIsInitialLoading(false);
          initialLoadComplete.current = true;
        }

        console.log('✅ Initialization complete');

      } catch (error) {
        console.error('❌ Initialization error:', error);
        if (mounted) setIsInitialLoading(false);
      }
    };

    initialize();

    // ============================================
    // CLEANUP
    // ============================================
    return () => {
      mounted = false;
      if (wsService) {
        wsService.disconnect();
      }
      wsServiceRef.current = null;
    };
  }, []); // Empty dependency array - only run once on mount

  return (
    <SubscriptionContext.Provider value={{
      pendingRequests,
      sentRequests,
      friends,
      friendsOnline,
      unreadMessages,
      decrementUnreadByConversation,
      friendsMap,
      forceReload,
      isWebSocketConnected,
      isInitialLoading,
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscriptions = () => useContext(SubscriptionContext);