// src/contexts/SubscriptionContext.tsx - OPTIMIZED VERSION
// Key changes:
// 1. Parallel data loading instead of sequential
// 2. Batch avatar fetching
// 3. Defer non-critical data loading
// 4. Add loading states for better UX

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { WebSocketService } from '../services/websocketService';
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
  friendsMap: Map<string, UserWithAvatar>;
  forceReload: () => Promise<void>;
  isWebSocketConnected: boolean;
  isInitialLoading: boolean; // NEW: Track initial load state
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  pendingRequests: [],
  sentRequests: [],
  friends: [],
  friendsOnline: 0,
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
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Track if initial load has completed
  const initialLoadComplete = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);

  // OPTIMIZED: Batch fetch profile pictures with Promise.allSettled (don't fail on single error)
  const fetchProfilePicturesBatch = useCallback(async (users: User[]): Promise<UserWithAvatar[]> => {
    const validUsers = users.filter((f): f is User => f !== null && f !== undefined);

    // Fetch all avatar URLs in parallel
    const avatarPromises = validUsers.map(async (user): Promise<UserWithAvatar> => {
      if (!user.avatarKey) return user;

      try {
        const result = await getUrl({ path: user.avatarKey });
        return { ...user, avatarUrl: result.url.toString() };
      } catch {
        // Silently fail for individual avatars - don't block
        return user;
      }
    });

    // Use allSettled to not fail if one avatar fetch fails
    const results = await Promise.allSettled(avatarPromises);

    return results.map((result, index) =>
      result.status === 'fulfilled' ? result.value : validUsers[index]
    );
  }, []);

  const updateFriendsState = useCallback((newFriends: UserWithAvatar[]) => {
    const validFriends = newFriends.filter((f): f is UserWithAvatar => f !== null && f !== undefined);

    const newMap = new Map<string, UserWithAvatar>();
    validFriends.forEach(f => newMap.set(f.id, f));

    const online = validFriends.filter(f => f.isLocationSharing === true).length;

    console.log('📊 Context state updated:', {
      total: validFriends.length,
      online: online,
    });

    setFriends(validFriends);
    setFriendsMap(newMap);
    setFriendsOnline(online);
  }, []);

  // OPTIMIZED: Load all data in parallel, show friends immediately, load avatars async
  const loadAllData = useCallback(async (userId: string, isInitial: boolean = false) => {
    console.log('🔄 Loading all data...', isInitial ? '(initial)' : '(refresh)');
    const startTime = Date.now();

    try {
      // STEP 1: Fetch friendships and requests IN PARALLEL
      const [friendships, requests] = await Promise.all([
        dataService.listFriends({
          or: [
            { userId: { eq: userId } },
            { friendId: { eq: userId } },
          ],
        }),
        dataService.listFriendRequests({
          or: [
            { receiverId: { eq: userId } },
            { senderId: { eq: userId } },
          ],
        }),
      ]);

      console.log(`📥 Step 1 complete (${Date.now() - startTime}ms): ${friendships.length} friendships, ${requests.length} requests`);

      // STEP 2: Process requests immediately (no network calls)
      const received = requests.filter(r => r.receiverId === userId && r.status === 'PENDING');
      const sent = requests.filter(r => r.senderId === userId && r.status === 'PENDING');
      setPendingRequests(received);
      setSentRequests(sent);

      // STEP 3: Get friend IDs
      const friendIds = friendships.map(f => f.userId === userId ? f.friendId : f.userId);

      if (friendIds.length === 0) {
        updateFriendsState([]);
        return;
      }

      // STEP 4: Fetch ALL friend data in parallel (not sequential!)
      const friendsDataPromises = friendIds.map(id => dataService.getUser(id));
      const friendsData = await Promise.all(friendsDataPromises);

      const validFriends = friendsData.filter(f => f !== null && f !== undefined) as User[];

      console.log(`📥 Step 4 complete (${Date.now() - startTime}ms): ${validFriends.length} friends loaded`);

      // STEP 5: Show friends IMMEDIATELY without avatars
      updateFriendsState(validFriends);

      // STEP 6: Fetch avatars in background (don't block!)
      // This allows the map to render while avatars load
      fetchProfilePicturesBatch(validFriends).then(friendsWithAvatars => {
        updateFriendsState(friendsWithAvatars);
        console.log(`📥 Avatars loaded (${Date.now() - startTime}ms)`);
      });

      console.log(`✅ Core data load complete (${Date.now() - startTime}ms)`);

    } catch (error) {
      console.error('❌ Load data error:', error);
    }
  }, [fetchProfilePicturesBatch, updateFriendsState]);

  const forceReload = useCallback(async () => {
    if (!currentUserIdRef.current) {
      const user = await authService.getCurrentUser();
      if (!user) return;
      currentUserIdRef.current = user.userId;
    }
    await loadAllData(currentUserIdRef.current, false);
  }, [loadAllData]);

  useEffect(() => {
    console.log('🔵 SubscriptionContext - Initializing...');
    let wsService: WebSocketService | null = null;
    let mounted = true;

    const initialize = async () => {
      try {
        // Get user first
        const user = await authService.getCurrentUser();
        if (!user || !mounted) {
          setIsInitialLoading(false);
          return;
        }

        console.log('✅ User found:', user.userId);
        currentUserIdRef.current = user.userId;

        // OPTIMIZATION: Start loading data AND WebSocket connection in parallel
        const dataLoadPromise = loadAllData(user.userId, true);

        // Setup WebSocket (don't await - let it connect while data loads)
        wsService = WebSocketService.getInstance();

        // Set up event listeners
        wsService.on('connected', async () => {
          console.log('✅ WebSocket connected event');
          if (mounted) setIsWebSocketConnected(true);

          // Only force reload on RECONNECT (not initial connect)
          if (initialLoadComplete.current && currentUserIdRef.current) {
            await loadAllData(currentUserIdRef.current, false);
          }
        });

        wsService.on('disconnected', () => {
          console.log('🔴 WebSocket disconnected');
          if (mounted) setIsWebSocketConnected(false);
        });

        wsService.on('userUpdate', (updatedUser: User) => {
          console.log('🔄 Real-time user update:', updatedUser.username);
          setFriends(prev => {
            const index = prev.findIndex(f => f.id === updatedUser.id);
            if (index !== -1) {
              const newFriends = [...prev];
              // Preserve existing avatarUrl if present
              newFriends[index] = { ...updatedUser, avatarUrl: prev[index].avatarUrl };
              updateFriendsState(newFriends);
              return newFriends;
            }
            return prev;
          });
        });

        wsService.on('friendAdded', async (data: any) => {
          console.log('👥 Friend added via WebSocket:', data);
          const newFriendId = data.userId === currentUserIdRef.current ? data.friendId : data.userId;

          const newFriend = await dataService.getUser(newFriendId);
          if (newFriend && mounted) {
            setFriends(prev => {
              if (prev.some(f => f.id === newFriend.id)) return prev;
              const newFriends = [...prev, newFriend];
              updateFriendsState(newFriends);
              return newFriends;
            });

            // Also clear any pending requests between these users
            setPendingRequests(prev => prev.filter(r =>
              !(r.senderId === newFriendId || r.receiverId === newFriendId)
            ));
            setSentRequests(prev => prev.filter(r =>
              !(r.senderId === newFriendId || r.receiverId === newFriendId)
            ));
          }
        });

        wsService.on('friendRemoved', (data: any) => {
          console.log('💔 Friend removed via WebSocket:', data);
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
              return newFriends;
            });
          }
        });

        wsService.on('friendRequestReceived', async (data: any) => {
          console.log('📬 Friend request received:', data);
          const requests = await dataService.listFriendRequests({
            receiverId: { eq: currentUserIdRef.current },
            status: { eq: 'PENDING' }
          });
          if (mounted) setPendingRequests(requests);
        });

        wsService.on('friendRequestSent', async (data: any) => {
          console.log('📤 Friend request sent:', data);
          const requests = await dataService.listFriendRequests({
            senderId: { eq: currentUserIdRef.current },
            status: { eq: 'PENDING' }
          });
          if (mounted) setSentRequests(requests);
        });

        wsService.on('friendRequestAccepted', async (data: any) => {
          console.log('✅ Friend request accepted:', data);
          setSentRequests(prev => prev.filter(r => r.id !== data.requestId));

          const newFriend = await dataService.getUser(data.receiverId);
          if (newFriend && mounted) {
            setFriends(prev => {
              if (prev.some(f => f.id === newFriend.id)) return prev;
              const newFriends = [...prev, newFriend];
              updateFriendsState(newFriends);
              return newFriends;
            });
          }
        });

        wsService.on('friendRequestDeleted', (data: any) => {
          console.log('🗑️ Friend request deleted:', data);
          setPendingRequests(prev => prev.filter(r => r.id !== data.requestId));
          setSentRequests(prev => prev.filter(r => r.id !== data.requestId));
        });

        wsService.on('error', (error: any) => {
          console.error('❌ WebSocket error:', error);
        });

        // Start WebSocket connection (don't await)
        wsService.connect(user.userId);

        // Wait for initial data load to complete
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

    return () => {
      mounted = false;
      if (wsService) {
        wsService.disconnect();
      }
    };
  }, [loadAllData, updateFriendsState]);

  return (
    <SubscriptionContext.Provider value={{
      pendingRequests,
      sentRequests,
      friends,
      friendsOnline,
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