import React, { createContext, useContext, useEffect, useState } from 'react';
import { SubscriptionService } from '../services/subscriptionService';
import { authService } from '../services/authService';
import { friendService } from '../services/friendService';

interface SubscriptionContextType {
  pendingRequests: any[];
  sentRequests: any[];
  friends: any[];
  friendsOnline: number;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  pendingRequests: [],
  sentRequests: [],
  friends: [],
  friendsOnline: 0,
});

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [sentRequests, setSentRequests] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [friendsOnline, setFriendsOnline] = useState(0);

  useEffect(() => {
    let subscriptionService: SubscriptionService | null = null;

    const setupSubscriptions = async () => {
      const user = await authService.getCurrentUser();
      if (!user) return;

      subscriptionService = SubscriptionService.getInstance();

      // Subscribe to friend requests
      await subscriptionService.subscribeFriendRequests(user.userId, (requests) => {
        setPendingRequests(requests);
      });

      // Subscribe to friendships and count online
      await subscriptionService.subscribeFriendships(user.userId, async (friendships) => {
        // Get full friend data
        const friendsList = await friendService.getFriends(user.userId);
        setFriends(friendsList);

        // Count friends who are sharing location
        const online = friendsList.filter(f => f.isLocationSharing).length;
        setFriendsOnline(online);
      });
    };

    setupSubscriptions();

    return () => {
      if (subscriptionService) {
        subscriptionService.unsubscribeAll();
      }
    };
  }, []);

  return (
    <SubscriptionContext.Provider value={{ pendingRequests, sentRequests, friends, friendsOnline }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscriptions = () => useContext(SubscriptionContext);