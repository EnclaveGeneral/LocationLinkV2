// amplify/functions/websocket-message/handler.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

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