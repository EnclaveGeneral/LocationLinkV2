// amplify/functions/websocket-broadcast/handler.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

export const handler = async (event: any) => {
  console.log('🔵 DynamoDB Stream Event:', JSON.stringify(event, null, 2));

  const connectionsTable = process.env.CONNECTIONS_TABLE_NAME;
  const userTable = process.env.USER_TABLE_NAME;
  const friendTable = process.env.FRIEND_TABLE_NAME;
  const friendRequestTable = process.env.FRIEND_REQUEST_TABLE_NAME;
  const wsEndpoint = process.env.WEBSOCKET_ENDPOINT;

  if (!connectionsTable) {
    console.error('❌ Missing environment variable: CONNECTIONS_TABLE');
    return;
  }

  if (!wsEndpoint) {
    console.error('❌ Missing environment variable: WS_ENDPOINT');
    return;
  }

  if (!userTable) {
    console.error('❌ Missing environment variable: USER_TABLE');
    return;
  }

  if (!friendTable) {
    console.error('❌ Missing environment variable: FRIEND_TABLE');
    return;
  }

  if (!friendRequestTable) {
    console.error('❌ Missing environment variable: FRIEND_REQUEST_TABLE');
    return;
  }

  const apiGateway = new ApiGatewayManagementApiClient({
    endpoint: wsEndpoint
  });

  try {
    for (const record of event.Records) {
      console.log(`📝 Processing record: ${record.eventName} on ${record.eventSourceARN}`);

      const tableName = record.eventSourceARN.split('/')[1];

      // Handle User table updates (location sharing, online status)
      if (tableName === userTable) {
        await handleUserUpdate(record, apiGateway, ddbDocClient, connectionsTable, friendTable);
      }

      // Handle Friend table updates (new friendships)
      if (tableName === friendTable) {
        await handleFriendUpdate(record, apiGateway, ddbDocClient, connectionsTable);
      }

      // Handle FriendRequest table updates
      if (tableName === friendRequestTable) {
        await handleFriendRequestUpdate(record, apiGateway, ddbDocClient, connectionsTable);
      }
    }

  } catch (error) {
    console.error('❌ Error in broadcast handler:', error);
  }
};

async function handleUserUpdate(
  record: any,
  apiGateway: ApiGatewayManagementApiClient,
  ddbDocClient: DynamoDBDocumentClient,
  connectionsTable: string,
  friendTable: string,
) {
  if (record.eventName !== 'MODIFY') return;

  const newImage = unmarshall(record.dynamodb.NewImage);
  const oldImage = record.dynamodb.OldImage ? unmarshall(record.dynamodb.OldImage) : null;

  console.log('👤 User updated:', newImage.username);

  // Check if location or sharing status changed
  const locationChanged = !oldImage ||
    oldImage.latitude !== newImage.latitude ||
    oldImage.longitude !== newImage.longitude ||
    oldImage.isLocationSharing !== newImage.isLocationSharing;

  if (!locationChanged) {
    console.log('⏭️ No relevant changes, skipping broadcast');
    return;
  }

  // Get all friends of this user
  const friendIds = await getFriendIds(ddbDocClient, friendTable, newImage.id);
  console.log(`👥 Broadcasting to ${friendIds.length} friends`);

  // Get active connections for these friends
  const connections = await getConnectionsForUsers(ddbDocClient, connectionsTable, friendIds);
  console.log(`📡 Found ${connections.length} active connections`);

  // Broadcast update
  const message = {
    type: 'USER_UPDATE',
    data: {
      id: newImage.id,
      username: newImage.username,
      latitude: newImage.latitude,
      longitude: newImage.longitude,
      isLocationSharing: newImage.isLocationSharing,
      locationUpdatedAt: newImage.locationUpdatedAt,
    }
  };

  await broadcastToConnections(apiGateway, ddbDocClient, connectionsTable, connections, message);
}

async function handleFriendUpdate(
  record: any,
  apiGateway: ApiGatewayManagementApiClient,
  ddbDocClient: DynamoDBDocumentClient,
  connectionsTable: string
) {
  const newImage = record.dynamodb.NewImage ? unmarshall(record.dynamodb.NewImage) : null;
  const oldImage = record.dynamodb.OldImage ? unmarshall(record.dynamodb.OldImage) : null;

  if (record.eventName === 'INSERT' && newImage) {
    console.log('👥 New friendship created');

    // Notify both users of the newly established relationship
    const userIds = [newImage.userId, newImage.friendId];
    const connections = await getConnectionsForUsers(ddbDocClient, connectionsTable, userIds);

    const message = {
      type: 'FRIEND_ADDED',
      data: {
        userId: newImage.userId,
        friendId: newImage.friendId,
        userUsername: newImage.userUsername,
        friendUsername: newImage.friendUsername,
      }
    };

    await broadcastToConnections(apiGateway, ddbDocClient, connectionsTable, connections, message);
  }

  if (record.eventName === 'REMOVE' && oldImage) {
    console.log('💔 Friendship removed');

    // Notify both ends of the relationship of the termination
    const userIds = [oldImage.userId, oldImage.friendId];
    const connections = await getConnectionsForUsers(ddbDocClient, connectionsTable, userIds);

    const message = {
      type: 'FRIEND_REMOVED',
      data: {
        userId: oldImage.userId,
        friendId: oldImage.friendId,
      }
    };

    await broadcastToConnections(apiGateway, ddbDocClient, connectionsTable, connections, message);
  }
}

