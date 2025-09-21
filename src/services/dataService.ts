// src/services/dataService.ts
import { client } from './amplifyConfig';

export const dataService = {
  // User operations
  async createUser(userData: any) {
    try {
      // Don't pass viewers explicitly - it's created implicitly by Amplify
      const { viewers, ...userDataWithoutViewers } = userData;
      const { data, errors } = await client.models.User.create(userDataWithoutViewers);
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

  // PublicProfile operations
  async createPublicProfile(profileData: any) {
    try {
      const { data, errors } = await client.models.PublicProfile.create(profileData);
      if (errors) {
        console.error('Create public profile errors:', errors);
        throw new Error('Failed to create public profile');
      }
      return data;
    } catch (error) {
      console.error('Create public profile error:', error);
      throw error;
    }
  },

  async getPublicProfile(userId: string) {
    try {
      const { data, errors } = await client.models.PublicProfile.list({
        filter: { userId: { eq: userId } }
      });
      if (errors) {
        console.error('Get public profile errors:', errors);
      }
      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error('Get public profile error:', error);
      return null;
    }
  },

  async searchPublicProfiles(username: string) {
    try {
      const { data, errors } = await client.models.PublicProfile.list({
        filter: { username: { eq: username } }
      });
      if (errors) {
        console.error('Search public profiles errors:', errors);
      }
      return data || [];
    } catch (error) {
      console.error('Search public profiles error:', error);
      return [];
    }
  },

  async updatePublicProfile(userId: string, updates: any) {
    try {
      // First get the profile
      const profiles = await this.searchPublicProfiles(userId);
      if (!profiles || profiles.length === 0) {
        throw new Error('Public profile not found');
      }

      const { data, errors } = await client.models.PublicProfile.update({
        id: profiles[0].id,
        ...updates
      });
      if (errors) {
        console.error('Update public profile errors:', errors);
        throw new Error('Failed to update public profile');
      }
      return data;
    } catch (error) {
      console.error('Update public profile error:', error);
      throw error;
    }
  },

  // Friend operations
  async createFriend(userId: string, friendId: string, userUsername?: string, friendUsername?: string, owners?: string[]) {
    try {
      const { data, errors } = await client.models.Friend.create({
        userId,
        friendId,
        userUsername,
        friendUsername
        // Type assertion to handle TypeScript type issues
        // owners: owners || [userId, friendId] as an implicit field.
      });
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
      const { data, errors } = await client.models.FriendRequest.create({
        ...requestData
        // Type assertion to handle TypeScript type issues
        // owners: (requestData.owners || [requestData.senderId, requestData.receiverId]) as any, field implicit.
      });
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