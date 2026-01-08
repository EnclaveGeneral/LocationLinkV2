// amplify/backend.ts
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { acceptFriendRequestFunction } from '../amplify/functions/accept-friend-request/resource';
import { removeFriendFunction } from '../amplify/functions/remove-friend/resource';
import { websocketConnectFunction } from './functions/websocket-connect/resource';
import { websocketDisconnectFunction } from './functions/websocket-disconnect/resource';
import { websocketMessageFunction } from './functions/websocket-message/resource';
import { websocketBroadcastFunction } from './functions/websocket-broadcast/resource';
import { getMessagesFunction } from '../amplify/functions/get-messages/resource';
import { updateMessageStatusFunction } from './functions/update-message-status/resource';
import { Stack } from 'aws-cdk-lib';
import { PolicyStatement, Effect, ServicePrincipal } from 'aws-cdk-lib/aws-iam';  // Grant DynamoDB permissions using IAM policies
import { CfnApi, CfnRoute, CfnIntegration, CfnStage, CfnDeployment } from 'aws-cdk-lib/aws-apigatewayv2';
import { StartingPosition } from 'aws-cdk-lib/aws-lambda';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { CfnOutput } from 'aws-cdk-lib';

const backend = defineBackend({
  auth,
  data,
  storage,
  acceptFriendRequestFunction,
  removeFriendFunction,
  websocketConnectFunction,
  websocketDisconnectFunction,
  websocketMessageFunction,
  websocketBroadcastFunction,
  getMessagesFunction,
  updateMessageStatusFunction,
});

// Get the stack and resources
const stack = Stack.of(backend.data);

// Method 1: Get table names directly from the GraphQL schema
const userTable = backend.data.resources.tables['User'];
const friendTable = backend.data.resources.tables['Friend'];
const friendRequestTable = backend.data.resources.tables['FriendRequest'];
const connectionsTable = backend.data.resources.tables['WebSocketConnection'];
const chatMessageTable = backend.data.resources.tables['ChatMessage'];
const chatConversationTable = backend.data.resources.tables['ChatConversation'];

// Enable DynamoDB streams to all tables so AppSync can catch them!
userTable.tableStreamArn;
friendTable.tableStreamArn;
friendRequestTable.tableStreamArn;

// Get table names
const userTableName = userTable.tableName;
const friendTableName = friendTable.tableName;
const friendRequestTableName = friendRequestTable.tableName;
const connectionsTableName = connectionsTable.tableName;
const chatMessageTableName = chatMessageTable.tableName;
const chatConversationTableName = chatConversationTable.tableName;


// Create WebSocket API
const webSocketApi = new CfnApi(stack, 'WebSocketApi', {
  name: 'LocationLinkWebSocketAPI',
  protocolType: 'WEBSOCKET',
  routeSelectionExpression: '$request.body.action',
});

// Create integrations
const connectIntegration = new CfnIntegration(stack, 'ConnectIntegration', {
  apiId: webSocketApi.ref,
  integrationType: 'AWS_PROXY',
  integrationUri: `arn:aws:apigateway:${stack.region}:lambda:path/2015-03-31/functions/${backend.websocketConnectFunction.resources.lambda.functionArn}/invocations`,
})

const disconnectIntegration = new CfnIntegration(stack, 'DisconnectIntegration', {
  apiId: webSocketApi.ref,
  integrationType: 'AWS_PROXY',
  integrationUri: `arn:aws:apigateway:${stack.region}:lambda:path/2015-03-31/functions/${backend.websocketDisconnectFunction.resources.lambda.functionArn}/invocations`,
});

const messageIntegration = new CfnIntegration(stack, 'MessageIntegration', {
  apiId: webSocketApi.ref,
  integrationType: 'AWS_PROXY',
  integrationUri: `arn:aws:apigateway:${stack.region}:lambda:path/2015-03-31/functions/${backend.websocketMessageFunction.resources.lambda.functionArn}/invocations`,
});


// Create routes
const connectRoute = new CfnRoute(stack, 'ConnectRoute', {
  apiId: webSocketApi.ref,
  routeKey: '$connect',
  authorizationType: 'NONE',
  target: `integrations/${connectIntegration.ref}`,
});

const disconnectRoute = new CfnRoute(stack, 'DisconnectRoute', {
  apiId: webSocketApi.ref,
  routeKey: '$disconnect',
  target: `integrations/${disconnectIntegration.ref}`,
});

const defaultRoute = new CfnRoute(stack, 'DefaultRoute', {
  apiId: webSocketApi.ref,
  routeKey: '$default',
  target: `integrations/${messageIntegration.ref}`,
});

