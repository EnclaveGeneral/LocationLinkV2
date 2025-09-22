// src/services/friendService.ts
import { authService } from './authService';
import { dataService } from './dataService';

export const friendService = {
  async sendFriendRequest(receiverUsername: string) {
    const currentUser = await authService.getCurrentUser();
    if (!currentUser) throw new Error('Not authenticated');

    // Search in PublicProfile
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

    // Create request
    const request = await dataService.createFriendRequest({
      senderId: currentUser.userId,
      receiverId: receiverId,
      status: 'PENDING',
      senderUsername: currentUserData?.username || 'Unknown',
      receiverUsername: receiverProfile.username || 'Unknown',
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

    // Create friendship record
    await dataService.createFriend(
      request.senderId,
      request.receiverId,
      request.senderUsername || undefined,
      request.receiverUsername || undefined
    );

    // Update friends arrays in both users
    await this.updateFriendsArrays(request.senderId, request.receiverId, 'add');

    // Optionally delete the request after acceptance
    await dataService.deleteFriendRequest(requestId);

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
      // Remove from friends arrays
      await this.updateFriendsArrays(currentUserId, friendId, 'remove');
    }

    return true;
  },

  // Helper function to manage friends arrays
  async updateFriendsArrays(userId1: string, userId2: string, action: 'add' | 'remove') {
    try {
      const [user1, user2] = await Promise.all([
        dataService.getUser(userId1),
        dataService.getUser(userId2)
      ]);

      if (user1 && user2) {
        // Work with explicit friends arrays
        let user1Friends = user1.friends || [];
        let user2Friends = user2.friends || [];

        if (action === 'add') {
          // Add each user to the other's friends array
          if (!user1Friends.includes(userId2)) {
            user1Friends = [...user1Friends, userId2];
          }
          if (!user2Friends.includes(userId1)) {
            user2Friends = [...user2Friends, userId1];
          }
        } else {
          // Remove each user from the other's friends array
          user1Friends = user1Friends.filter((id: string) => id !== userId2);
          user2Friends = user2Friends.filter((id: string) => id !== userId1);
        }

        // Update both users
        await Promise.all([
          dataService.updateUser(userId1, { friends: user1Friends }),
          dataService.updateUser(userId2, { friends: user2Friends })
        ]);

        console.log(`Updated friends arrays - ${action} relationship between users`);
      }
    } catch (error) {
      console.error('Error updating friends arrays:', error);
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