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