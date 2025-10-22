// src/contexts/SubscriptionContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { WebSocketService } from '../services/websocketService';
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
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);

  const updateFriendsState = (newFriends: User[]) => {
    const validFriends = newFriends.filter((f): f is User => f !== null && f !== undefined);

    const newMap = new Map<string, User>();

    validFriends.forEach(f => {
      newMap.set(f.id, f);
      console.log(`  📍 Added to map: ${f.username} (${f.id})`);
    });

    // ✅ ADD: Log what's being removed from the map
    const oldIds = Array.from(friendsMap.keys());
    const newIds = Array.from(newMap.keys());
    const removedIds = oldIds.filter(id => !newIds.includes(id));

    if (removedIds.length > 0) {
      console.log('  🗑️ Removed from map:', removedIds);
    }


    const online = validFriends.filter(f => f.isLocationSharing === true).length;

    console.log('📊 Context state updated:', {
      total: validFriends.length,
      online: online,
      mapSize: newMap.size,
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
    console.log('🔵 SubscriptionContext - Initializing with WebSocket...');
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

        // Connect to WebSocket
        wsService = WebSocketService.getInstance();

        // Set up event listeners and reconnect
        wsService.on('connected', async () => {
          console.log('✅ WebSocket connected event');
          setIsWebSocketConnected(true);

          // Re-sync all data after lost connection and re-connect
          if (currentUserId) {
            await forceReload();
          }
        });

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
                lng: updatedUser.longitude,
              });

              const newFriends = [...prev];
              newFriends[index] = updatedUser;
              updateFriendsState(newFriends);
              return newFriends;
            } else {
              console.log(` ⚠️ User ${updatedUser.username} not in friends list`);
            }
            return prev;
          });
        });

        wsService.on('friendAdded', async (data: any) => {
          console.log('👥 Friend added via WebSocket:', data);

          // Determine which friend was added to current user
          const newFriendId = data.userId === currentUserId ? data.friendId : data.userId;

          // Fetch the new friend's data
          const newFriend = await dataService.getUser(newFriendId);

          if (newFriend) {
            console.log('✅ Adding friend to list:', newFriend.username);
            setFriends(prev => {
              // Check if already exists (shouldn't, but just in case)
              if (prev.some(f => f.id === newFriend.id)) {
                return prev;
              }
              const newFriends = [...prev, newFriend];
              updateFriendsState(newFriends);
              return newFriends;
            });
          }

          // Also reload requests to clear any pending requests between these users
          const requests = await dataService.listFriendRequests({
            or: [
              { receiverId: { eq: currentUserId } },
              { senderId: { eq: currentUserId } },
            ],
          });

          const received = requests.filter(r => r.receiverId === currentUserId && r.status === 'PENDING');
          const sent = requests.filter(r => r.senderId === currentUserId && r.status === 'PENDING');

          setPendingRequests(received);
          setSentRequests(sent);
        });

        wsService.on('friendRemoved', async(data: any) => {

          console.log('💔 Friend removed via WebSocket:', data);

          // Determine which friend was removed
          let friendToRemove: string;

          if (data.userId === currentUserId) {
            // Initiate removal, remove the friendId
            friendToRemove = data.friendId;
          } else if (data.friendId === currentUserId) {
            // Removed by someone else, remove your friend that removed you
            friendToRemove = data.userId;
          } else {
            // This message isn't for me
            console.log('⚠️ Received friend removal not involving current user');
            return;

          }

          console.log(`🗑️ Removing friend from list: ${friendToRemove}`);

          setFriends(prev => {
            const newFriends = prev.filter(f => f.id !== friendToRemove);
            console.log(`  ✅ Removed. Friend count: ${prev.length} → ${newFriends.length}`);
            updateFriendsState(newFriends);
            return newFriends;
          });
        });

        wsService.on('friendRequestReceived', async (data: any) => {
          console.log('📬 Friend request received via WebSocket:', data);

          const receivedRequests = await dataService.listFriendRequests({
            receiverId: { eq: currentUserId },
            status: { eq: 'PENDING' }
          });

          console.log(`  ✅ Updated pending requests: ${receivedRequests.length}`);
          setPendingRequests(receivedRequests);
        });

        wsService.on('friendRequestSent', async (data: any) => {
          console.log('📤 Friend request sent via WebSocket:', data);

          // Reload sent requests to include the new one
          const sentRequests = await dataService.listFriendRequests({
            senderId: { eq: currentUserId },
            status: { eq: 'PENDING' }
          });

          console.log(`  ✅ Updated sent requests: ${sentRequests.length}`);
          setSentRequests(sentRequests);
        })

        wsService.on('friendRequestAccepted', async (data: any) => {
          console.log('✅ Friend request accepted via WebSocket:', data);

          // Remove from sent requests
          setSentRequests(prev => {
            const newSent = prev.filter(r => r.id !== data.requestId);
            console.log(`  ✅ Removed from sent. Count: ${prev.length} → ${newSent.length}`);
            return newSent;
          });

          // The SENDER (current user) needs to add the RECEIVER as friend
          const newFriend = await dataService.getUser(data.receiverId);


          if (newFriend) {
            console.log('✅ Adding newly accepted friend to list:', newFriend.username);
            setFriends(prev => {
              if (prev.some(f => f.id === newFriend.id)) {
                return prev;
              }
              const newFriends = [...prev, newFriend];
              updateFriendsState(newFriends);
              return newFriends;
            });
          }
        });

        // Friend Request Deleted - Direct State Update
        wsService.on('friendRequestDeleted', async (data: any) => {
          console.log('🗑️ Friend request deleted via WebSocket:', data);

          // Remove request from both user sent and user received
          setPendingRequests(prev => {
            const newPending = prev.filter(r => r.id !== data.requestId);
            console.log(`  ✅ Removed from pending. Count: ${prev.length} → ${newPending.length}`);
            return newPending;
          });

          setSentRequests(prev => {
            const newSent = prev.filter(r => r.id !== data.requestId);
            console.log(`  ✅ Removed from sent. Count: ${prev.length} → ${newSent.length}`);
            return newSent;
          });
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

  // ✅ ADD: Debug helper (optional, remove in production)
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('📊 STATE SNAPSHOT:', {
        friends: friends.length,
        mapSize: friendsMap.size,
        online: friendsOnline,
        pending: pendingRequests.length,
        sent: sentRequests.length,
        connected: isWebSocketConnected,
      });
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [friends, friendsMap, friendsOnline, pendingRequests, sentRequests, isWebSocketConnected]);

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