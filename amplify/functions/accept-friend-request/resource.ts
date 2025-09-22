import { defineFunction } from '@aws-amplify/backend';

export const acceptFriendRequestFunction = defineFunction({
  name: 'accept-friend-request',
  timeoutSeconds: 30,
});