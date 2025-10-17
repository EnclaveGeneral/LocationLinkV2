// amplify/backend.ts
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { acceptFriendRequestFunction } from '../amplify/functions/accept-friend-request/resource';
import { removeFriendFunction } from '../amplify/functions/remove-friend/resource';
import { Stack } from 'aws-cdk-lib';
// Grant DynamoDB permissions using IAM policies
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { StreamViewType } from 'aws-cdk-lib/aws-dynamodb';

const backend = defineBackend({
  auth,
  data,
  acceptFriendRequestFunction,
  removeFriendFunction,
});

// Get the stack and resources
const stack = Stack.of(backend.data);

// Method 1: Get table names directly from the GraphQL schema
const userTable = backend.data.resources.tables['User'];
const friendTable = backend.data.resources.tables['Friend'];
const friendRequestTable = backend.data.resources.tables['FriendRequest'];

// Enable DynamoDB streams to all tables so AppSync can catch them!
userTable.tableStreamArn;
friendTable.tableStreamArn;
friendRequestTable.tableStreamArn;

// Get table names
const userTableName = userTable.tableName;
const friendTableName = friendTable.tableName;
const friendRequestTableName = friendRequestTable.tableName;

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