const stage = new CfnStage(stack, 'WebSocketStage', {
  apiId: webSocketApi.ref,
  stageName: 'production',
  autoDeploy: true,
});

// Create deployment and stage
const deployment = new CfnDeployment(stack, 'WebSocketDeployment', {
  apiId: webSocketApi.ref,
});

// Add explicit Dependency to specify the route
deployment.addDependency(connectRoute);
deployment.addDependency(disconnectRoute);
deployment.addDependency(defaultRoute);


const wsEndpoint = `https://${webSocketApi.ref}.execute-api.${stack.region}.amazonaws.com/${stage.stageName}`;

// Grant Lambda permissions to WebSocket API
backend.websocketConnectFunction.resources.lambda.addPermission('WebSocketConnectPermission', {
  principal: new ServicePrincipal('apigateway.amazonaws.com'),
  sourceArn: `arn:aws:execute-api:${stack.region}:${stack.account}:${webSocketApi.ref}/*`,
});

backend.websocketDisconnectFunction.resources.lambda.addPermission('WebSocketDisconnectPermission', {
  principal: new ServicePrincipal('apigateway.amazonaws.com'),
  sourceArn: `arn:aws:execute-api:${stack.region}:${stack.account}:${webSocketApi.ref}/*`,
});

backend.websocketMessageFunction.resources.lambda.addPermission('WebSocketMessagePermission', {
  principal: new ServicePrincipal('apigateway.amazonaws.com'),
  sourceArn: `arn:aws:execute-api:${stack.region}:${stack.account}:${webSocketApi.ref}/*`,
});




// Add environment variables to WebSocket functions
backend.websocketConnectFunction.addEnvironment('CONNECTIONS_TABLE_NAME', connectionsTableName!);
backend.websocketConnectFunction.addEnvironment('USER_TABLE_NAME', userTableName!);
backend.websocketDisconnectFunction.addEnvironment('CONNECTIONS_TABLE_NAME', connectionsTableName!);
backend.websocketDisconnectFunction.addEnvironment('USER_TABLE_NAME', userTableName!);
backend.websocketMessageFunction.addEnvironment('CONNECTIONS_TABLE_NAME', connectionsTableName!);
backend.websocketBroadcastFunction.addEnvironment('USER_TABLE_NAME', userTableName!);
backend.websocketBroadcastFunction.addEnvironment('FRIEND_TABLE_NAME', friendTableName!);
backend.websocketBroadcastFunction.addEnvironment('FRIEND_REQUEST_TABLE_NAME', friendRequestTableName!);

// For all chat functionalities
backend.websocketMessageFunction.addEnvironment('CHAT_MESSAGE_TABLE_NAME', chatMessageTableName!);
backend.websocketMessageFunction.addEnvironment('CHAT_CONVERSATION_TABLE_NAME', chatConversationTableName!);

backend.websocketBroadcastFunction.addEnvironment('CONNECTIONS_TABLE_NAME', connectionsTableName!);
backend.websocketBroadcastFunction.addEnvironment('WEBSOCKET_ENDPOINT', wsEndpoint);


backend.updateMessageStatusFunction.addEnvironment('CHAT_MESSAGE_TABLE_NAME', chatMessageTableName!);
backend.updateMessageStatusFunction.addEnvironment('CONNECTIONS_TABLE_NAME', connectionsTableName!);
backend.updateMessageStatusFunction.addEnvironment('WEBSOCKET_ENDPOINT', wsEndpoint);

backend.websocketMessageFunction.addEnvironment('CHAT_MESSAGE_TABLE_NAME', chatMessageTableName!);
backend.websocketMessageFunction.addEnvironment('CHAT_CONVERSATION_TABLE_NAME', chatConversationTableName!);
backend.websocketMessageFunction.addEnvironment('WEBSOCKET_ENDPOINT', wsEndpoint);


// Grant DynamoDB permissions to access WebSocket functions
[
  backend.websocketConnectFunction,
  backend.websocketDisconnectFunction,
  backend.websocketMessageFunction,
].forEach((func) => {
  func.resources.lambda.addToRolePolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'dynamodb:PutItem',
        'dynamodb:GetItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
      ],
      resources: [
        connectionsTable.tableArn,
        `${connectionsTable.tableArn}/*`,
        chatConversationTable.tableArn,
        `${chatConversationTable.tableArn}/*`,
        chatMessageTable.tableArn,
        `${chatMessageTable.tableArn}/*`,
      ],
    })
  );
});

