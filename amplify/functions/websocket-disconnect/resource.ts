// amplify/functions/websocket-disconnect/resource.ts
import { defineFunction } from '@aws-amplify/backend';

export const websocketDisconnectFunction = defineFunction({
  name: 'websocket-disconnect',
  entry: './handler.ts',
  timeoutSeconds: 30,
  resourceGroupName: 'data',
});