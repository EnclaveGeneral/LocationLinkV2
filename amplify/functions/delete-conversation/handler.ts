// amplify/functions/delete-conversation/handler.ts
import type { Schema } from '../../data/resource';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);


export const handler: Schema['deleteConversation']['functionHandler'] = async (event) => {
  console.log('🗑️ Delete Conversation Lambda Started');
  console.log('Arguments:', event.arguments);

  const { conversationId } = event.arguments;

  // Get userId from identity for authorization
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
  const chatConversationTable = process.env.CHAT_CONVERSATION_TABLE_NAME;

  if (!chatMessageTable || !chatConversationTable) {
    throw new Error('Table names not configured');
  }

  try {
    // Step 1: Verify user is a participant in this conversation (authorization)
    const conversationResponse = await ddbDocClient.send(new QueryCommand({
      TableName: chatConversationTable,
      KeyConditionExpression: 'conversationId = :convId',
      ExpressionAttributeValues: {
        ':convId': conversationId
      }
    }));

    const conversation = conversationResponse.Items?.[0];

    if (!conversation) {
      console.error('❌ Conversation not found:', conversationId);
      return {
        success: false,
        message: 'Conversation not found',
      };
    }

    // Check if user is a participant
    if (conversation.participant1Id !== userId && conversation.participant2Id !== userId) {
      console.error('❌ User not authorized to delete this conversation');
      return {
        success: false,
        message: 'Not authorized to delete this conversation',
      };
    }

    // Step 2: Query all messages for this conversation
    console.log(`📥 Querying messages for conversation: ${conversationId}`);

    const messagesResponse = await ddbDocClient.send(new QueryCommand({
      TableName: chatMessageTable,
      IndexName: 'chatMessagesByConversationId',
      KeyConditionExpression: 'conversationId = :convId',
      ExpressionAttributeValues: {
        ':convId': conversationId
      }
    }));

    const messages = messagesResponse.Items || [];
    console.log(`🗑️ Deleting ${messages.length} messages...`);

    // Step 3: Delete all messages
    for (const message of messages) {
      await ddbDocClient.send(new DeleteCommand({
        TableName: chatMessageTable,
        Key: {
          messageId: message.messageId
        }
      }));
    }

    console.log('✅ All messages deleted');

    // Step 4: Delete the conversation
    await ddbDocClient.send(new DeleteCommand({
      TableName: chatConversationTable,
      Key: {
        conversationId: conversationId
      }
    }));

    console.log('✅ Conversation deleted');

    return {
      success: true,
      message: `Conversation and ${messages.length} messages deleted successfully`,
    };

  } catch (error: any) {
    console.error('❌ Error deleting conversation:', error);
    return {
      success: false,
      message: error.message || 'Error deleting conversation',
    };
  }
};