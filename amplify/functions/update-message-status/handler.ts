// amplify/functions/update-message-status/handler.ts
import type { Schema } from '../../data/resource';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

const apiGatewayClient = new ApiGatewayManagementApiClient({
  endpoint: process.env.WEBSOCKET_ENDPOINT
});

export const handler = async (event: any) => {
  console.log('🔄 Update Message Status Lambda Started');
  console.log('Arguments:', event.arguments);

  const { messageIds, status } = event.arguments;

  // Get userId from identity
  let userId: string | undefined;
  if (event.identity && 'sub' in event.identity) {
    userId = event.identity.sub;
  }

  if (!userId) {
    console.error('❌ Could not extract userId');
    return {
      success: false,
      message: 'Authentication error',
    };
  }

  const chatMessageTable = process.env.CHAT_MESSAGE_TABLE_NAME;
  const connectionsTable = process.env.CONNECTIONS_TABLE_NAME;

  if (!chatMessageTable || !connectionsTable) {
    throw new Error('Table names not configured');
  }

  try {
    console.log(`📝 Updating ${messageIds.length} message(s) to status: ${status}`);

    // Update each message status in DB
    const updatePromises = messageIds.map((messageId: string) =>
      ddbDocClient.send(new UpdateCommand({
      TableName: chatMessageTable,
      Key: { messageId },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':status': status,
        ':updatedAt': new Date().toISOString(),
      },
      ReturnValues: 'ALL_NEW',
      }))
    );

    const results = await Promise.all(updatePromises);
    console.log(`✅ Updated ${results.length} messages`);

    // Notify senders via WebSocket
    // Get unique senderIds from the updated messages
    const senderIds = new Set<string>();
    const messageUpdates: any[] = [];

    for (const result of results) {
      if (result.Attributes) {
        senderIds.add(result.Attributes.senderId);
        messageUpdates.push({
          messageId: result.Attributes.messageId,
          conversationId: result.Attributes.conversationId,
          status: result.Attributes.status,
        });
      }
    }

    // Send WebSocket notifications to all senders
    for (const senderId of senderIds) {
      console.log(`📤 Notifying sender: ${senderId}`);
      
      // Get sender's connections
      const connectionsResponse = await ddbDocClient.send(new QueryCommand({
        TableName: connectionsTable,
        IndexName: 'webSocketConnectionsByUserId',
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: {
          ':uid': senderId,
        },
      }));

      const senderConnections = connectionsResponse.Items || [];

      // Send to each connection
      for (const conn of senderConnections) {
        try {
          await apiGatewayClient.send(new PostToConnectionCommand({
            ConnectionId: conn.connectionId,
            Data: JSON.stringify({
              type: status === 'delivered' ? 'message_delivered' : 'message_read',
              messages: messageUpdates.filter(m => 
                results.find(r => r.Attributes?.messageId === m.messageId && r.Attributes?.senderId === senderId)
              ),
            }),
          }));
          console.log(`✅ Sent notification to connection: ${conn.connectionId}`);
        } catch (error: any) {
          if (error.statusCode === 410) {
            console.log(`🗑️ Stale connection ${conn.connectionId}, skipping`);
          } else {
            console.error(`❌ Error sending to ${conn.connectionId}:`, error);
          }
        }
      }
    }

    return {
      success: true,
      message: `Updated ${messageIds.length} message(s) to ${status}`,
    };

  } catch (error) {
    console.error('❌ Error updating message status:', error);
    return {
      success: false,
      message: 'Failed to update message status',
    };
  }
};