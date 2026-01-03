// amplify/functions/websocket-message/handler.ts
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

        if (body.type === 'TYPING_INDICATOR') {
          await handleTypingIndicator(body, connectionId);
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

// Handle typing indicator based on user current input status
async function handleTypingIndicator(message: any, connectionId: string) {
  console.log('👀 Handling typing indicator:', message);

  const { conversationId, senderId, receiverId, isTyping } = message;

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
      console.log('✅ Typing indicator sent');
    }
  } catch (error) {
    console.error('❌ Error sending typing indicator:', error);
  }
}

// Handle chat message and send it to the correct user (receiver)
async function handleChatMessage(message: any, connectionId: string) {

  // Step 1: Store chat message in DynamoDB
  const { conversationId, senderId, receiverId, messageText } = message;

  console.log('💬 Handling chat message:', { conversationId, senderId, receiverId });

  try {
    // Generate a new unique messageId
    const messageId = randomUUID();
    const timestamp = new Date().toISOString();

    // ⚠️ CRITICAL FIX: Use "content" field to match schema, not "messageText"
    await ddbDocClient.send(new PutCommand({
      TableName: process.env.CHAT_MESSAGE_TABLE_NAME!,
      Item: {
        messageId: messageId,
        conversationId: conversationId,
        senderId: senderId,
        receiverId: receiverId,
        content: messageText,  // ✅ Changed from "messageText" to "content"
        timestamp: timestamp,
        status: 'sent'
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

    console.log('✅ Conversation fetched:', conversationId);

    // Step 3: Update conversation with last message and increment unread count
    const isReceiverParticipant1 = receiverId === curConversation.participant1Id;
    const unreadCountField = isReceiverParticipant1 ? 'unreadCountUser1' : 'unreadCountUser2';

    await ddbDocClient.send(new UpdateCommand({
      TableName: process.env.CHAT_CONVERSATION_TABLE_NAME!,
      Key: { conversationId: conversationId },
      UpdateExpression: 'SET lastMessageText = :text, lastMessageTimestamp = :time, lastMessageSenderId = :sender, #unreadField = if_not_exists(#unreadField, :zero) + :inc',
      ExpressionAttributeNames: {
        '#unreadField': unreadCountField,
      },
      ExpressionAttributeValues: {
        ':text': messageText,
        ':time': timestamp,
        ':sender': senderId,
        ':inc': 1,
        ':zero': 0,  // Handle null unread counts
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

      // Send to receiver
      await apiGatewayClient.send(new PostToConnectionCommand({
        ConnectionId: receiverConnectionId,
        Data: JSON.stringify({
          type: 'new_message',
          messageId: messageId,
          conversationId: conversationId,
          senderId: senderId,
          content: messageText,
          timestamp: timestamp,
          status: 'sent',
        })
      }));
      console.log('✅ Message delivered to receiver via WebSocket');
    } else {
      console.log('⚠️ Receiver is offline - message saved to DB for later retrieval');
    }

    // Step 5: Send confirmation back to sender
    await apiGatewayClient.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: JSON.stringify({
        type: 'message_sent',
        messageId: messageId,
        conversationId: conversationId,
        timestamp: timestamp,
        status: 'sent',
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