async function handleFriendRequestUpdate(
  record: any,
  apiGateway: ApiGatewayManagementApiClient,
  ddbDocClient: DynamoDBDocumentClient,
  connectionsTable: string
) {
  const newImage = record.dynamodb.NewImage ? unmarshall(record.dynamodb.NewImage) : null;
  const oldImage = record.dynamodb.OldImage ? unmarshall(record.dynamodb.OldImage) : null;

  // New friend request created, notify both parties
  if (record.eventName === 'INSERT' && newImage) {
    console.log('📬 New friend request created');

    // Notify receiver
    const receiverConnections = await getConnectionsForUsers(ddbDocClient, connectionsTable, [newImage.receiverId]);

    const receiverMessage = {
      type: 'FRIEND_REQUEST_RECEIVED',
      data: {
        id: newImage?.id,
        senderId: newImage?.senderId,
        senderUsername: newImage?.senderUsername,
        status: newImage?.status,
        createdAt: newImage?.createdAt,
      }
    };

    await broadcastToConnections(apiGateway, ddbDocClient, connectionsTable, receiverConnections, receiverMessage);

    // Notify sender that the friend request was sent
    const senderConnections = await getConnectionsForUsers(ddbDocClient, connectionsTable, [newImage.senderId]);
    const senderMessage = {
      type: 'FRIEND_REQUEST_SENT',
      data: {
        id: newImage?.id,
        receiverId: newImage?.receiverId,
        receiverUsername: newImage?.receiverUsername,
        status: newImage?.status,
        createdAt: newImage?.createdAt,
      }
    };
    await broadcastToConnections(apiGateway, ddbDocClient, connectionsTable, senderConnections, senderMessage);
  }

  // ❌ REMOVED: Friend request ACCEPTED broadcast
  // The accept-friend-request Lambda now handles ACCEPTED notifications directly
  // No need to broadcast on status update since we skip that step entirely

  // Friend request deleted (rejected or withdrawn)
  if (record.eventName === 'REMOVE' && oldImage) {
    console.log('🗑️ Friend request deleted');

    // Notify both sender and receiver with complete data
    const userIds = [oldImage.senderId, oldImage.receiverId];
    const connections = await getConnectionsForUsers(ddbDocClient, connectionsTable, userIds);

    const message = {
      type: 'FRIEND_REQUEST_DELETED',
      data: {
        requestId: oldImage.id,
        senderId: oldImage.senderId,
        senderUsername: oldImage.senderUsername,
        receiverId: oldImage.receiverId,
        receiverUsername: oldImage.receiverUsername,
      }
    };

    await broadcastToConnections(apiGateway, ddbDocClient, connectionsTable, connections, message);
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getFriendIds(
  ddbDocClient: DynamoDBDocumentClient,
  friendTable: string,
  userId: string
): Promise<string[]> {
  // Query both directions
  const [asUser, asFriend] = await Promise.all([
    ddbDocClient.send(new QueryCommand({
      TableName: friendTable,
      IndexName: 'friendsByUserId',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId }
    })),
    ddbDocClient.send(new QueryCommand({
      TableName: friendTable,
      IndexName: 'friendsByFriendId',
      KeyConditionExpression: 'friendId = :friendId',
      ExpressionAttributeValues: { ':friendId': userId }
    }))
  ]);

  const friendIds = new Set<string>();

  asUser.Items?.forEach(item => friendIds.add(item.friendId));
  asFriend.Items?.forEach(item => friendIds.add(item.userId));

  return Array.from(friendIds);
}

async function getConnectionsForUsers(
  ddbDocClient: DynamoDBDocumentClient,
  connectionsTable: string,
  userIds: string[]
): Promise<string[]> {
  const connections: string[] = [];

  await Promise.all(
    userIds.map(async (userId) => {
      const result = await ddbDocClient.send(new QueryCommand({
        TableName: connectionsTable,
        IndexName: 'webSocketConnectionsByUserId',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': userId }
      }));

      result.Items?.forEach(item => connections.push(item.connectionId));
    })
  );

  return connections;
}

async function broadcastToConnections(
  apiGateway: ApiGatewayManagementApiClient,
  ddbDocClient: DynamoDBDocumentClient,
  connectionsTable: string,
  connectionIds: string[],
  message: any
) {
  const messageData = JSON.stringify(message);

  await Promise.all(
    connectionIds.map(async (connectionId) => {
      try {
        await apiGateway.send(new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: Buffer.from(messageData)
        }));
        console.log(`✅ Sent to connection: ${connectionId}`);
      } catch (error: any) {
        if (error.statusCode === 410) {
          console.log(`🗑️ Stale connection ${connectionId}, removing...`);
          await ddbDocClient.send(new DeleteCommand({
            TableName: connectionsTable,
            Key: { id: connectionId }
          }));
        } else {
          console.error(`❌ Error sending to ${connectionId}:`, error);
        }
      }
    })
  );
}