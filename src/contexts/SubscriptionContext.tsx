// src/contexts/SubscriptionContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { SubscriptionService } from '../services/subscriptionService';
import { authService } from '../services/authService';
import { dataService } from '../services/dataService';
import type { Schema } from '../../amplify/data/resource';

type User = Schema['User']['type'];
type FriendRequest = Schema['FriendRequest']['type'];
type Friend = Schema['Friend']['type'];

interface SubscriptionContextType {
  pendingRequests: FriendRequest[];
  sentRequests: FriendRequest[];
  friends: User[];
  friendsOnline: number;
  friendsMap: Map<string, User>;
  forceReload: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  pendingRequests: [],
  sentRequests: [],
  friends: [],
  friendsOnline: 0,
  friendsMap: new Map(),
  forceReload: async () => {},
});

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [friendsMap, setFriendsMap] = useState<Map<string, User>>(new Map());
  const [friendsOnline, setFriendsOnline] = useState<number>(0);

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
      console.log('✅ Force reload complete');
    } catch (error) {
      console.error('❌ Force reload error:', error);
    }
  };

  useEffect(() => {
    console.log('🔵 SubscriptionContext - Initializing...');
    let subscriptionService: SubscriptionService | null = null;
    let currentUserId: string | null = null;

    const setupSubscriptions = async () => {
      try {
        const user = await authService.getCurrentUser();
        if (!user) {
          console.log('⚠️ No user found');
          return;
        }

        console.log('✅ User found:', user.userId);
        currentUserId = user.userId;
        subscriptionService = SubscriptionService.getInstance();

        // Load initial friends
        const initialFriendships = await dataService.listFriends({
          or: [
            { userId: { eq: user.userId } },
            { friendId: { eq: user.userId } },
          ],
        });

        console.log('📥 Initial friendships loaded:', initialFriendships.length);
        console.log('📥 Friendship details:', initialFriendships.map(f => ({
          id: f.id,
          userId: f.userId,
          friendId: f.friendId,
        })));

        const friendIds = initialFriendships.map(f =>
          f.userId === user.userId ? f.friendId : f.userId
        );

        console.log('📥 Friend IDs to load:', friendIds);

        const initialFriends = await Promise.all(
          friendIds.map(id => dataService.getUser(id))
        );

        updateFriendsState(initialFriends.filter((f): f is User => f !== null));

        // Subscribe to friend requests
        console.log('🔵 Setting up friend requests subscription...');
        await subscriptionService.subscribeFriendRequests(user.userId, (requests: FriendRequest[]) => {
          console.log('📬 Friend requests subscription fired! Total:', requests.length);

          const received = requests.filter(r => r.receiverId === user.userId);
          const sent = requests.filter(r => r.senderId === user.userId);

          console.log('  📨 Received:', received.length, '📤 Sent:', sent.length);

          setPendingRequests(received);
          setSentRequests(sent);
        });

        // Subscribe to friendships
        console.log('🔵 Setting up friendships subscription...');
        await subscriptionService.subscribeFriendships(user.userId, async (friendships: Friend[]) => {
          console.log('👥 Friendships subscription fired! Total:', friendships.length);
          console.log('👥 Friendship details:', friendships.map(f => ({
            id: f.id,
            userId: f.userId,
            friendId: f.friendId,
          })));

          const currentFriendIds = friendships.map(f =>
            f.userId === user.userId ? f.friendId : f.userId
          );

          console.log('  🔍 Extracted friend IDs:', currentFriendIds);

          const updatedFriends = await Promise.all(
            currentFriendIds.map(id => dataService.getUser(id))
          );

          console.log('  📥 Loaded friend data for:', updatedFriends.map(f => f?.username));

          updateFriendsState(updatedFriends.filter((f): f is User => f !== null));
        });

        // Subscribe to user updates
        console.log('🔵 Setting up user updates subscription...');
        await subscriptionService.subscribeAllUserUpdates((updatedUser: User) => {
          console.log('🔄 User update subscription fired for:', updatedUser.username);

          setFriends(prev => {
            const index = prev.findIndex(f => f.id === updatedUser.id);
            if (index !== -1) {
              console.log(`  ✅ Found friend in list, updating:`, {
                username: updatedUser.username,
                sharing: updatedUser.isLocationSharing,
              });

              const newFriends = [...prev];
              newFriends[index] = { ...updatedUser };

              updateFriendsState(newFriends);

              return newFriends;
            } else {
              console.log(`  ⚠️ User ${updatedUser.username} not in friends list, ignoring`);
            }
            return prev;
          });
        });

        console.log('✅ All subscriptions setup complete');

      } catch (error) {
        console.error('❌ Error setting up subscriptions:', error);
      }
    };

    setupSubscriptions();

    return () => {
      console.log('🔴 Cleaning up subscriptions for user:', currentUserId);
      if (subscriptionService) {
        subscriptionService.unsubscribeAll();
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
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscriptions = () => useContext(SubscriptionContext);