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

  // Subscribe to ALL user updates (for friend locations AND online status)
  async subscribeAllUserUpdates(
    onUpdate: (user: Schema['User']['type']) => void
  ) {
    try {
      console.log('🔵 Setting up ALL user updates subscription');

      const sub = client.models.User.onUpdate().subscribe({
        next: (user: Schema['User']['type']) => {
          console.log(`✅ User update: ${user.username}`, {
            lat: user.latitude,
            lng: user.longitude,
            sharing: user.isLocationSharing
          });
          onUpdate(user);
        },
        error: (error) => {
          console.error('❌ User updates subscription error:', error);
        },
      });

      this.subscriptions.push(sub);
    } catch (error) {
      console.error('Error setting up user updates subscription:', error);
    }
  }

  // Subscribe to friend location updates (specific friends only)
  async subscribeFriendLocations(
    friendIds: string[],
    onUpdate: (friend: Schema['User']['type']) => void
  ) {
    try {
      console.log(`🔵 Setting up location subscriptions for ${friendIds.length} friends`);

      const sub = client.models.User.onUpdate().subscribe({
        next: (user: Schema['User']['type']) => {
          if (friendIds.includes(user.id)) {
            console.log(`✅ Location update for friend ${user.username}:`, {
              lat: user.latitude,
              lng: user.longitude,
              sharing: user.isLocationSharing
            });
            onUpdate(user);
          }
        },
        error: (error) => {
          console.error('❌ Friend location subscription error:', error);
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
      console.log(`🔵 Setting up new friendship subscription for user ${userId}`);

      const createSub = client.models.Friend.onCreate().subscribe({
        next: async (friendship: Schema['Friend']['type']) => {
          console.log('✅ New friendship created:', friendship);

          if (friendship.userId === userId || friendship.friendId === userId) {
            const friendId = friendship.userId === userId ? friendship.friendId : friendship.userId;

            if (processedFriends.has(friendId)) return;
            processedFriends.add(friendId);

            try {
              const friendData = await client.models.User.get({ id: friendId });
              if (friendData.data) {
                console.log(`✅ Fetched new friend data:`, friendData.data.username);
                onNewFriend(friendData.data);
              }
            } catch (error) {
              console.error('Error fetching friend data:', error);
            }
          }
        },
        error: (error) => console.error('❌ New friendship subscription error:', error),
      });

      this.subscriptions.push(createSub);
    } catch (error) {
      console.error('Error setting up new friendship subscriptions:', error);
    }
  }

  // Subscribe to friendship deletions
  async subscribeFriendshipDeletions(
    userId: string,
    onFriendRemoved: (friendId: string) => void
  ) {
    try {
      console.log(`🔵 Setting up friendship deletion subscription for user ${userId}`);

      const deleteSub = client.models.Friend.onDelete().subscribe({
        next: (friendship: Schema['Friend']['type']) => {
          console.log('🗑️ Friendship deleted:', friendship);

          if (friendship.userId === userId || friendship.friendId === userId) {
            const friendId = friendship.userId === userId ? friendship.friendId : friendship.userId;
            console.log(`✅ Removing friend ${friendId}`);
            onFriendRemoved(friendId);
          }
        },
        error: (error) => console.error('❌ Friendship deletion subscription error:', error),
      });

      this.subscriptions.push(deleteSub);
    } catch (error) {
      console.error('Error setting up friendship deletion subscriptions:', error);
    }
  }

  // Subscribe to friend requests - ALL EVENTS
  async subscribeFriendRequests(
    userId: string,
    onUpdate: (requests: Schema['FriendRequest']['type'][]) => void
  ) {
    try {
      console.log('🔵 Setting up friend requests subscription for user:', userId);
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

      console.log('📥 Initial requests loaded:', initialRequests.data?.length || 0);
      initialRequests.data?.forEach((req) => {
        if (req.status === 'PENDING') {
          allRequests.set(req.id, req);
          console.log('  - Pending request:', req.senderUsername, '->', req.receiverUsername);
        }
      });
      onUpdate(Array.from(allRequests.values()));

      // Subscribe to CREATE
      const createSub = client.models.FriendRequest.onCreate().subscribe({
        next: (request: Schema['FriendRequest']['type']) => {
          if (
            (request.receiverId === userId || request.senderId === userId) &&
            request.status === 'PENDING'
          ) {
            console.log('✅ New friend request created:', request.senderUsername, '->', request.receiverUsername);
            allRequests.set(request.id, request);
            onUpdate(Array.from(allRequests.values()));
          }
        },
        error: (error) => console.error('❌ Create request subscription error:', error),
      });

      // Subscribe to UPDATE
      const updateSub = client.models.FriendRequest.onUpdate().subscribe({
        next: (request: Schema['FriendRequest']['type']) => {
          if (request.receiverId === userId || request.senderId === userId) {
            console.log('✅ Friend request updated:', request.id, 'Status:', request.status);
            if (request.status !== 'PENDING') {
              console.log('  -> Removing from pending (status changed to', request.status + ')');
              allRequests.delete(request.id);
            } else {
              allRequests.set(request.id, request);
            }
            onUpdate(Array.from(allRequests.values()));
          }
        },
        error: (error) => console.error('❌ Update request subscription error:', error),
      });

      // Subscribe to DELETE
      const deleteSub = client.models.FriendRequest.onDelete().subscribe({
        next: (request: Schema['FriendRequest']['type']) => {
          if (request.receiverId === userId || request.senderId === userId) {
            console.log('✅ Friend request deleted:', request.id);
            allRequests.delete(request.id);
            onUpdate(Array.from(allRequests.values()));
          }
        },
        error: (error) => console.error('❌ Delete request subscription error:', error),
      });

      this.subscriptions.push(createSub, updateSub, deleteSub);
    } catch (error) {
      console.error('Error setting up friend request subscriptions:', error);
    }
  }

  // Subscribe to friendships - CREATE AND DELETE
  async subscribeFriendships(
    userId: string,
    onUpdate: (friends: Schema['Friend']['type'][]) => void
  ) {
    try {
      console.log('🔵 Setting up friendships subscription for user:', userId);
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

      console.log('📥 Initial friendships loaded:', initialFriendships.data?.length || 0);
      initialFriendships.data?.forEach((friendship) => {
        allFriendships.set(friendship.id, friendship);
      });
      onUpdate(Array.from(allFriendships.values()));

      // Subscribe to CREATE
      const createSub = client.models.Friend.onCreate().subscribe({
        next: (friendship: Schema['Friend']['type']) => {
          if (friendship.userId === userId || friendship.friendId === userId) {
            console.log('✅ Friendship created:', friendship.userUsername, '<->', friendship.friendUsername);
            allFriendships.set(friendship.id, friendship);
            onUpdate(Array.from(allFriendships.values()));
          }
        },
        error: (error) => console.error('❌ Create friendship subscription error:', error),
      });

      // Subscribe to DELETE
      const deleteSub = client.models.Friend.onDelete().subscribe({
        next: (friendship: Schema['Friend']['type']) => {
          if (friendship.userId === userId || friendship.friendId === userId) {
            console.log('✅ Friendship deleted:', friendship.userUsername, '<->', friendship.friendUsername);
            allFriendships.delete(friendship.id);
            onUpdate(Array.from(allFriendships.values()));
          }
        },
        error: (error) => console.error('❌ Delete friendship subscription error:', error),
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
      const sub = client.models.User.onUpdate().subscribe({
        next: (user: Schema['User']['type']) => {
          if (user.id === userId) {
            console.log('✅ User settings updated:', user);
            onUpdate(user);
          }
        },
        error: (error) => console.error('❌ User settings subscription error:', error),
      });

      this.subscriptions.push(sub);
    } catch (error) {
      console.error('Error setting up user settings subscription:', error);
    }
  }

  // Unsubscribe from all subscriptions
  unsubscribeAll() {
    console.log(`🔴 Unsubscribing from ${this.subscriptions.length} subscriptions`);
    this.subscriptions.forEach((sub) => {
      if (sub && typeof sub.unsubscribe === 'function') sub.unsubscribe();
    });
    this.subscriptions = [];
  }
}