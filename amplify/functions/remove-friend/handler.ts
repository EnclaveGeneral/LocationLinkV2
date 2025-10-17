// amplify/functions/remove-friend/handler.ts
import type { Schema } from '../../data/resource';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

export const handler: Schema['removeFriendLambda']['functionHandler'] = async (event) => {
  console.log('🔵 Lambda - Remove Friend Started');
  console.log('Full event:', JSON.stringify(event, null, 2));

  const { friendId } = event.arguments;

  // Try multiple ways to get userId
  let userId: string | undefined;

  if (event.identity && 'sub' in event.identity) {
    userId = event.identity.sub;
  }

  if (!userId && event.identity && 'username' in event.identity) {
    userId = event.identity.username;
  }

  if (!userId && event.identity && 'claims' in event.identity) {
    const claims = event.identity.claims as any;
    userId = claims?.sub;
  }

  console.log('Extracted userId:', userId);
  console.log('Friend ID:', friendId);

  if (!userId || !friendId) {
    console.error('❌ Missing userId or friendId');
    console.error('Identity object:', JSON.stringify(event.identity, null, 2));
    return {
      success: false,
      message: 'Missing userId or friendId'
    };
  }

  console.log(`Removing friendship between ${userId} and ${friendId}`);

  const client = new DynamoDBClient({});
  const ddbDocClient = DynamoDBDocumentClient.from(client);

  try {
    const userTable = process.env.USER_TABLE_NAME;
    const friendTable = process.env.FRIEND_TABLE_NAME;

    if (!userTable || !friendTable) {
      throw new Error('Table names not configured');
    }

    console.log('Using tables:', { userTable, friendTable });

    // 1. Find and delete Friend records
    console.log('🔍 Scanning for friendship records...');
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
      console.log('✅ Friendship records deleted');
    }

    // 2. Update both users' friend arrays
    console.log('📝 Updating user friend arrays...');
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

    console.log(`✅ Successfully removed friendship between ${userId} and ${friendId}`);

    return {
      success: true,
      message: 'Friend removed successfully',
    };

  } catch (error) {
    console.error('❌ Error removing friend:', error);
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
    };
  }
};