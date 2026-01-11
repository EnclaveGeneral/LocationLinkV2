// amplify/functions/accept-friend-request/handler.ts
import type { Schema } from '../../data/resource';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

export const handler: Schema['acceptFriendRequestLambda']['functionHandler'] = async (event) => {
  console.log('🔵 Lambda - Accept Friend Request Started');
  console.log('Full event:', JSON.stringify(event, null, 2));

  const { requestId } = event.arguments;

  // Try multiple ways to get userId
  let userId: string | undefined;

  // Method 1: From identity.sub
  if (event.identity && 'sub' in event.identity) {
    userId = event.identity.sub;
  }

  // Method 2: From identity.username (Cognito)
  if (!userId && event.identity && 'username' in event.identity) {
    userId = event.identity.username;
  }

  // Method 3: From identity.claims.sub
  if (!userId && event.identity && 'claims' in event.identity) {
    const claims = event.identity.claims as any;
    userId = claims?.sub;
  }

  console.log('Extracted userId:', userId);
  console.log('Request ID:', requestId);

  if (!userId) {
    console.error('❌ Could not extract userId from identity');
    console.error('Identity object:', JSON.stringify(event.identity, null, 2));
    return {
      success: false,
      message: 'Authentication error: Could not determine user identity'
    };
  }

  if (!requestId) {
    return {
      success: false,
      message: 'Missing request ID'
    };
  }

  const client = new DynamoDBClient({});
  const ddbDocClient = DynamoDBDocumentClient.from(client);

  try {
    const userTable = process.env.USER_TABLE_NAME;
    const friendRequestTable = process.env.FRIEND_REQUEST_TABLE_NAME;
    const friendTable = process.env.FRIEND_TABLE_NAME;
    const connectionTable = process.env.CONNECTION_TABLE_NAME;
    const websocketEndpoint = process.env.WEBSOCKET_ENDPOINT;

    if (!userTable || !friendRequestTable || !friendTable) {
      throw new Error('Table names not configured');
    }

    console.log('Using tables:', { userTable, friendRequestTable, friendTable });

    // 1. Get the friend request
    console.log('📥 Fetching friend request...');
    const requestResult = await ddbDocClient.send(new GetCommand({
      TableName: friendRequestTable,
      Key: { id: requestId }
    }));

    const request = requestResult.Item;
    console.log('Friend request:', request);

    if (!request) {
      return {
        success: false,
        message: 'Request not found',
      };
    }

    if (request.receiverId !== userId) {
      console.log('❌ Unauthorized: userId does not match receiverId');
      return {
        success: false,
        message: 'Unauthorized: You are not the recipient of this request',
      };
    }

    // 2. Update request status to ACCEPTED
    console.log('📝 Updating request status to ACCEPTED...');
    await ddbDocClient.send(new UpdateCommand({
      TableName: friendRequestTable,
      Key: { id: requestId },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'ACCEPTED',
        ':updatedAt': new Date().toISOString()
      }
    }));

    // 3. Create Friend record
    console.log('👥 Creating friendship record...');
    const friendshipId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await ddbDocClient.send(new PutCommand({
      TableName: friendTable,
      Item: {
        id: friendshipId,
        userId: request.senderId,
        friendId: request.receiverId,
        userUsername: request.senderUsername,
        friendUsername: request.receiverUsername,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    }));

    console.log('✅ Friendship record created:', friendshipId);

    // 4. Update BOTH users' friends arrays
    console.log('📝 Updating users friends arrays...');
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

    console.log('Sender friends before:', senderFriends);
    console.log('Receiver friends before:', receiverFriends);

    // Add to arrays if not present
    if (!senderFriends.includes(request.receiverId)) {
      senderFriends.push(request.receiverId);
    }
    if (!receiverFriends.includes(request.senderId)) {
      receiverFriends.push(request.senderId);
    }

    console.log('Sender friends after:', senderFriends);
    console.log('Receiver friends after:', receiverFriends);

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

    console.log('✅ Users updated with new friend');

    // ============================================
    // 5. SEND WEBSOCKET NOTIFICATIONS (FIXED)
    // ============================================
    if (connectionTable && websocketEndpoint) {
      const apiGatewayClient = new ApiGatewayManagementApiClient({
        endpoint: websocketEndpoint,
      });

      // Get connections for both users
      const [senderConnections, receiverConnections] = await Promise.all([
        ddbDocClient.send(new GetCommand({
          TableName: connectionTable,
          Key: { userId: request.senderId }
        })),
        ddbDocClient.send(new GetCommand({
          TableName: connectionTable,
          Key: { userId: request.receiverId }
        }))
      ]);

      // ✅ FIXED: Send complete data to BOTH users
      const notifications = [];

      // Notify sender (person who sent the request)
      if (senderConnections.Item?.connectionIds) {
        for (const connectionId of senderConnections.Item.connectionIds) {
          notifications.push(
            apiGatewayClient.send(new PostToConnectionCommand({
              ConnectionId: connectionId,
              Data: JSON.stringify({
                type: 'FRIEND_REQUEST_ACCEPTED',
                data: {
                  requestId: requestId,
                  senderId: request.senderId,
                  senderUsername: request.senderUsername,
                  receiverId: request.receiverId,
                  receiverUsername: request.receiverUsername,
                }
              })
            })).catch(err => console.error('Error notifying sender:', err))
          );
        }
      }

      // Notify receiver (person who accepted the request)
      if (receiverConnections.Item?.connectionIds) {
        for (const connectionId of receiverConnections.Item.connectionIds) {
          notifications.push(
            apiGatewayClient.send(new PostToConnectionCommand({
              ConnectionId: connectionId,
              Data: JSON.stringify({
                type: 'FRIEND_REQUEST_ACCEPTED',
                data: {
                  requestId: requestId,
                  senderId: request.senderId,
                  senderUsername: request.senderUsername,
                  receiverId: request.receiverId,
                  receiverUsername: request.receiverUsername,
                }
              })
            })).catch(err => console.error('Error notifying receiver:', err))
          );
        }
      }

      // Send FRIEND_REQUEST_DELETED to both users
      if (senderConnections.Item?.connectionIds) {
        for (const connectionId of senderConnections.Item.connectionIds) {
          notifications.push(
            apiGatewayClient.send(new PostToConnectionCommand({
              ConnectionId: connectionId,
              Data: JSON.stringify({
                type: 'FRIEND_REQUEST_DELETED',
                data: {
                  requestId: requestId,
                  senderId: request.senderId,
                  senderUsername: request.senderUsername,
                }
              })
            })).catch(err => console.error('Error notifying sender deletion:', err))
          );
        }
      }

      if (receiverConnections.Item?.connectionIds) {
        for (const connectionId of receiverConnections.Item.connectionIds) {
          notifications.push(
            apiGatewayClient.send(new PostToConnectionCommand({
              ConnectionId: connectionId,
              Data: JSON.stringify({
                type: 'FRIEND_REQUEST_DELETED',
                data: {
                  requestId: requestId,
                  senderId: request.senderId,
                  senderUsername: request.senderUsername,
                }
              })
            })).catch(err => console.error('Error notifying receiver deletion:', err))
          );
        }
      }

      await Promise.allSettled(notifications);
      console.log('✅ WebSocket notifications sent');
    }

    // 6. Delete the friend request
    console.log('🗑️ Deleting friend request...');
    await ddbDocClient.send(new DeleteCommand({
      TableName: friendRequestTable,
      Key: { id: requestId }
    }));

    console.log('✅ Successfully accepted friend request');
    console.log(`Users ${request.senderId} and ${request.receiverId} are now friends`);

    return {
      success: true,
      message: 'Friend request accepted successfully',
    };

  } catch (error) {
    console.error('❌ Error:', error);
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};