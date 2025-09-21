// src/services/friendService.ts
import { authService } from './authService';
import { dataService } from './dataService';

export const friendService = {
  async sendFriendRequest(receiverUsername: string) {
    const currentUser = await authService.getCurrentUser();
    if (!currentUser) throw new Error('Not authenticated');

    // UPDATED: Search in PublicProfile instead of User
    const profiles = await dataService.searchPublicProfiles(receiverUsername);

    if (!profiles || profiles.length === 0) {
      throw new Error('User not found');
    }

    const receiverProfile = profiles[0];
    const receiverId = receiverProfile.userId;

    if (receiverId === currentUser.userId) {
      throw new Error('Cannot send request to yourself');
    }

    // Check for existing request
    const existingRequests = await dataService.listFriendRequests({
      and: [
        { status: { eq: 'PENDING' } },
        {
          or: [
            { and: [
              { senderId: { eq: currentUser.userId } },
              { receiverId: { eq: receiverId } }
            ]},
            { and: [
              { senderId: { eq: receiverId } },
              { receiverId: { eq: currentUser.userId } }
            ]},
          ],
        },
      ],
    });

    if (existingRequests.length > 0) {
      throw new Error('Friend request already exists');
    }

    // Check if already friends
    const existingFriendship = await dataService.listFriends({
      or: [
        { and: [
          { userId: { eq: currentUser.userId } },
          { friendId: { eq: receiverId } }
        ]},
        { and: [
          { userId: { eq: receiverId } },
          { friendId: { eq: currentUser.userId } }
        ]},
      ],
    });

    if (existingFriendship.length > 0) {
      throw new Error('Already friends with this user');
    }

    // Get current user's data
    const currentUserData = await dataService.getUser(currentUser.userId);

    // IMPORTANT: Create request with owners array
    const request = await dataService.createFriendRequest({
      senderId: currentUser.userId,
      receiverId: receiverId,
      status: 'PENDING',
      senderUsername: currentUserData?.username || 'Unknown',
      receiverUsername: receiverProfile.username || 'Unknown', // Handle potential null
      // owners: [currentUser.userId, receiverId], This Line Due To Gen 2 is now implicit.
    });

    return request;
  },

  async acceptFriendRequest(requestId: string) {
    // Get request details
    const requests = await dataService.listFriendRequests({
      id: { eq: requestId }
    });

    const request = requests[0];
    if (!request) throw new Error('Request not found');

    // Update request status
    await dataService.updateFriendRequest(requestId, {
      status: 'ACCEPTED',
    });

    // IMPORTANT: Create friendship with owners array
    await dataService.createFriend(
      request.senderId,
      request.receiverId,
      request.senderUsername || undefined,
      request.receiverUsername || undefined
      // [request.senderId, request.receiverId] // Both users own this record, created implicitly
    );

    // CRITICAL: Update viewers arrays so friends can see each other's locations
    await this.updateViewersArrays(request.senderId, request.receiverId, 'add');

    return true;
  },

  async rejectFriendRequest(requestId: string) {
    await dataService.deleteFriendRequest(requestId);
    return true;
  },

  async removeFriend(currentUserId: string, friendId: string) {
    const friends = await dataService.listFriends({
      or: [
        { and: [{ userId: { eq: currentUserId } }, { friendId: { eq: friendId } }] },
        { and: [{ userId: { eq: friendId } }, { friendId: { eq: currentUserId } }] },
      ],
    });

    if (friends.length > 0) {
      await dataService.deleteFriend(friends[0].id);

      // CRITICAL: Remove from viewers arrays
      await this.updateViewersArrays(currentUserId, friendId, 'remove');
    }

    return true;
  },

  // Helper function to manage viewers arrays
  async updateViewersArrays(userId1: string, userId2: string, action: 'add' | 'remove') {
    try {
      const [user1, user2] = await Promise.all([
        dataService.getUser(userId1),
        dataService.getUser(userId2)
      ]);

      if (user1 && user2) {
        // Handle potential type issues with type assertions
        let user1Viewers = (user1.viewers as any as string[]) || [];
        let user2Viewers = (user2.viewers as any as string[]) || [];

        // Ensure we're working with arrays
        if (!Array.isArray(user1Viewers)) {
          console.warn('user1.viewers is not an array, converting:', user1Viewers);
          user1Viewers = [];
        }
        if (!Array.isArray(user2Viewers)) {
          console.warn('user2.viewers is not an array, converting:', user2Viewers);
          user2Viewers = [];
        }

        if (action === 'add') {
          // Add each user to the other's viewers
          if (!user1Viewers.includes(userId2)) {
            user1Viewers.push(userId2);
          }
          if (!user2Viewers.includes(userId1)) {
            user2Viewers.push(userId1);
          }
        } else {
          // Remove each user from the other's viewers
          user1Viewers = user1Viewers.filter(id => id !== userId2);
          user2Viewers = user2Viewers.filter(id => id !== userId1);
        }

        // Update both users - use type assertion
        await Promise.all([
          dataService.updateUser(userId1, { viewers: user1Viewers as any }),
          dataService.updateUser(userId2, { viewers: user2Viewers as any })
        ]);

        console.log(`Updated viewers arrays - ${action} relationship between ${userId1} and ${userId2}`);
      }
    } catch (error) {
      console.error('Error updating viewers arrays:', error);
      throw error;
    }
  },


  async getFriends(userId: string) {
    const friendships = await dataService.listFriends({
      or: [
        { userId: { eq: userId } },
        { friendId: { eq: userId } },
      ],
    });

    // Get friend user data
    const friendIds = friendships.map(f =>
      f.userId === userId ? f.friendId : f.userId
    );

    const friends = await Promise.all(
      friendIds.map(id => dataService.getUser(id))
    );

    return friends.filter(Boolean);
  },

  async getPendingRequests(userId: string) {
    const requests = await dataService.listFriendRequests({
      and: [
        { receiverId: { eq: userId } },
        { status: { eq: 'PENDING' } },
      ],
    });

    return requests;
  },

  async getSentRequests(userId: string) {
    const requests = await dataService.listFriendRequests({
      and: [
        { senderId: { eq: userId } },
        { status: { eq: 'PENDING' } },
      ],
    });

    return requests;
  }
};