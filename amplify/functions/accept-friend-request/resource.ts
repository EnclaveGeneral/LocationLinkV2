import { defineFunction } from '@aws-amplify/backend';

export const acceptFriendRequestFunction = defineFunction({
  name: 'accept-friend-request',
  entry: './handler.ts',
  timeoutSeconds: 30,
});