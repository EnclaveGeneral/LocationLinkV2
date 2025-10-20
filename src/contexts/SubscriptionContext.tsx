// src/contexts/SubscriptionContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { WebSocketService } from '../services/websocketService';
import { SubscriptionService } from '../services/subscriptionService';
import { authService } from '../services/authService';
import { dataService } from '../services/dataService';
import type { Schema } from '../../amplify/data/resource';

type User = Schema['User']['type'];
type FriendRequest = Schema['FriendRequest']['type'];
// type Friend = Schema['Friend']['type'];

interface SubscriptionContextType {
  pendingRequests: FriendRequest[];
  sentRequests: FriendRequest[];
  friends: User[];
  friendsOnline: number;
  friendsMap: Map<string, User>;
  forceReload: () => Promise<void>;
  isWebSocketConnected: boolean// Add websocket port access
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  pendingRequests: [],
  sentRequests: [],
  friends: [],
  friendsOnline: 0,
  friendsMap: new Map(),
  forceReload: async () => {},
  isWebSocketConnected: false,
});

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [friendsMap, setFriendsMap] = useState<Map<string, User>>(new Map());
  const [friendsOnline, setFriendsOnline] = useState<number>(0);
  // Add new websockeets state for use
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);

  const updateFriendsState = (newFriends: User[]) => {
    const validFriends = newFriends.filter((f): f is User => f !== null && f !== undefined);

    const newMap = new Map<string, User>();
    validFriends.forEach(f => newMap.set(f.id, f));

    const online = validFriends.filter(f => f.isLocationSharing === true).length;

    console.log('📊 Context state updated:', {
      total: validFriends.length,
      online: online,
      friendIds: validFriends.map(f => `${f.username} (${f.id})`),
    });

    setFriends(validFriends);
    setFriendsMap(newMap);
    setFriendsOnline(online);
  };

  const forceReload = async () => {
    console.log('🔄 Force reloading all data...');
    try {
      const user = await authService.getCurrentUser();
      if (!user) {
        console.log('⚠️ No user for force reload');
        return;
      }

      // Load current friends
      const friendships = await dataService.listFriends({
        or: [
          { userId: { eq: user.userId } },
          { friendId: { eq: user.userId } },
        ],
      });

      console.log('📥 Force reload - friendships found:', friendships.length);

      const friendIds = friendships.map(f =>
        f.userId === user.userId ? f.friendId : f.userId
      );

      console.log('📥 Force reload - friend IDs:', friendIds);

      const friendsData = await Promise.all(
        friendIds.map(id => dataService.getUser(id))
      );

      updateFriendsState(friendsData.filter((f): f is User => f !== null));

      // Load friend requests
      const requests = await dataService.listFriendRequests({
        or: [
          { receiverId: { eq: user.userId } },
          { senderId: { eq: user.userId } },
        ],
      })

      const received = requests.filter( r => r.receiverId === user.userId && r.status === 'PENDING');
      const sent = requests.filter( r => r.senderId === user.userId && r.status === 'PENDING');

      setPendingRequests(received);
      setSentRequests(sent);

      console.log('✅ Force reload complete');
    } catch (error) {
      console.error('❌ Force reload error:', error);
    }
  };

  useEffect(() => {
    console.log('🔵 SubscriptionContext - Initializing...');
    let wsService: WebSocketService | null = null;
    let currentUserId: string | null = null;

    const setupWebSocket = async () => {
      try {
        const user = await authService.getCurrentUser();
        if (!user) {
          console.log('⚠️ No user found');
          return;
        }

        console.log('✅ User found:', user.userId);
        currentUserId = user.userId;

        // Load initial set of data
        await forceReload();

        // Connect to WebSocket
        wsService = WebSocketService.getInstance();

        // Set up event listeners.
        wsService.on('connected', () => {
          console.log('✅ WebSocket connected event');
          setIsWebSocketConnected(true);
        })

        wsService.on('disconnected', () => {
          console.log('🔴 WebSocket disconnected event');
          setIsWebSocketConnected(false);
        })

        wsService.on('userUpdate', (updatedUser: User) => {
          console.log('🔄 Real-time user update:', updatedUser.username);

          setFriends(prev => {
            const index = prev.findIndex(f => f.id === updatedUser.id);
            if (index !== -1) {
              console.log(`  ✅ Updating friend in list:`, {
                username: updatedUser.username,
                sharing: updatedUser.isLocationSharing,
                lat: updatedUser.latitude,
                lng: updatedUser.latitude,
              });
            } else {
              console.log(` ⚠️ User ${updatedUser.username} not in friends list`);
            }
            return prev;
          });
        });

        wsService.on('friendAdded', async (data: any) => {
          console.log('👥 Friend added via WebSocket:', data);
          await forceReload();
        });

        wsService.on('friendRemoved', async(data: any) => {
          console.log('💔 Friend removed via WebSocket:', data.friendId);
          setFriends(prev => prev.filter(f => f.id !== data.friendId && f.id !== data.userId));
        });

        wsService.on('friendRequestReceived', async (data: any) => {
          console.log('📬 Friend request received via WebSocket:', data);
          await forceReload();
        })

        wsService.on('friendRequestAccepted', async (data: any) => {
          console.log('✅ Friend request accepted via WebSocket:', data);
          await forceReload();
        });

        wsService.on('friendRequestDeleted', async (data: any) => {
          console.log('🗑️ Friend request deleted via WebSocket:', data);
          await forceReload();
        });

        wsService.on('error', (error: any) => {
          console.error('❌ WebSocket error:', error);
        });

        wsService.on('maxReconnectAttemptsReached', () => {
          console.error('❌ Max WebSocket reconnection attempts reached');
          // You could show a UI notification here
        });

        // Connect
        await wsService.connect(user.userId);

        console.log('✅ WebSocket setup complete');

      } catch (error) {
        console.error('❌ Error setting up WebSocket:', error);

      }
    };

    setupWebSocket();

    return () => {
      console.log('🔴 Cleaning up WebSocket for user:', currentUserId);
      if (wsService) {
        wsService.disconnect();
      }
    };
  }, []);

  return (
    <SubscriptionContext.Provider value={{
      pendingRequests,
      sentRequests,
      friends,
      friendsOnline,
      friendsMap,
      forceReload,
      isWebSocketConnected,
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscriptions = () => useContext(SubscriptionContext);