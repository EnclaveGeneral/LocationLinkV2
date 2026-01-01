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
        // Handle incoming messages
        if (body.type === 'chat_message') {
          await handleChatMessage(body, connectionId);
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

// Handle chat message and send it to the correct user (receiver)
async function handleChatMessage(message: any, connectionId: string) {

  // Step 1: Store chat message in DynamoDB

  // Get all parameters from chatMessage object
  const { conversationId, senderId, receiverId, messageText } = message;

  console.log('💬 Handling chat message:', { conversationId, senderId, receiverId });

  try {

    // Generate a new random chatMessageId that is unique
    const chatMessageId = randomUUID();

    // Get the current timeframe for the message stamp
    const timestamp = new Date().toISOString();

    await ddbDocClient.send(new PutCommand({
      TableName: process.env.CHAT_MESSAGE_TABLE_NAME!,
      Item: {
        messageId: chatMessageId,
        conversationId,
        senderId,
        receiverId,
        messageText,
        timestamp,
        status: 'sent',
      }
    }));

    console.log('✅ Chat message stored on DynamoDB:', chatMessageId);

    // Step 2: Fetch the conversation object: chatConversationID
    const conversationResponse = await ddbDocClient.send( new GetCommand({
      TableName: process.env.CHAT_CONVERSATION_TABLE_NAME!,
      Key: { conversationId: conversationId }
    }));

    const curConversation = conversationResponse.Item;

    if (!curConversation) {
      console.error('❌ Conversation not found:', conversationId);
      return;  // Exit early if conversation doesn't exist
    }

    console.log('✅ Conversation fetched:', conversationId);

    // Step 3: Update the conversation metadata
    // Determine which unread counter to increment

    const isReceiverParticipant1 = receiverId === curConversation.participant1Id;
    const unreadCountField = isReceiverParticipant1 ? 'unreadCountUser1' : 'unreadCountUser2';

    await ddbDocClient.send(new UpdateCommand({
      TableName: process.env.CHAT_CONVERSATION_TABLE_NAME!,
      Key: { conversationId: conversationId },
      UpdateExpression: 'SET lastMessageText = :text, lastMessageTimestamp = :time, lastMessageSenderId = :sender, #unreadField = #unreadField + :inc',
      ExpressionAttributeNames: {
        '#unreadField': unreadCountField,
      },
      ExpressionAttributeValues: {
        ':text': messageText,
        ':time': timestamp,
        ':sender': senderId,
        ':inc': 1
      }
    }));

    console.log('✅ Conversation updated');

    // Step 4: Here you would typically send the message to the receiver via WebSocket
    // Use the user connectionID to send the message directly
    const connectionsResponse = await ddbDocClient.send(new QueryCommand({
      TableName: process.env.CONNECTIONS_TABLE_NAME!,
      IndexName: 'webSocketConnectionsByUserId',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: {
        ':uid': receiverId
      }
    }));

    const receiverConnection = connectionsResponse.Items?.[0];

    if (!receiverConnection) {
      console.log('⚠️ Receiver is offline, message saved but not delivered in real-time');
      return;  // Exit - message is saved in DB, but receiver isn't online
    }

    const receiverConnectionId = receiverConnection.connectionId;
    console.log('✅ Receiver connection found:', receiverConnectionId);

    // Here you would integrate with API Gateway to send the message to receiverConnectionId
    // This part is omitted for brevity

    // Step 5: Directly send it!
    await apiGatewayClient.send(new PostToConnectionCommand({
      ConnectionId: receiverConnectionId,
      Data: JSON.stringify({
        type: 'new_message',
        messageId: chatMessageId,
        conversationId,
        senderId,
        content: messageText,
        timestamp,
      })
    }));
    console.log('✅ Message sent to receiver via WebSocket');

    // Step 6: Send confirmation back to the sender
    await apiGatewayClient.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: JSON.stringify({
        type: 'message_sent',
        messageId: chatMessageId,
        conversationId,
        timestamp,
      })
    }));
    console.log('✅ Confirmation sent to sender via WebSocket');


  } catch (error) {
    console.error('❌ Error handling chat message: ', error);
  }
}