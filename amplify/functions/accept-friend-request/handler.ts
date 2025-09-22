// amplify/functions/accept-friend-request/handler.ts
import type { Schema } from '../../data/resource';

type Handler = Schema['acceptFriendRequestLambda']['functionHandler'];

export const handler: Handler = async (event) => {
  const { requestId } = event.arguments;
  const userId = event.identity?.sub;

  if (!userId) {
    return {
      success: false,
      message: 'Not authenticated',
    };
  }

  // We'll use AWS SDK v3 directly to access DynamoDB
  // This is included in Lambda runtime, no install needed!
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

  const client = new DynamoDBClient({});
  const ddbDocClient = DynamoDBDocumentClient.from(client);

  try {
    // Get table names from environment variables (Amplify provides these)
    const userTable = process.env.USER_TABLE_NAME || 'User-[your-env-id]';
    const friendRequestTable = process.env.FRIEND_REQUEST_TABLE_NAME || 'FriendRequest-[your-env-id]';
    const friendTable = process.env.FRIEND_TABLE_NAME || 'Friend-[your-env-id]';

    // 1. Get the friend request
    const requestResult = await ddbDocClient.send(new GetCommand({
      TableName: friendRequestTable,
      Key: { id: requestId }
    }));

    const request = requestResult.Item;
    if (!request || request.receiverId !== userId) {
      return {
        success: false,
        message: 'Request not found or unauthorized',
      };
    }

    // 2. Update request status
    await ddbDocClient.send(new UpdateCommand({
      TableName: friendRequestTable,
      Key: { id: requestId },
      UpdateExpression: 'SET #status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': 'ACCEPTED' }
    }));

    // 3. Create Friend record
    await ddbDocClient.send(new PutCommand({
      TableName: friendTable,
      Item: {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId: request.senderId,
        friendId: request.receiverId,
        userUsername: request.senderUsername,
        friendUsername: request.receiverUsername,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    }));

    // 4. Update BOTH users' friends arrays
    // Get current friends arrays
    const [senderResult, receiverResult] = await Promise.all([
      ddbDocClient.send(new GetCommand({
        TableName: userTable,
        Key: { id: request.senderId }
      })),
      ddbDocClient.send(new GetCommand({
        TableName: userTable,
        Key: { id: request.receiverId }
      }))
    ]);

    const senderFriends = senderResult.Item?.friends || [];
    const receiverFriends = receiverResult.Item?.friends || [];

    // Add to arrays if not present
    if (!senderFriends.includes(request.receiverId)) {
      senderFriends.push(request.receiverId);
    }
    if (!receiverFriends.includes(request.senderId)) {
      receiverFriends.push(request.senderId);
    }

    // Update both users
    await Promise.all([
      ddbDocClient.send(new UpdateCommand({
        TableName: userTable,
        Key: { id: request.senderId },
        UpdateExpression: 'SET friends = :friends, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':friends': senderFriends,
          ':updatedAt': new Date().toISOString()
        }
      })),
      ddbDocClient.send(new UpdateCommand({
        TableName: userTable,
        Key: { id: request.receiverId },
        UpdateExpression: 'SET friends = :friends, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':friends': receiverFriends,
          ':updatedAt': new Date().toISOString()
        }
      }))
    ]);

    // 5. Delete the friend request
    await ddbDocClient.send(new DeleteCommand({
      TableName: friendRequestTable,
      Key: { id: requestId }
    }));

    return {
      success: true,
      message: 'Friend request accepted successfully',
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      success: false,
      message: 'An error occurred',
    };
  }
};