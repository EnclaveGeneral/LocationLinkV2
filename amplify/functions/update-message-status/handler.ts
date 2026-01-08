// amplify/functions/update-message-status/handler.ts
// STREAMLINED VERSION - Only handles 'delivered' status
import type { Schema } from '../../data/resource';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

const apiGatewayClient = new ApiGatewayManagementApiClient({
  endpoint: process.env.WEBSOCKET_ENDPOINT
});

export const handler: Schema['updateMessageStatus']['functionHandler'] = async (event) => {
  console.log('🔄 Update Message Status Lambda Started');
  console.log('Arguments:', event.arguments);

  const { messageIds, status } = event.arguments;

  // Validate status - only 'delivered' is supported now
  if (status !== 'delivered') {
    console.error('❌ Invalid status:', status);
    return {
      success: false,
      message: 'Only "delivered" status is supported',
    };
  }

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
    const validMessageIds = messageIds.filter((id): id is string => id !== null && id !== undefined);
    const updatePromises = validMessageIds.map((messageId: string) =>
      ddbDocClient.send(new UpdateCommand({
        TableName: chatMessageTable,
        Key: { messageId },
        UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
        ConditionExpression: '#status = :sent', // Only update if currently 'sent'
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': status,
          ':sent': 'sent',
          ':updatedAt': new Date().toISOString(),
        },
        ReturnValues: 'ALL_NEW',
      })).catch(err => {
        // Ignore condition check failures (message already delivered)
        if (err.name === 'ConditionalCheckFailedException') {
          console.log(`⏭️ Message ${messageId} already delivered, skipping`);
          return null;
        }
        throw err;
      })
    );

    const results = await Promise.all(updatePromises);
    const updatedMessages = results.filter(r => r?.Attributes).map(r => r!.Attributes);

    console.log(`✅ Updated ${updatedMessages.length} messages`);

    if (updatedMessages.length === 0) {
      return {
        success: true,
        message: 'No messages needed updating (already delivered)',
      };
    }

    // Notify senders via WebSocket
    const senderIds = new Set<string>();
    const messageUpdates: any[] = [];

    for (const msg of updatedMessages) {
      senderIds.add(msg?.senderId);
      messageUpdates.push({
        messageId: msg?.messageId,
        conversationId: msg?.conversationId,
        status: msg?.status,
      });
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
              type: 'message_delivered',
              messages: messageUpdates.filter(m => {
                const msg = updatedMessages.find(um => um?.messageId === m.messageId);
                return msg?.senderId === senderId;
              }),
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
      message: `Updated ${updatedMessages.length} message(s) to ${status}`,
    };

  } catch (error) {
    console.error('❌ Error updating message status:', error);
    return {
      success: false,
      message: 'Failed to update message status',
    };
  }
};