// amplify/functions/websocket-message/handler.ts
// STREAMLINED VERSION - Supports MARK_DELIVERED, simplified typing indicator
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, PutCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

const apiGatewayClient = new ApiGatewayManagementApiClient({
  endpoint: process.env.WEBSOCKET_ENDPOINT
});

export const handler = async (event: any) => {
  console.log('📨 WebSocket Message Event:', JSON.stringify(event, null, 2));

  const connectionId = event.requestContext.connectionId;
  const body = JSON.parse(event.body || '{}');

  try {
    const connectionsTable = process.env.CONNECTIONS_TABLE_NAME;

    if (!connectionsTable) {
      throw new Error('CONNECTIONS_TABLE_NAME not configured');
    }

    // Handle different message types
    switch (body.action) {
      case 'ping':
        // Update last ping time to keep connection alive
        await ddbDocClient.send(new UpdateCommand({
          TableName: connectionsTable,
          Key: { id: connectionId },
          UpdateExpression: 'SET lastPingAt = :time',
          ExpressionAttributeValues: {
            ':time': new Date().toISOString()
          }
        }));
        console.log('✅ Ping received and updated');
        break;

      case 'message':
        // Handle incoming user sent messages
        if (body.type === 'CHAT_MESSAGE') {
          await handleChatMessage(body, connectionId);
        }

        if (body.type === 'TYPING_START' || body.type === 'TYPING_STOP') {
          await handleTypingIndicator(body, connectionId);
        }

        if (body.type === 'MARK_DELIVERED') {
          await handleMarkDelivered(body, connectionId);
        }
        break;

      default:
        console.log('⚠️ Unknown action:', body.action);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Message processed' })
    };

  } catch (error) {
    console.error('❌ Error processing message:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to process message' })
    };
  }
};

// Handle typing indicator (focus/blur based)
async function handleTypingIndicator(message: any, connectionId: string) {
  console.log('👀 Handling typing indicator:', message);

  const { conversationId, senderId, receiverId, type } = message;
  const isTyping = type === 'TYPING_START';

  try {
    // Find receiver's connection
    const connectionsResponse = await ddbDocClient.send(new QueryCommand({
      TableName: process.env.CONNECTIONS_TABLE_NAME!,
      IndexName: 'webSocketConnectionsByUserId',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: {
        ':uid': receiverId
      }
    }));

    const receiverConnection = connectionsResponse.Items?.[0];

    if (receiverConnection) {
      await apiGatewayClient.send(new PostToConnectionCommand({
        ConnectionId: receiverConnection.connectionId,
        Data: JSON.stringify({
          type: 'typing_indicator',
          conversationId,
          senderId,
          isTyping
        })
      }));
      console.log('✅ Typing indicator sent:', isTyping ? 'typing' : 'stopped');
    }
  } catch (error) {
    console.error('❌ Error sending typing indicator:', error);
  }
}