// Grant permissions to broadcast functions
backend.websocketBroadcastFunction.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'dynamodb:Query',
      'dynamodb:GetItem',
      'dynamodb:DeleteItem',
    ],
    resources: [
      userTable.tableArn,
      `${userTable.tableArn}/*`,
      friendTable.tableArn,
      `${friendTable.tableArn}/*`,
      friendRequestTable.tableArn,
      `${friendRequestTable.tableArn}/*`,
      connectionsTable.tableArn,
      `${connectionsTable.tableArn}/*`,
    ],
  })
);

// Grant permissions to post to WebSocket connections
backend.websocketBroadcastFunction.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['execute-api:ManageConnections'],
    resources: [`arn:aws:execute-api:${stack.region}:${stack.account}:${webSocketApi.ref}/*`],
  })
);

// Grant our chat message to be broadcasted through WebSocket Connections
backend.websocketMessageFunction.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['execute-api:ManageConnections'],
    resources: [`arn:aws:execute-api:${stack.region}:${stack.account}:${webSocketApi.ref}/*`],
  })
);

// Grant permissions
backend.getMessagesFunction.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'dynamodb:Query',
      'dynamodb:GetItem',
    ],
    resources: [
      chatMessageTable.tableArn,
      `${chatMessageTable.tableArn}/*`, // For secondary indexes
    ],
  })
);

backend.updateMessageStatusFunction.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'dynamodb:UpdateItem',
      'dynamodb:Query',
    ],
    resources: [
      chatMessageTable.tableArn,
      `${chatMessageTable.tableArn}/*`,
      connectionsTable.tableArn,
      `${connectionsTable.tableArn}/*`,
    ],
  })
);

backend.updateMessageStatusFunction.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['execute-api:ManageConnections'],
    resources: [`arn:aws:execute-api:${stack.region}:${stack.account}:${webSocketApi.ref}/*`],
  })
);



// Add DynamoDB stream event sources to broadcast function
backend.websocketBroadcastFunction.resources.lambda.addEventSource(
  new DynamoEventSource(userTable, {
    startingPosition: StartingPosition.LATEST,
    batchSize: 10,
    retryAttempts: 3,
  })
);

backend.websocketBroadcastFunction.resources.lambda.addEventSource(
  new DynamoEventSource(friendTable, {
    startingPosition: StartingPosition.LATEST,
    batchSize: 10,
    retryAttempts: 3,
  })
);

backend.websocketBroadcastFunction.resources.lambda.addEventSource(
  new DynamoEventSource(friendRequestTable, {
    startingPosition: StartingPosition.LATEST,
    batchSize: 10,
    retryAttempts: 3,
  })
);


// Section II:

// Add environment variables to the Lambda functions
backend.acceptFriendRequestFunction.addEnvironment(
  'USER_TABLE_NAME',
  userTableName!
);
backend.acceptFriendRequestFunction.addEnvironment(
  'FRIEND_REQUEST_TABLE_NAME',
  friendRequestTableName!
);
backend.acceptFriendRequestFunction.addEnvironment(
  'FRIEND_TABLE_NAME',
  friendTableName!
);

backend.removeFriendFunction.addEnvironment(
  'USER_TABLE_NAME',
  userTableName!
);
backend.removeFriendFunction.addEnvironment(
  'FRIEND_TABLE_NAME',
  friendTableName!
);
backend.getMessagesFunction.addEnvironment(
  'CHAT_MESSAGE_TABLE_NAME',
  chatMessageTableName!
)

// Grant permissions for accept-friend-request function
backend.acceptFriendRequestFunction.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:UpdateItem',
      'dynamodb:DeleteItem',
      'dynamodb:Query',
      'dynamodb:Scan',
    ],
    resources: [
      userTable.tableArn,
      `${userTable.tableArn}/*`,
      friendTable.tableArn,
      `${friendTable.tableArn}/*`,
      friendRequestTable.tableArn,
      `${friendRequestTable.tableArn}/*`,
    ],
  })
);

backend.removeFriendFunction.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'dynamodb:GetItem',
      'dynamodb:UpdateItem',
      'dynamodb:DeleteItem',
      'dynamodb:Query',
      'dynamodb:Scan',
    ],
    resources: [
      userTable.tableArn,
      `${userTable.tableArn}/*`,
      friendTable.tableArn,
      `${friendTable.tableArn}/*`,
    ],
  })
);

// Output WebSocket URL
new CfnOutput(stack, 'WebSocketURL', {
  value: wsEndpoint,
  description: 'WebSocket API endpoint URL',
});
