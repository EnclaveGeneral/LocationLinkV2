import { defineFunction } from "@aws-amplify/backend";

export const removeFriendFunction = defineFunction({
  name: 'remove-friend',
  timeoutSeconds: 30,
});