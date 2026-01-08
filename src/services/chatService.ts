// src/services/chatService.ts
// STREAMLINED VERSION - Simplified typing indicator, removed 'read' status
import { generateClient } from "aws-amplify/api";
import type { Schema } from '../../amplify/data/resource';
import { WebSocketService } from "./websocketService";

const client = generateClient<Schema>();

export const chatService = {

  // ============================================
  // CONVERSATION MANAGEMENT
  // ============================================

  // Retrieve current conversation object or create one if it doesn't exist
  async getOrCreateConversation(currentUserId: string, friendId: string) {
    // Sort it such that user1 and user2 is always in alphabetical order
    const [user1, user2] = [currentUserId, friendId].sort();
    const conversationId = `${user1}_${user2}`;

    try {
      // See if conversationId already exists
      const { data: existing } = await client.models.ChatConversation.get({
        conversationId: conversationId
      });

      if (existing) {
        return existing;
      }

      // Otherwise, create a new one
      const { data: newConversation } = await client.models.ChatConversation.create({
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
      });

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

  // ==================
  // Delete a conversation and all messages associated with the conversation
  // ==================

  async deleteConversationAndMessages(conversationId: string) {
    try {

      // Delete all message related to this conversation as well!
      const { data: messages } = await client.models.ChatMessage.list({
        filter: {
          conversationId: { eq: conversationId }
        }
      });

      // Delete each message
      for (const message of messages) {
        await client.models.ChatMessage.delete({
          messageId: message.messageId
        });
      }

      // Delete this conversation
      await client.models.ChatConversation.delete({
        conversationId: conversationId
      })

      console.log('Conversation and its associated message deleted successfully!');
    } catch (error: any) {
      console.log('❌ Error deleting selected conversation and its associated messages: ', error.message);
      throw error;
    }
  },

  // ============================================
  // MESSAGE MANAGEMENT
  // ============================================

  async getConversationMessages(conversationId: string, limit = 50) {
    try {
      console.log('🔍 Fetching messages via Lambda:', conversationId);

      const response = await client.queries.getMessagesQuery({
        conversationId,
        limit
      });

      console.log('📦 Full Lambda response:', JSON.stringify(response, null, 2));
      console.log('📦 response.data:', response.data);
      console.log('📦 response.errors:', response.errors);

      // Check for errors first
      if (response.errors && response.errors.length > 0) {
        console.error('❌ GraphQL errors:', response.errors);
        throw new Error(response.errors[0].message);
      }

      // Handle different possible response structures
      let messages: any[] = [];

      if (Array.isArray(response.data)) {
        messages = response.data;
        console.log('📦 Messages as direct array:', messages.length);
      } else if (response.data && typeof response.data === 'object') {
        console.log('📦 Response data keys:', Object.keys(response.data));
        messages = response.data;
      } else {
        console.warn('⚠️ Unexpected response format');
        messages = [];
      }

      console.log('📦 Final messages count:', messages.length);
      if (messages.length > 0) {
        console.log('📝 First message:', messages[0]);
      }

      return messages;

    } catch (error) {
      console.error('❌ Error loading messages:', error);
      return [];
    }
  },

  // ============================================
  // STATUS MANAGEMENT
  // ============================================

  // Reset unread message count for a user in a conversation
  async markConversationAsRead(conversationId: string, userId: string, conversation: any) {
    try {
      // Determine which unread field to reset
      const isUser1 = userId === conversation.participant1Id;
      const unreadField = isUser1 ? 'unreadCountUser1' : 'unreadCountUser2';

      await client.models.ChatConversation.update({
        conversationId: conversationId,
        [unreadField]: 0,
      });

      console.log(`✅ Marked conversation ${conversationId} as read for user ${userId}`);
    } catch (error) {
      console.error('Error marking as read:', error);
      throw error;
    }
  },

  // Mark messages as delivered (called when user opens chat)
  async markMessagesDelivered(messageIds: string[]) {
    if (messageIds.length === 0) {
      console.log('⏭️ No messages to mark as delivered');
      return true;
    }

    try {
      console.log(`🔄 Marking ${messageIds.length} message(s) as delivered`);

      const { data, errors } = await client.mutations.updateMessageStatus({
        messageIds,
        status: 'delivered',
      });

      if (errors) {
        console.error('Error updating status:', errors);
        throw new Error(errors[0]?.message || 'Failed to update status');
      }

      if (!data?.success) {
        throw new Error(data?.message || 'Failed to update status');
      }

      console.log(`✅ Status updated: ${data.message}`);
      return true;
    } catch (error) {
      console.error('Error marking messages as delivered:', error);
      return false;
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

  // ============================================
  // WEBSOCKET MESSAGING
  // ============================================

  // Send a new message via WebSocket
  sendMessage(
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

  // Send typing START indicator (when TextInput is focused)
  sendTypingStart(
    ws: WebSocketService,
    conversationId: string,
    senderId: string,
    receiverId: string
  ) {
    ws.send({
      action: 'message',
      type: 'TYPING_START',
      conversationId: conversationId,
      senderId: senderId,
      receiverId: receiverId,
    });
    console.log('⌨️ Sending typing START');
  },

  // Send typing STOP indicator (when TextInput is blurred or screen unmounts)
  sendTypingStop(
    ws: WebSocketService,
    conversationId: string,
    senderId: string,
    receiverId: string
  ) {
    ws.send({
      action: 'message',
      type: 'TYPING_STOP',
      conversationId: conversationId,
      senderId: senderId,
      receiverId: receiverId,
    });
    console.log('⌨️ Sending typing STOP');
  },

  // Mark messages as delivered via WebSocket (alternative to GraphQL mutation)
  sendMarkDelivered(
    ws: WebSocketService,
    messageIds: string[],
    conversationId: string,
    receiverId: string
  ) {
    if (messageIds.length === 0) return;

    ws.send({
      action: 'message',
      type: 'MARK_DELIVERED',
      messageIds: messageIds,
      conversationId: conversationId,
      receiverId: receiverId,
    });
    console.log('📖 Sending mark delivered for', messageIds.length, 'messages');
  },
};