// Handle marking messages as delivered when receiver opens chat
async function handleMarkDelivered(message: any, connectionId: string) {
  console.log('📖 Handling mark delivered:', message);

  const { messageIds, conversationId, receiverId } = message;

  if (!messageIds || messageIds.length === 0) {
    console.log('⚠️ No message IDs to mark as delivered');
    return;
  }

  try {
    const chatMessageTable = process.env.CHAT_MESSAGE_TABLE_NAME!;
    const connectionsTable = process.env.CONNECTIONS_TABLE_NAME!;

    // Update each message status to 'delivered'
    const updatePromises = messageIds.map((messageId: string) =>
      ddbDocClient.send(new UpdateCommand({
        TableName: chatMessageTable,
        Key: { messageId },
        UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
        ConditionExpression: '#status = :sent', // Only update if currently 'sent'
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': 'delivered',
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

    console.log(`✅ Updated ${updatedMessages.length} messages to delivered`);

    if (updatedMessages.length === 0) {
      return; // No messages were updated
    }

    // Group messages by sender to notify each sender
    const senderIds = new Set<string>();
    const messageUpdates: any[] = [];

    for (const msg of updatedMessages) {
      senderIds.add(msg.senderId);
      messageUpdates.push({
        messageId: msg.messageId,
        conversationId: msg.conversationId,
        status: msg.status,
      });
    }

    // Notify each sender via WebSocket
    for (const senderId of senderIds) {
      console.log(`📤 Notifying sender: ${senderId}`);

      const connectionsResponse = await ddbDocClient.send(new QueryCommand({
        TableName: connectionsTable,
        IndexName: 'webSocketConnectionsByUserId',
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: {
          ':uid': senderId,
        },
      }));

      const senderConnections = connectionsResponse.Items || [];

      for (const conn of senderConnections) {
        try {
          await apiGatewayClient.send(new PostToConnectionCommand({
            ConnectionId: conn.connectionId,
            Data: JSON.stringify({
              type: 'message_delivered',
              messages: messageUpdates.filter(m => {
                const msg = updatedMessages.find(um => um.messageId === m.messageId);
                return msg?.senderId === senderId;
              }),
            }),
          }));
          console.log(`✅ Sent delivered notification to connection: ${conn.connectionId}`);
        } catch (error: any) {
          if (error.statusCode === 410) {
            console.log(`🗑️ Stale connection ${conn.connectionId}, skipping`);
          } else {
            console.error(`❌ Error sending to ${conn.connectionId}:`, error);
          }
        }
      }
    }

  } catch (error) {
    console.error('❌ Error marking messages as delivered:', error);
  }
}

// Handle chat message and send it to the correct user (receiver)
async function handleChatMessage(message: any, connectionId: string) {
  const { conversationId, senderId, receiverId, messageText } = message;

  console.log('💬 Handling chat message:', { conversationId, senderId, receiverId });

  try {
    // Generate a new unique messageId
    const messageId = randomUUID();
    const timestamp = new Date().toISOString();

    // Step 1: Store chat message in DynamoDB
    await ddbDocClient.send(new PutCommand({
      TableName: process.env.CHAT_MESSAGE_TABLE_NAME!,
      Item: {
        messageId: messageId,
        conversationId: conversationId,
        senderId: senderId,
        receiverId: receiverId,
        content: messageText,
        timestamp: timestamp,
        status: 'sent',
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    }));

    console.log('✅ Chat message stored in DynamoDB:', messageId);

    // Step 2: Update the conversation metadata
    const conversationResponse = await ddbDocClient.send(new GetCommand({
      TableName: process.env.CHAT_CONVERSATION_TABLE_NAME!,
      Key: { conversationId: conversationId }
    }));

    const curConversation = conversationResponse.Item;

    if (!curConversation) {
      console.error('❌ Conversation not found:', conversationId);
      return;
    }

    // Step 3: Update conversation with last message and increment unread count
    const isReceiverParticipant1 = receiverId === curConversation.participant1Id;
    const unreadCountField = isReceiverParticipant1 ? 'unreadCountUser1' : 'unreadCountUser2';

    await ddbDocClient.send(new UpdateCommand({
      TableName: process.env.CHAT_CONVERSATION_TABLE_NAME!,
      Key: { conversationId: conversationId },
      UpdateExpression: 'SET lastMessageText = :text, lastMessageTimestamp = :time, lastMessageSenderId = :sender, #unreadField = if_not_exists(#unreadField, :zero) + :inc, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#unreadField': unreadCountField,
      },
      ExpressionAttributeValues: {
        ':text': messageText,
        ':time': timestamp,
        ':sender': senderId,
        ':inc': 1,
        ':zero': 0,
        ':updatedAt': timestamp,
      }
    }));

    console.log('✅ Conversation metadata updated');

    // Step 4: Try to send via WebSocket if receiver is online
    const connectionsResponse = await ddbDocClient.send(new QueryCommand({
      TableName: process.env.CONNECTIONS_TABLE_NAME!,
      IndexName: 'webSocketConnectionsByUserId',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: {
        ':uid': receiverId
      }
    }));

    const receiverConnection = connectionsResponse.Items?.[0];

    if (receiverConnection) {
      const receiverConnectionId = receiverConnection.connectionId;
      console.log('✅ Receiver is online, sending via WebSocket:', receiverConnectionId);

      // Send new_message to receiver
      await apiGatewayClient.send(new PostToConnectionCommand({
        ConnectionId: receiverConnectionId,
        Data: JSON.stringify({
          type: 'new_message',
          messageId: messageId,
          conversationId: conversationId,
          senderId: senderId,
          receiverId: receiverId,
          content: messageText,
          timestamp: timestamp,
          status: 'sent',
        })
      }));

      // Also send conversation_update for ChatListScreen
      await apiGatewayClient.send(new PostToConnectionCommand({
        ConnectionId: receiverConnectionId,
        Data: JSON.stringify({
          type: 'conversation_update',
          conversationId: conversationId,
          lastMessageText: messageText,
          lastMessageTimestamp: timestamp,
          lastMessageSenderId: senderId,
          incrementUnread: true,
        })
      }));

      console.log('✅ Message and conversation update delivered to receiver');
    } else {
      console.log('⚠️ Receiver is offline - message saved to DB for later retrieval');
      // TODO: Could trigger push notification here
    }

    // Step 5: Send confirmation back to sender
    await apiGatewayClient.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: JSON.stringify({
        type: 'message_sent',
        messageId: messageId,
        conversationId: conversationId,
        content: messageText,
        timestamp: timestamp,
        status: 'sent',
      })
    }));

    // Also send conversation_update to sender for their ChatListScreen
    await apiGatewayClient.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: JSON.stringify({
        type: 'conversation_update',
        conversationId: conversationId,
        lastMessageText: messageText,
        lastMessageTimestamp: timestamp,
        lastMessageSenderId: senderId,
        incrementUnread: false, // Sender doesn't get unread increment
      })
    }));

    console.log('✅ Confirmation sent to sender');

  } catch (error) {
    console.error('❌ Error handling chat message:', error);

    // Send error back to sender
    try {
      await apiGatewayClient.send(new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: JSON.stringify({
          type: 'message_error',
          error: 'Failed to send message',
          originalMessage: message,
        })
      }));
    } catch (sendError) {
      console.error('❌ Failed to send error notification:', sendError);
    }
  }
}