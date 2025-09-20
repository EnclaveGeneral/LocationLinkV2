// src/services/subscriptionService.ts
import { client } from './amplifyConfig';
import { authService } from './authService';

export class SubscriptionService {
  private static instance: SubscriptionService;
  private subscriptions: any[] = [];
  private callbacks: Map<string, Function[]> = new Map();

  static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  // Subscribe to friend location updates
  async subscribeFriendLocations(friendIds: string[], onUpdate: (friend: any) => void) {
    try {
      // Subscribe to each friend's User record updates
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

  // Subscribe to new friendships being created
  async subscribeNewFriendships(userId: string, onNewFriend: (friend: any) => void) {
    try {
      // Subscribe to Friend model for new friendships
      const sub = client.models.Friend.observeQuery({
        filter: {
          or: [
            { userId: { eq: userId } },
            { friendId: { eq: userId } }
          ]
        }
      }).subscribe({
        next: async ({ items }) => {
          // Process new friendships
          for (const friendship of items) {
            const friendId = friendship.userId === userId ? friendship.friendId : friendship.userId;

            // Fetch the friend's user data
            try {
              const friendData = await client.models.User.get({ id: friendId });
              if (friendData.data) {
                onNewFriend(friendData.data);
              }
            } catch (error) {
              console.error('Error fetching new friend data:', error);
            }
          }
        },
        error: (error) => {
          console.error('New friendship subscription error:', error);
        }
      });

      this.subscriptions.push(sub);
    } catch (error) {
      console.error('Error setting up new friendship subscriptions:', error);
    }
  }

  // Subscribe to friend requests
  async subscribeFriendRequests(userId: string, onUpdate: (requests: any[]) => void) {
    try {
      // Subscribe to incoming requests
      const incomingSub = client.models.FriendRequest.observeQuery({
        filter: {
          and: [
            { receiverId: { eq: userId } },
            { status: { eq: 'PENDING' } }
          ]
        }
      }).subscribe({
        next: ({ items }) => {
          onUpdate(items);
        },
        error: (error) => {
          console.error('Incoming requests subscription error:', error);
        }
      });

      // Subscribe to sent requests
      const sentSub = client.models.FriendRequest.observeQuery({
        filter: {
          and: [
            { senderId: { eq: userId } },
            { status: { eq: 'PENDING' } }
          ]
        }
      }).subscribe({
        next: ({ items }) => {
          onUpdate(items);
        },
        error: (error) => {
          console.error('Sent requests subscription error:', error);
        }
      });

      this.subscriptions.push(incomingSub, sentSub);
    } catch (error) {
      console.error('Error setting up friend request subscriptions:', error);
    }
  }

  // Subscribe to friendships
  async subscribeFriendships(userId: string, onUpdate: (friends: any[]) => void) {
    try {
      const sub = client.models.Friend.observeQuery({
        filter: {
          or: [
            { userId: { eq: userId } },
            { friendId: { eq: userId } }
          ]
        }
      }).subscribe({
        next: ({ items }) => {
          onUpdate(items);
        },
        error: (error) => {
          console.error('Friendships subscription error:', error);
        }
      });

      this.subscriptions.push(sub);
    } catch (error) {
      console.error('Error setting up friendship subscriptions:', error);
    }
  }

  // Subscribe to user's own location sharing status
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
    this.callbacks.clear();
  }
}