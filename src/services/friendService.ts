// src/services/friendService.ts
import { authService } from './authService';
import { dataService } from './dataService';
import { client } from './amplifyConfig';

export const friendService = {
  // Keep your existing sendFriendRequest method as is
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

  // UPDATED: Use Lambda function for accepting friend requests
  async acceptFriendRequest(requestId: string) {
    try {
      // Call the Lambda mutation
      const { data, errors } = await client.mutations.acceptFriendRequestLambda({
        requestId: requestId,
      });

      if (errors) {
        console.error('Lambda errors:', errors);
        throw new Error(errors[0]?.message || 'Failed to accept friend request');
      }

      if (!data?.success) {
        throw new Error(data?.message || 'Failed to accept friend request');
      }

      return true;
    } catch (error: any) {
      console.error('Error accepting friend request:', error);
      throw new Error(error.message || 'Failed to accept friend request');
    }
  },

  // Keep rejectFriendRequest as is (just deletes the request)
  async rejectFriendRequest(requestId: string) {
    await dataService.deleteFriendRequest(requestId);
    return true;
  },

  // UPDATED: Use Lambda function for removing friends
  async removeFriend(currentUserId: string, friendId: string) {
    try {
      // Call the Lambda mutation
      const { data, errors } = await client.mutations.removeFriendLambda({
        friendId: friendId,
      });

      if (errors) {
        console.error('Lambda errors:', errors);
        throw new Error(errors[0]?.message || 'Failed to remove friend');
      }

      if (!data?.success) {
        throw new Error(data?.message || 'Failed to remove friend');
      }

      return true;
    } catch (error: any) {
      console.error('Error removing friend:', error);
      throw new Error(error.message || 'Failed to remove friend');
    }
  },

  // REMOVE the updateFriendsArrays method - no longer needed!
  // Lambda handles this atomically now

  // Keep getFriends as is - it works fine
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

  // Keep the rest of your methods as they are
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
  },

  async refreshFriendData(userId: string) {
    const [friends, pendingRequests, sentRequests] = await Promise.all([
      friendService.getFriends(userId),
      friendService.getPendingRequests(userId),
      friendService.getSentRequests(userId),
    ]);

    return { friends, pendingRequests, sentRequests };
  },

};