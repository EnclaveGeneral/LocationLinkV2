// amplify/backend.ts
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { acceptFriendRequestFunction } from './functions/accept-friend-request/resource';
import { removeFriendFunction } from './functions/remove-friend/resource';

const backend = defineBackend({
  auth,
  data,
  acceptFriendRequestFunction,
  removeFriendFunction,
});

// Get the underlying CDK resources
const { cfnResources } = backend.data.resources;
const tables = backend.data.resources.tables;

// Add environment variables to the Lambda functions
backend.acceptFriendRequestFunction.resources.lambda.addEnvironment(
  'USER_TABLE_NAME',
  tables['User'].tableName
);
backend.acceptFriendRequestFunction.resources.lambda.addEnvironment(
  'FRIEND_REQUEST_TABLE_NAME',
  tables['FriendRequest'].tableName
);
backend.acceptFriendRequestFunction.resources.lambda.addEnvironment(
  'FRIEND_TABLE_NAME',
  tables['Friend'].tableName
);

backend.removeFriendFunction.resources.lambda.addEnvironment(
  'USER_TABLE_NAME',
  tables['User'].tableName
);
backend.removeFriendFunction.resources.lambda.addEnvironment(
  'FRIEND_TABLE_NAME',
  tables['Friend'].tableName
);

// Grant DynamoDB permissions to the Lambda functions
tables['User'].grantReadWriteData(backend.acceptFriendRequestFunction.resources.lambda);
tables['FriendRequest'].grantReadWriteData(backend.acceptFriendRequestFunction.resources.lambda);
tables['Friend'].grantReadWriteData(backend.acceptFriendRequestFunction.resources.lambda);

tables['User'].grantReadWriteData(backend.removeFriendFunction.resources.lambda);
tables['Friend'].grantReadWriteData(backend.removeFriendFunction.resources.lambda);