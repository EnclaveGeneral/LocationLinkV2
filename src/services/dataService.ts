// src/services/dataService.ts
import { getClient } from './amplifyConfig';

export const dataService = {
  // User operations
  async createUser(userData: any) {
    const client = getClient();
    const { data } = await client.models.User.create(userData);
    return data;
  },

  async getUser(id: string) {
    const client = getClient();
    const { data } = await client.models.User.get({ id });
    return data;
  },

  async updateUser(id: string, updates: any) {
    const client = getClient();
    const { data } = await client.models.User.update({ id, ...updates });
    return data;
  },

  async listUsers(filter?: any) {
    const client = getClient();
    const { data } = await client.models.User.list(filter ? { filter } : {});
    return data;
  },

  // Friend operations
  async createFriend(userId: string, friendId: string) {
    const client = getClient();
    const { data } = await client.models.Friend.create({ userId, friendId });
    return data;
  },

  async deleteFriend(id: string) {
    const client = getClient();
    const { data } = await client.models.Friend.delete({ id });
    return data;
  },

  async listFriends(filter?: any) {
    const client = getClient();
    const { data } = await client.models.Friend.list(filter ? { filter } : {});
    return data;
  },

  // Friend Request operations
  async createFriendRequest(requestData: any) {
    const client = getClient();
    const { data } = await client.models.FriendRequest.create(requestData);
    return data;
  },

  async updateFriendRequest(id: string, updates: any) {
    const client = getClient();
    const { data } = await client.models.FriendRequest.update({ id, ...updates });
    return data;
  },

  async deleteFriendRequest(id: string) {
    const client = getClient();
    const { data } = await client.models.FriendRequest.delete({ id });
    return data;
  },

  async listFriendRequests(filter?: any) {
    const client = getClient();
    const { data } = await client.models.FriendRequest.list(filter ? { filter } : {});
    return data;
  }
};
