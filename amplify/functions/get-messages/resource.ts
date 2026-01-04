// amplify/functions/get-messages/resource.ts
import { defineFunction } from '@aws-amplify/backend';

export const getMessagesFunction = defineFunction({
  name: 'get-messages',
  entry: './handler.ts',
  timeoutSeconds: 30,
  resourceGroupName: 'data',
});

