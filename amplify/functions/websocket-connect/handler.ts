// amplify/functions/websocket-connect/handler.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

export const handler = async (event: any) => {
  console.log('🔵 WebSocket Connect Event:', JSON.stringify(event, null, 2));

  const connectionId = event.requestContext.connectionId;
  const queryParams = event.queryStringParameters || {};
  const userId = queryParams.userId;

  if (!userId) {
    console.error('❌ No userId provided');
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'userId is required' })
    };
  }

  try {
    const connectionsTable = process.env.CONNECTIONS_TABLE_NAME;

    if (!connectionsTable) {
      throw new Error('CONNECTIONS_TABLE_NAME not configured');
    }

    console.log(`📝 Storing connection: ${connectionId} for user: ${userId}`);

    await ddbDocClient.send(new PutCommand({
      TableName: connectionsTable,
      Item: {
        id: connectionId,
        connectionId: connectionId,
        userId: userId,
        connectedAt: new Date().toISOString(),
        lastPingAt: new Date().toISOString(),
        owner: userId, // For authorization
      }
    }));

    console.log('✅ Connection stored successfully');

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Connected', connectionId })
    };

  } catch (error) {
    console.error('❌ Error connecting:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to connect' })
    };
  }
};