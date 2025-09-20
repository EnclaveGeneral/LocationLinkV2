// src/services/dataService.ts
import { client } from './amplifyConfig';

export const dataService = {
  // User operations
  async createUser(userData: any) {
    try {
      const { data, errors } = await client.models.User.create(userData);
      if (errors) {
        console.error('Create user errors:', errors);
        throw new Error('Failed to create user');
      }
      return data;
    } catch (error) {
      console.error('Create user error:', error);
      throw error;
    }
  },

  async getUser(id: string) {
    try {
      const { data, errors } = await client.models.User.get({ id });
      if (errors) {
        console.error('Get user errors:', errors);
      }
      return data;
    } catch (error) {
      console.error('Get user error:', error);
      return null;
    }
  },

  async updateUser(id: string, updates: any) {
    try {
      const { data, errors } = await client.models.User.update({ id, ...updates });
      if (errors) {
        console.error('Update user errors:', errors);
        throw new Error('Failed to update user');
      }
      return data;
    } catch (error) {
      console.error('Update user error:', error);
      throw error;
    }
  },

  async listUsers(filter?: any) {
    try {
      const { data, errors } = await client.models.User.list(filter ? { filter } : {});
      if (errors) {
        console.error('List users errors:', errors);
      }
      return data || [];
    } catch (error) {
      console.error('List users error:', error);
      return [];
    }
  },

  // Friend operations
  async createFriend(userId: string, friendId: string) {
    try {
      const { data, errors } = await client.models.Friend.create({ userId, friendId });
      if (errors) {
        console.error('Create friend errors:', errors);
        throw new Error('Failed to create friend');
      }
      return data;
    } catch (error) {
      console.error('Create friend error:', error);
      throw error;
    }
  },

  async deleteFriend(id: string) {
    try {
      const { data, errors } = await client.models.Friend.delete({ id });
      if (errors) {
        console.error('Delete friend errors:', errors);
        throw new Error('Failed to delete friend');
      }
      return data;
    } catch (error) {
      console.error('Delete friend error:', error);
      throw error;
    }
  },

  async listFriends(filter?: any) {
    try {
      const { data, errors } = await client.models.Friend.list(filter ? { filter } : {});
      if (errors) {
        console.error('List friends errors:', errors);
      }
      return data || [];
    } catch (error) {
      console.error('List friends error:', error);
      return [];
    }
  },

  // Friend Request operations
  async createFriendRequest(requestData: any) {
    try {
      const { data, errors } = await client.models.FriendRequest.create(requestData);
      if (errors) {
        console.error('Create friend request errors:', errors);
        throw new Error('Failed to create friend request');
      }
      return data;
    } catch (error) {
      console.error('Create friend request error:', error);
      throw error;
    }
  },

  async updateFriendRequest(id: string, updates: any) {
    try {
      const { data, errors } = await client.models.FriendRequest.update({ id, ...updates });
      if (errors) {
        console.error('Update friend request errors:', errors);
        throw new Error('Failed to update friend request');
      }
      return data;
    } catch (error) {
      console.error('Update friend request error:', error);
      throw error;
    }
  },

  async deleteFriendRequest(id: string) {
    try {
      const { data, errors } = await client.models.FriendRequest.delete({ id });
      if (errors) {
        console.error('Delete friend request errors:', errors);
        throw new Error('Failed to delete friend request');
      }
      return data;
    } catch (error) {
      console.error('Delete friend request error:', error);
      throw error;
    }
  },

  async listFriendRequests(filter?: any) {
    try {
      const { data, errors } = await client.models.FriendRequest.list(filter ? { filter } : {});
      if (errors) {
        console.error('List friend requests errors:', errors);
      }
      return data || [];
    } catch (error) {
      console.error('List friend requests error:', error);
      return [];
    }
  }
};