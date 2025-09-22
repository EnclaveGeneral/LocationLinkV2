// amplify/functions/remove-friend/handler.ts
import type { Schema } from '../../data/resource';

type Handler = Schema['removeFriendLambda']['functionHandler'];

export const handler: Handler = async (event) => {
  const { friendId } = event.arguments;
  const userId = event.identity?.sub;

  if (!userId) {
    return {
      success: false,
      message: 'Not authenticated',
    };
  }

  const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, GetCommand, UpdateCommand, DeleteCommand, QueryCommand } = await import('@aws-sdk/lib-dynamodb');

  const client = new DynamoDBClient({});
  const ddbDocClient = DynamoDBDocumentClient.from(client);

  try {
    const userTable = process.env.USER_TABLE_NAME || 'User-[your-env-id]';
    const friendTable = process.env.FRIEND_TABLE_NAME || 'Friend-[your-env-id]';

    // 1. Find and delete Friend records
    // Query for friendship records
    const friendshipsToDelete = [];

    // Query by userId index
    const userQuery = await ddbDocClient.send(new QueryCommand({
      TableName: friendTable,
      IndexName: 'userId',
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: 'friendId = :friendId',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':friendId': friendId
      }
    }));

    if (userQuery.Items) {
      friendshipsToDelete.push(...userQuery.Items);
    }

    // Query by friendId index
    const friendQuery = await ddbDocClient.send(new QueryCommand({
      TableName: friendTable,
      IndexName: 'friendId',
      KeyConditionExpression: 'friendId = :friendId',
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':friendId': userId,
        ':userId': friendId
      }
    }));

    if (friendQuery.Items) {
      friendshipsToDelete.push(...friendQuery.Items);
    }

    // Delete all found friendships
    await Promise.all(
      friendshipsToDelete.map(item =>
        ddbDocClient.send(new DeleteCommand({
          TableName: friendTable,
          Key: { id: item.id }
        }))
      )
    );

    // 2. Update both users' friends arrays
    const [userResult, friendResult] = await Promise.all([
      ddbDocClient.send(new GetCommand({
        TableName: userTable,
        Key: { id: userId }
      })),
      ddbDocClient.send(new GetCommand({
        TableName: userTable,
        Key: { id: friendId }
      }))
    ]);

    const userFriends = (userResult.Item?.friends || []).filter((id: string) => id !== friendId);
    const friendFriends = (friendResult.Item?.friends || []).filter((id: string) => id !== userId);

    // Update both users
    await Promise.all([
      ddbDocClient.send(new UpdateCommand({
        TableName: userTable,
        Key: { id: userId },
        UpdateExpression: 'SET friends = :friends, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':friends': userFriends,
          ':updatedAt': new Date().toISOString()
        }
      })),
      ddbDocClient.send(new UpdateCommand({
        TableName: userTable,
        Key: { id: friendId },
        UpdateExpression: 'SET friends = :friends, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':friends': friendFriends,
          ':updatedAt': new Date().toISOString()
        }
      }))
    ]);

    return {
      success: true,
      message: 'Friend removed successfully',
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      success: false,
      message: 'An error occurred',
    };
  }
};