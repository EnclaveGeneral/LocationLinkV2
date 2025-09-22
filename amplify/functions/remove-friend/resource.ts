import { defineFunction } from "@aws-amplify/backend";

export const removeFriendFunction = defineFunction({
  name: 'remove-friend',
  entry: './handler.ts',
  timeoutSeconds: 30,
});