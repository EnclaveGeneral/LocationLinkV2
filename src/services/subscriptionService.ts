// src/services/subscriptionService.ts
import { client } from './amplifyConfig';

export class SubscriptionService {
  private static instance: SubscriptionService;
  private subscriptions: any[] = [];
  private friendCache = new Map<string, any>();
  private friendRequestCache = new Map<string, any>();

  static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  // Subscribe to friend location updates - Keep as is (individual subscriptions)
  async subscribeFriendLocations(friendIds: string[], onUpdate: (friend: any) => void) {
    try {
      for (const friendId of friendIds) {
        const sub = client.models.User.observeQuery({
          filter: { id: { eq: friendId } }
        }).subscribe({
          next: ({ items }) => {
            if (items.length > 0) {
              onUpdate(items[0]);
            }
          },
          error: (error) => {
            console.error('Friend location subscription error:', error);
          }
        });

        this.subscriptions.push(sub);
      }
    } catch (error) {
      console.error('Error setting up friend location subscriptions:', error);
    }
  }

  // Subscribe to new friendships - NO FILTERS
  async subscribeNewFriendships(userId: string, onNewFriend: (friend: any) => void) {
    try {
      const processedFriends = new Set<string>();

      // Subscribe to ALL Friend changes (no filter)
      const sub = client.models.Friend.observeQuery().subscribe({
        next: async ({ items }) => {
          // Filter on client side for friendships involving this user
          const relevantFriendships = items.filter(friendship =>
            friendship.userId === userId || friendship.friendId === userId
          );

          for (const friendship of relevantFriendships) {
            const friendId = friendship.userId === userId ? friendship.friendId : friendship.userId;

            if (processedFriends.has(friendId)) continue;
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
        error: (error) => {
          console.error('New friendship subscription error:', error);
          // Log more details
          if (error?.error?.errors) {
            console.error('Detailed error:', JSON.stringify(error.error.errors, null, 2));
          }
        }
      });

      this.subscriptions.push(sub);
    } catch (error) {
      console.error('Error setting up new friendship subscriptions:', error);
    }
  }

  // Subscribe to friend requests - NO FILTERS
  async subscribeFriendRequests(userId: string, onUpdate: (requests: any[]) => void) {
    try {
      // Subscribe to ALL FriendRequest changes (no filter)
      const sub = client.models.FriendRequest.observeQuery().subscribe({
        next: ({ items }) => {
          // Filter on client side for pending requests involving this user
          const pendingRequests = items.filter(item =>
            item.status === 'PENDING' &&
            (item.senderId === userId || item.receiverId === userId)
          );
          onUpdate(pendingRequests);
        },
        error: (error) => {
          console.error('Friend requests subscription error:', error);
          if (error?.error?.errors) {
            console.error('Detailed error:', JSON.stringify(error.error.errors, null, 2));
          }
        }
      });

      this.subscriptions.push(sub);
    } catch (error) {
      console.error('Error setting up friend request subscriptions:', error);
    }
  }

  // Subscribe to friendships - NO FILTERS
  async subscribeFriendships(userId: string, onUpdate: (friends: any[]) => void) {
    try {
      // Subscribe to ALL Friend changes (no filter)
      const sub = client.models.Friend.observeQuery().subscribe({
        next: ({ items }) => {
          // Filter on client side for friendships involving this user
          const userFriendships = items.filter(item =>
            item.userId === userId || item.friendId === userId
          );
          onUpdate(userFriendships);
        },
        error: (error) => {
          console.error('Friendships subscription error:', error);
          if (error?.error?.errors) {
            console.error('Detailed error:', JSON.stringify(error.error.errors, null, 2));
          }
        }
      });

      this.subscriptions.push(sub);
    } catch (error) {
      console.error('Error setting up friendship subscriptions:', error);
    }
  }

  // Subscribe to user's own settings - Keep as is
  async subscribeUserSettings(userId: string, onUpdate: (user: any) => void) {
    try {
      const sub = client.models.User.observeQuery({
        filter: { id: { eq: userId } }
      }).subscribe({
        next: ({ items }) => {
          if (items.length > 0) {
            onUpdate(items[0]);
          }
        },
        error: (error) => {
          console.error('User settings subscription error:', error);
        }
      });

      this.subscriptions.push(sub);
    } catch (error) {
      console.error('Error setting up user settings subscription:', error);
    }
  }

  // Clean up all subscriptions
  unsubscribeAll() {
    this.subscriptions.forEach(sub => {
      if (sub && typeof sub.unsubscribe === 'function') {
        sub.unsubscribe();
      }
    });
    this.subscriptions = [];
    this.friendCache.clear();
    this.friendRequestCache.clear();
  }
}