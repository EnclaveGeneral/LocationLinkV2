// amplify/functions/get-messages/handler.ts
import type { Schema } from '../../data/resource';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

// ✅ Define the ChatMessage type from your schema
type ChatMessage = {
  messageId: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: string;
  status?: 'sent' | 'delivered' | null;
  createdAt: string;
  updatedAt: string;
};

export const handler: Schema['getMessagesQuery']['functionHandler'] = async (event) => {
  console.log('🔍 Get Messages Lambda Started');
  console.log('Arguments:', event.arguments);

  const { conversationId, limit } = event.arguments;

  const client = new DynamoDBClient({});
  const ddbDocClient = DynamoDBDocumentClient.from(client);

  try {
    const chatMessageTable = process.env.CHAT_MESSAGE_TABLE_NAME;

    if (!chatMessageTable) {
      throw new Error('CHAT_MESSAGE_TABLE_NAME not configured');
    }

    console.log(`📥 Querying messages for conversation: ${conversationId}`);

    const response = await ddbDocClient.send(new QueryCommand({
      TableName: chatMessageTable,
      IndexName: 'chatMessagesByConversationId',
      KeyConditionExpression: 'conversationId = :convId',
      ExpressionAttributeValues: {
        ':convId': conversationId
      },
      Limit: limit || 50,
      ScanIndexForward: false,
    }));

    // ✅ Cast to ChatMessage[] with proper typing
    const messages = (response.Items || []) as ChatMessage[];
    messages.reverse();
    console.log(`✅ Found ${messages.length} messages`);

    return messages; // ✅ Now returns ChatMessage[] instead of Record<string, any>[]

  } catch (error) {
    console.error('❌ Error fetching messages:', error);
    throw error;
  }
};