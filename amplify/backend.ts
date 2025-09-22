// amplify/backend.ts
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { acceptFriendRequestFunction } from './functions/accept-friend-request/resource';
import { removeFriendFunction } from './functions/remove-friend/resource';
import { Stack } from 'aws-cdk-lib';
// Grant DynamoDB permissions using IAM policies
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';

const backend = defineBackend({
  auth,
  data,
  acceptFriendRequestFunction,
  removeFriendFunction,
});

// Get the stack and resources
const stack = Stack.of(backend.data);

// Method 1: Get table names directly from the GraphQL schema
const userTableName = backend.data.resources.tables['User'].tableName;
const friendTableName = backend.data.resources.tables['Friend'].tableName;
const friendRequestTableName = backend.data.resources.tables['FriendRequest'].tableName;

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
      `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${userTableName}`,
      `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${userTableName}/*`,
      `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${friendTableName}`,
      `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${friendTableName}/*`,
      `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${friendRequestTableName}`,
      `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${friendRequestTableName}/*`
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
      `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${userTableName}`,
      `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${userTableName}/*`,
      `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${friendTableName}`,
      `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${friendTableName}/*`,
    ],
  })
);
