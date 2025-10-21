import { defineFunction } from '@aws-amplify/backend';

export const websocketConnectFunction = defineFunction({
  name: 'websocket-connect',
  entry: './handler.ts',
  timeoutSeconds: 30,
  resourceGroupName: 'data',
});