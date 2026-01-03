import { generateClient } from "aws-amplify/api";
import type { Schema } from '../../amplify/data/resource'
import { WebSocketService } from "./websocketService";

const client = generateClient<Schema>();

export const chatService = {

  // Retrieve current conversation object or create one if it doesn't exist
  async getOrCreateConversation(currentUserId: string, friendId: string) {

    // Sort it such that user1 and user2 is always in alphabetical order
    const [user1, user2] = [currentUserId, friendId].sort();

    const conversationId = `${user1}_${user2}`;

    // Now attemt to fetch existing conversation, if not, create a new one
    try {
      // See if conversationId already exists
      const {data: existing} = await client.models.ChatConversation.get({
        conversationId: conversationId
      });

      // If we already have it
      if (existing) {
        return existing;
      }

      // Otherwise, we need to create a new one then deploy it
      const {data: newConversation} = await client.models.ChatConversation.create({
        conversationId: conversationId,
        participant1Id: user1,
        participant2Id: user2,
        unreadCountUser1: 0,
        unreadCountUser2: 0,
      });

      return newConversation;

    } catch (error) {
      console.error('Error fetching/creating conversation:', error);
      throw error;
    }
  },

  // Fetch a specific conversation by ConversationId
  async getConversation(conversationId: string) {
    try {
      const { data } = await client.models.ChatConversation.get({
        conversationId: conversationId
      });
      return data;
    } catch (error: any) {
      console.error('Error fetching conversation:', error.message);
      return null;
    }
  },

  // Fetch all conversations where the current user is a participant
  async getUserConversations(userId: string) {
    try {
      const { data } = await client.models.ChatConversation.list({
        filter: {
          or: [
            { participant1Id: { eq: userId } },
            { participant2Id: { eq: userId } }
          ]
        }
      })

      return data.sort((a, b) => {
        const timeA = a.lastMessageTimestamp || '';
        const timeB = b.lastMessageTimestamp || '';
        return timeB.localeCompare(timeA);
      });
    } catch (error) {
      console.error('Error fetching user conversations:', error);
      return [];
    }
  },

  // Load messages for a specific chatConversation object between two users
  async getConversationMessages(conversationId: string, limit = 50) {
    try {
      const { data } = await client.models.ChatMessage.list({
        filter: {
          conversationId: { eq: conversationId }
        },
        limit,
      });

      // ✅ Filter out null/undefined items BEFORE sorting
      const validMessages = data.filter(msg => msg !== null && msg !== undefined);

      return validMessages.sort((a, b) => {
        const timeA = a.timestamp;
        const timeB = b.timestamp;
        return timeA.localeCompare(timeB);
      });

    } catch (error) {
      console.error('Error loading messages:', error);
      return [];
    }
  },

  // Reset unread message count for a user in a conversation
  async markConversationAsRead(conversationId: string, userId: string, conversation: any) {
    try {
      // Determine which unread field to reset
      const isUser1 = userId === conversation.participant1Id;
      const unreadField = isUser1 ? 'unreadCountUser1' : 'unreadCountUser2';

      // Update the appropriate unread count to 0
      await client.models.ChatConversation.update({
        conversationId: conversationId,
        [unreadField]: 0,  // Dynamic field name using bracket notation
      });

      console.log(`✅ Marked conversation ${conversationId} as read for user ${userId}`);
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  },

  // Get unread count for a specific conversation and user
  getUnreadCount(conversation: any, userId: string): number {
    if (!conversation) return 0;

    const isUser1 = userId === conversation.participant1Id;
    const unreadCount = isUser1
      ? conversation.unreadCountUser1
      : conversation.unreadCountUser2;

    return unreadCount || 0;
  },

  // Send a new message in a chatConversation object
  sendMessage (
    ws: WebSocketService,
    conversationId: string,
    senderId: string,
    receiverId: string,
    messageText: string
  ) {
    ws.send({
      action: 'message',
      type: 'CHAT_MESSAGE',
      conversationId: conversationId,
      senderId: senderId,
      receiverId: receiverId,
      messageText: messageText,
    });
    console.log('➡️ Sending chat message:', { conversationId, senderId, receiverId, messageText });
  },

  sendTypingIndicator (
    ws: WebSocketService,
    conversationId: string,
    senderId: string,
    receiverId: string,
    isTyping: boolean
  ) {
    ws.send({
      action: 'message',
      type: 'TYPING_INDICATOR',
      conversationId: conversationId,
      senderId: senderId,
      receiverId: receiverId,
      isTyping: isTyping,
    })
  }
};
