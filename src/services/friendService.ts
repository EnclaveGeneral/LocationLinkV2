// src/services/friendService.ts
import { authService } from './authService';
import { dataService } from './dataService';

export const friendService = {
  async sendFriendRequest(receiverUsername: string) {
    const currentUser = await authService.getCurrentUser();
    if (!currentUser) throw new Error('Not authenticated');

    // Find receiver
    const users = await dataService.listUsers({
      username: { eq: receiverUsername }
    });

    const receiver = users[0];
    if (!receiver) throw new Error('User not found');

    if (receiver.id === currentUser.userId) {
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
              { receiverId: { eq: receiver.id } }
            ]},
            { and: [
              { senderId: { eq: receiver.id } },
              { receiverId: { eq: currentUser.userId } }
            ]},
          ],
        },
      ],
    });

    if (existingRequests.length > 0) {
      throw new Error('Friend request already exists');
    }

    // Get current user's data
    const currentUserData = await dataService.getUser(currentUser.userId);

    // Create request with denormalized data
    const request = await dataService.createFriendRequest({
      senderId: currentUser.userId,
      receiverId: receiver.id,
      status: 'PENDING',
      senderUsername: currentUserData?.username || 'User',
      receiverUsername: receiver.username,
    });

    return request;
  },

  async acceptFriendRequest(requestId: string) {
    // Update request status
    await dataService.updateFriendRequest(requestId, {
      status: 'ACCEPTED',
    });

    // Get request details to create friendship
    const requests = await dataService.listFriendRequests({
      id: { eq: requestId }
    });

    const request = requests[0];
    if (request) {
      // Create friendship
      await dataService.createFriend(request.senderId, request.receiverId);
    }

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
    }

    return true;
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
