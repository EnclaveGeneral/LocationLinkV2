// amplify/functions/websocket-disconnect/handler.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

export const handler = async (event: any) => {
  console.log('🔴 WebSocket Disconnect Event:', JSON.stringify(event, null, 2));

  const connectionId = event.requestContext.connectionId;

  try {
    const connectionsTable = process.env.CONNECTIONS_TABLE_NAME;

    if (!connectionsTable) {
      throw new Error('CONNECTIONS_TABLE_NAME not configured');
    }

    console.log(`🗑️ Removing connection: ${connectionId}`);

    await ddbDocClient.send(new DeleteCommand({
      TableName: connectionsTable,
      Key: { id: connectionId }
    }));

    console.log('✅ Connection removed successfully');

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Disconnected' })
    };

  } catch (error) {
    console.error('❌ Error disconnecting:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to disconnect' })
    };
  }
};