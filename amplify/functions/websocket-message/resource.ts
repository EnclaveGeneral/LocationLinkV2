import { defineFunction } from '@aws-amplify/backend';

export const websocketMessageFunction = defineFunction({
  name: 'websocket-message',
  entry: './handler.ts',
  timeoutSeconds: 30,
  resourceGroupName: 'websocket',
});