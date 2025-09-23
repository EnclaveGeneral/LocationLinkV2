// amplify/functions/remove-friend/handler.ts
import type { Schema } from '../../data/resource';
import type { AppSyncIdentityCognito } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

export const handler: Schema['removeFriendLambda']['functionHandler'] = async (event) => {

  // Narrow the type
  const { friendId } = event.arguments;
  const identity = event.identity as AppSyncIdentityCognito | undefined;
  const userId = identity?.sub;

  if (!userId || !friendId) {
    return {success: false, message: 'Missing userId or friendId'};
  }

  console.log(`Removing friendship between ${userId} and ${friendId}`);

  const client = new DynamoDBClient({});
  const ddbDocClient = DynamoDBDocumentClient.from(client);

  try {
    const userTable = process.env.USER_TABLE_NAME || 'User-[your-env-id]';
    const friendTable = process.env.FRIEND_TABLE_NAME || 'Friend-[your-env-id]';

    if (!userTable || !friendTable) {
      throw new Error('Table names not configured');
    }
    // 1. Find and delete Friend records
    // Query for friendship records

    const scanResult = await ddbDocClient.send(
      new ScanCommand({
        TableName: friendTable,
        FilterExpression:
          '(userId = :uid AND friendId = :fid) OR (userId = :fid AND friendId = :uid)',
        ExpressionAttributeValues: {
          ':uid': userId,
          ':fid': friendId,
        },
      })
    );

    console.log(`Found ${scanResult.Items?.length || 0} friendship records to delete`);

    // Delete all found friendships
    if (scanResult.Items && scanResult.Items.length > 0) {
      await Promise.all(
        scanResult.Items.map(item => {
          console.log(`Deleting friendship record: ${item.id}`);
          return ddbDocClient.send(new DeleteCommand({
            TableName: friendTable,
            Key: { id: item.id}
          }));
        })
      );
    }

    // 2. Update both users's friend arrays
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

    console.log('Current user friends:', userResult.Item?.friends);
    console.log('Friend user friends:', friendResult.Item?.friends);
    const userFriends = (userResult.Item?.friends || []).filter((id: string) => id !== friendId);
    const friendFriends = (friendResult.Item?.friends || []).filter((id: string) => id !== userId);
    console.log('Updated user friends:', userFriends);
    console.log('Updated friend friends:', friendFriends);



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

    console.log(`Successfully removed friendship between ${userId} and ${friendId}`);

    return {
      success: true,
      message: 'Friend removed successfully',
    };

  } catch (error) {
    console.error('Error removing friend:', error);
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error occured'}`,
    };
  }
};