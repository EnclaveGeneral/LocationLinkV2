// amplify/functions/websocket-broadcast/resource.ts
import { defineFunction } from '@aws-amplify/backend';

export const websocketBroadcastFunction = defineFunction({
  name: 'websocket-broadcast',
  entry: './handler.ts',
  timeoutSeconds: 60,
  resourceGroupName: 'data',
});