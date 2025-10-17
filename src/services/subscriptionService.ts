// src/services/subscriptionService.ts
import { client } from './amplifyConfig';
import type { Schema } from '../../amplify/data/resource';

export class SubscriptionService {
  private static instance: SubscriptionService;
  private subscriptions: { unsubscribe: () => void }[] = [];

  static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  // Subscribe to friend location updates - single subscription with client-side filtering
  async subscribeFriendLocations(
    friendIds: string[],
    onUpdate: (friend: Schema['User']['type']) => void
  ) {
    try {
      const sub = client.models.User.onUpdate().subscribe({
        next: (user: Schema['User']['type']) => {
          if (friendIds.includes(user.id)) {
            console.log(`Location update for friend ${user.id}:`, user);
            onUpdate(user);
          }
        },
        error: (error) => {
          console.error('Friend location subscription error:', error);
        },
      });

      this.subscriptions.push(sub);
    } catch (error) {
      console.error('Error setting up friend location subscriptions:', error);
    }
  }

  // Subscribe to new friendships
  async subscribeNewFriendships(
    userId: string,
    onNewFriend: (friend: Schema['User']['type']) => void
  ) {
    try {
      const processedFriends = new Set<string>();

      const createSub = client.models.Friend.onCreate().subscribe({
        next: async (friendship: Schema['Friend']['type']) => {
          console.log('New friendship created:', friendship);

          if (friendship.userId === userId || friendship.friendId === userId) {
            const friendId = friendship.userId === userId ? friendship.friendId : friendship.userId;

            if (processedFriends.has(friendId)) return;
            processedFriends.add(friendId);

            try {
              const friendData = await client.models.User.get({ id: friendId });
              if (friendData.data) {
                onNewFriend(friendData.data);
              }
            } catch (error) {
              console.error('Error fetching friend data:', error);
            }
          }
        },
        error: (error) => console.error('New friendship subscription error:', error),
      });

      this.subscriptions.push(createSub);
    } catch (error) {
      console.error('Error setting up new friendship subscriptions:', error);
    }
  }

  // Subscribe to friend requests
  async subscribeFriendRequests(
    userId: string,
    onUpdate: (requests: Schema['FriendRequest']['type'][]) => void
  ) {
    try {
      const allRequests = new Map<string, Schema['FriendRequest']['type']>();

      // Load initial requests
      const initialRequests = await client.models.FriendRequest.list({
        filter: {
          or: [
            { receiverId: { eq: userId } },
            { senderId: { eq: userId } },
          ],
        },
      });

      initialRequests.data?.forEach((req) => {
        if (req.status === 'PENDING') allRequests.set(req.id, req);
      });
      onUpdate(Array.from(allRequests.values()));

      // Subscribe to NEW requests
      const createSub = client.models.FriendRequest.onCreate().subscribe({
        next: (request: Schema['FriendRequest']['type']) => {
          if (
            (request.receiverId === userId || request.senderId === userId) &&
            request.status === 'PENDING'
          ) {
            console.log('New friend request:', request);
            allRequests.set(request.id, request);
            onUpdate(Array.from(allRequests.values()));
          }
        },
        error: (error) => console.error('Create request subscription error:', error),
      });

      // Subscribe to UPDATED requests
      const updateSub = client.models.FriendRequest.onUpdate().subscribe({
        next: (request: Schema['FriendRequest']['type']) => {
          if (request.receiverId === userId || request.senderId === userId) {
            console.log('Friend request updated:', request);
            if (request.status === 'PENDING') {
              allRequests.set(request.id, request);
            } else {
              allRequests.delete(request.id);
            }
            onUpdate(Array.from(allRequests.values()));
          }
        },
        error: (error) => console.error('Update request subscription error:', error),
      });

      // Subscribe to DELETED requests
      const deleteSub = client.models.FriendRequest.onDelete().subscribe({
        next: (request: Schema['FriendRequest']['type']) => {
          if (request.receiverId === userId || request.senderId === userId) {
            console.log('Friend request deleted:', request);
            allRequests.delete(request.id);
            onUpdate(Array.from(allRequests.values()));
          }
        },
        error: (error) => console.error('Delete request subscription error:', error),
      });

      this.subscriptions.push(createSub, updateSub, deleteSub);
    } catch (error) {
      console.error('Error setting up friend request subscriptions:', error);
    }
  }

  // Subscribe to friendships
  async subscribeFriendships(
    userId: string,
    onUpdate: (friends: Schema['Friend']['type'][]) => void
  ) {
    try {
      const allFriendships = new Map<string, Schema['Friend']['type']>();

      // Load initial friendships
      const initialFriendships = await client.models.Friend.list({
        filter: {
          or: [
            { userId: { eq: userId } },
            { friendId: { eq: userId } },
          ],
        },
      });

      initialFriendships.data?.forEach((friendship) => {
        allFriendships.set(friendship.id, friendship);
      });
      onUpdate(Array.from(allFriendships.values()));

      // Subscribe to NEW friendships
      const createSub = client.models.Friend.onCreate().subscribe({
        next: (friendship: Schema['Friend']['type']) => {
          if (friendship.userId === userId || friendship.friendId === userId) {
            console.log('Friendship created:', friendship);
            allFriendships.set(friendship.id, friendship);
            onUpdate(Array.from(allFriendships.values()));
          }
        },
        error: (error) => console.error('Create friendship subscription error:', error),
      });

      // Subscribe to DELETED friendships
      const deleteSub = client.models.Friend.onDelete().subscribe({
        next: (friendship: Schema['Friend']['type']) => {
          if (friendship.userId === userId || friendship.friendId === userId) {
            console.log('Friendship deleted:', friendship);
            allFriendships.delete(friendship.id);
            onUpdate(Array.from(allFriendships.values()));
          }
        },
        error: (error) => console.error('Delete friendship subscription error:', error),
      });

      this.subscriptions.push(createSub, deleteSub);
    } catch (error) {
      console.error('Error setting up friendship subscriptions:', error);
    }
  }

  // Subscribe to user's own settings
  async subscribeUserSettings(
    userId: string,
    onUpdate: (user: Schema['User']['type']) => void
  ) {
    try {
      const sub = client.models.User.onUpdate({
        filter: { id: { eq: userId } },
      }).subscribe({
        next: (user: Schema['User']['type']) => {
          console.log('User settings updated:', user);
          onUpdate(user);
        },
        error: (error) => console.error('User settings subscription error:', error),
      });

      this.subscriptions.push(sub);
    } catch (error) {
      console.error('Error setting up user settings subscription:', error);
    }
  }

  // Unsubscribe from all subscriptions
  unsubscribeAll() {
    console.log(`Unsubscribing from ${this.subscriptions.length} subscriptions`);
    this.subscriptions.forEach((sub) => {
      if (sub && typeof sub.unsubscribe === 'function') sub.unsubscribe();
    });
    this.subscriptions = [];
  }
}
