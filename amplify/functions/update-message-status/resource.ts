// amplify/functions/update-message-status/resource.ts
import { defineFunction } from '@aws-amplify/backend';

export const updateMessageStatusFunction = defineFunction({
  name: 'update-message-status',
  entry: './handler.ts',
  timeoutSeconds: 30,
  resourceGroupName: 'data',
});