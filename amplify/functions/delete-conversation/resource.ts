// amplify/functions/delete-conversation/resource.ts
import { defineFunction } from '@aws-amplify/backend';

export const deleteConversationFunction = defineFunction({
  name: 'delete-conversation',
  entry: './handler.ts',
  timeoutSeconds: 30,
});