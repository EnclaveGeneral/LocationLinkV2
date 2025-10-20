// amplify/backend.ts
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { acceptFriendRequestFunction } from '../amplify/functions/accept-friend-request/resource';
import { removeFriendFunction } from '../amplify/functions/remove-friend/resource';
import { websocketConnectFunction } from './functions/websocket-connect/resource';
import { websocketDisconnectFunction } from './functions/websocket-disconnect/resource';
import { websocketMessageFunction } from './functions/websocket-message/resource';
import { websocketBroadcastFunction } from './functions/websockeet-broadcast/resource';
import { Stack } from 'aws-cdk-lib';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';  // Grant DynamoDB permissions using IAM policies
import { CfnApi, CfnRoute, CfnIntegration, CfnStage, CfnDeployment } from 'aws-cdk-lib/aws-apigatewayv2';
import { StartingPosition } from 'aws-cdk-lib/aws-lambda';
import { StreamViewType } from 'aws-cdk-lib/aws-dynamodb';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

const backend = defineBackend({
  auth,
  data,
  acceptFriendRequestFunction,
  removeFriendFunction,
  websocketConnectFunction,
  websocketDisconnectFunction,
  websocketMessageFunction,
  websocketBroadcastFunction,
});

// Get the stack and resources
const stack = Stack.of(backend.data);

// Method 1: Get table names directly from the GraphQL schema
const userTable = backend.data.resources.tables['User'];
const friendTable = backend.data.resources.tables['Friend'];
const friendRequestTable = backend.data.resources.tables['FriendRequest'];
const connectionsTable = backend.data.resources.tables['WebSocketConnection'];

// Enable DynamoDB streams to all tables so AppSync can catch them!
userTable.tableStreamArn;
friendTable.tableStreamArn;
friendRequestTable.tableStreamArn;

// Get table names
const userTableName = userTable.tableName;
const friendTableName = friendTable.tableName;
const friendRequestTableName = friendRequestTable.tableName;
const connectionsTableName = connectionsTable.tableName;

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
new CfnRoute(stack, 'ConnectRoute', {
  apiId: webSocketApi.ref,
  routeKey: '$connect',
  authorizationType: 'NONE',
  target: `integrations/${connectIntegration.ref}`,
});

new CfnRoute(stack, 'DisconnectRoute', {
  apiId: webSocketApi.ref,
  routeKey: '$disconnect',
  target: `integrations/${disconnectIntegration.ref}`,
});

new CfnRoute(stack, 'DefaultRoute', {
  apiId: webSocketApi.ref,
  routeKey: '$default',
  target: `integrations/${messageIntegration.ref}`,
});

// Create deployment and stage
const deployment = new CfnDeployment(stack, 'WebSocketDeployment', {
  apiId: webSocketApi.ref,
});

const stage = new CfnStage(stack, 'WebSocketStage', {
  apiId: webSocketApi.ref,
  stageName: 'production',
  deploymentId: deployment.ref,
  autoDeploy: true,
});

const wsEndpoint = `https://${webSocketApi.ref}.execute-api.${stack.region}.amazonaws.com/${stage.stageName}`;

// Grant Lambda permissions to WebSocket API
backend.websocketConnectFunction.resources.lambda.addPermission('WebSocketConnectPermission', {
  principal: new (require('aws-cdk-lib/aws-iam').ServicePrincipal)('apigateway.amazonaws.com'),
  sourceArn: `arn:aws:execute-api:${stack.region}:${stack.account}:${webSocketApi.ref}/*`,
});

backend.websocketDisconnectFunction.resources.lambda.addPermission('WebSocketDisconnectPermission', {
  principal: new (require('aws-cdk-lib/aws-iam').ServicePrincipal)('apigateway.amazonaws.com'),
  sourceArn: `arn:aws:execute-api:${stack.region}:${stack.account}:${webSocketApi.ref}/*`,
});

backend.websocketMessageFunction.resources.lambda.addPermission('WebSocketMessagePermission', {
  principal: new (require('aws-cdk-lib/aws-iam').ServicePrincipal)('apigateway.amazonaws.com'),
  sourceArn: `arn:aws:execute-api:${stack.region}:${stack.account}:${webSocketApi.ref}/*`,
});

// Add environment variables to WebSocket functions
backend.websocketConnectFunction.addEnvironment('CONNECTIONS_TABLE_NAME', connectionsTableName!);
backend.websocketDisconnectFunction.addEnvironment('CONNECTIONS_TABLE_NAME', connectionsTableName!);
backend.websocketMessageFunction.addEnvironment('CONNECTIONS_TABLE_NAME', connectionsTableName!);
backend.websocketBroadcastFunction.addEnvironment('USER_TABLE_NAME', userTableName!);
backend.websocketBroadcastFunction.addEnvironment('FRIEND_TABLE_NAME', friendTableName!);
backend.websocketBroadcastFunction.addEnvironment('FRIEND_REQUEST_TABLE_NAME', friendRequestTableName!);
backend.websocketBroadcastFunction.addEnvironment('WEBSOCKET_ENDPOINT', wsEndpoint);

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
new (require('aws-cdk-lib').CfnOutput)(stack, 'WebSocketURL', {
  value: wsEndpoint,
  description: 'WebSocket API endpoint URL',
});
