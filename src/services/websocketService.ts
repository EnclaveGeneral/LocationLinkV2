// src/services/websocketService.ts - UPDATED WITH CHAT MESSAGE HANDLING
import { fetchAuthSession } from "aws-amplify/auth";

type MessageHandler = (data: any) => void;

// Helper function to get auth token
async function getAuthToken(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    return token || null;
  } catch (error) {
    console.error('Error fetching auth token:', error);
    return null;
  }
}

export class WebSocketService {
  private static instance: WebSocketService;
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private userId: string | null = null;
  private listeners: Map<string, Set<MessageHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private isIntentionalClose = false;
  private shouldReconnect = false;

  private constructor() {
    // WebSocket URL Access Address
    this.wsUrl = 'wss://4g5skmt4j7.execute-api.us-west-2.amazonaws.com/production/';
  }

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  async connect(userId: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('✅ WebSocket already connected');
      return;
    }

    this.userId = userId;
    this.isIntentionalClose = false;
    this.shouldReconnect = true;

    try {
      const token = await getAuthToken();

      if (!token) {
        throw new Error('No auth token available');
      }

      const url = `${this.wsUrl}?userId=${userId}&token=${token}`;
      console.log('🔵 Connecting to WebSocket...', url);

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected successfully');
        this.reconnectAttempts = 0;
        this.startPingInterval();
        this.emit('connected', { userId });
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('📨 WebSocket message received:', message);
          this.handleMessage(message);
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        const errorMsg = JSON.stringify(error);

        if (errorMsg.includes('Software caused connection abort')) {
          console.log('📱 WebSocket closed by OS (app backgrounded) - this is normal');
          return;
        }

        console.error('❌ WebSocket error:', error);
        this.emit('error', error);
      };

      this.ws.onclose = (event) => {
        console.log('🔴 WebSocket disconnected', {
          code: event.code,
          reason: event.reason,
          isIntentional: this.isIntentionalClose,
          shouldReconnect: this.shouldReconnect
        });

        this.stopPingInterval();
        this.emit('disconnected', { code: event.code, reason: event.reason });

        if (!this.isIntentionalClose && this.shouldReconnect) {
          console.log('🔄 Attempting reconnection...');
          this.reconnect();
        } else {
          console.log('📱 Skipping reconnect:', {
            intentional: this.isIntentionalClose,
            shouldReconnect: this.shouldReconnect
          });
        }
      };

    } catch (error) {
      console.error('❌ Error connecting to WebSocket:', error);

      if (this.shouldReconnect) {
        this.reconnect();
      }
    }
  }

  private handleMessage(message: any) {
    const { type } = message;

    switch (type) {
      // ============================================
      // FRIEND & USER UPDATES
      // ============================================
      case 'USER_UPDATE':
        this.emit('userUpdate', message);
        break;

      case 'FRIEND_ADDED':
        this.emit('friendAdded', message);
        break;

      case 'FRIEND_REMOVED':
        this.emit('friendRemoved', message);
        break;

      case 'FRIEND_REQUEST_SENT':
        this.emit('friendRequestSent', message);
        break;

      case 'FRIEND_REQUEST_RECEIVED':
        this.emit('friendRequestReceived', message);
        break;

      case 'FRIEND_REQUEST_ACCEPTED':
        this.emit('friendRequestAccepted', message);
        break;

      case 'FRIEND_REQUEST_DELETED':
        this.emit('friendRequestDeleted', message);
        break;

      case 'message_delivered':
        this.emit('message_delivered', message);
        break;

      case 'message_read':
        this.emit('message_read', message);
        break;

      // ============================================
      // CHAT MESSAGES (NEW)
      // ============================================
      case 'new_message':
        // Message received from another user
        console.log('📨 Emitting new_message event:', message);
        this.emit('new_message', message);
        break;

      case 'message_sent':
        // Confirmation that our message was sent
        console.log('✅ Emitting message_sent event:', message);
        this.emit('message_sent', message);
        break;

      case 'message_error':
        // Error sending message
        console.log('❌ Emitting message_error event:', message);
        this.emit('message_error', message);
        break;

      case 'typing_indicator':
        // Someone is typing
        console.log('👀 Emitting typing_indicator event:', message);
        this.emit('typing_indicator', message);
        break;

      default:
        console.log('⚠️ Unknown message type:', type);
    }
  }

  send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const message = JSON.stringify(data);
      this.ws.send(message);
      console.log('📤 Message sent:', data);
    } else {
      console.error('❌ WebSocket not connected, cannot send message');
      throw new Error('WebSocket not connected');
    }
  }

  private startPingInterval() {
    this.stopPingInterval();

    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ action: 'ping' });
      }
    }, 30000); // Ping every 30 seconds

    console.log('✅ Ping interval started');
  }

  private stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
      console.log('🛑 Ping interval stopped');
    }
  }

  private reconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnect attempts reached');
      this.shouldReconnect = false;
      this.emit('reconnectFailed', { attempts: this.reconnectAttempts });
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      if (this.userId && this.shouldReconnect) {
        this.connect(this.userId);
      }
    }, delay);
  }

  disconnect() {
    console.log('🔴 Intentionally disconnecting WebSocket');

    this.isIntentionalClose = true;
    this.shouldReconnect = false;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.stopPingInterval();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    console.log('✅ WebSocket disconnected, listeners preserved');
  }

  shutdown() {
    console.log('🔴 Shutting down WebSocket service completely');

    this.isIntentionalClose = true;
    this.shouldReconnect = false;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.stopPingInterval();

    if (this.ws) {
      this.ws.close(1000, 'Client shutdown');
      this.ws = null;
    }

    this.listeners.clear();
    this.userId = null;
    this.reconnectAttempts = 0;

    console.log('✅ WebSocket service shut down completely');
  }

  // Event emitter methods
  on(event: string, handler: MessageHandler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    console.log(`✅ Registered listener for '${event}' (total: ${this.listeners.get(event)!.size})`);
  }

  off(event: string, handler: MessageHandler) {
    const removed = this.listeners.get(event)?.delete(handler);
    if (removed) {
      console.log(`✅ Removed listener for '${event}'`);
    }
  }

  private emit(event: string, data: any) {
    const handlers = this.listeners.get(event);
    if (handlers && handlers.size > 0) {
      console.log(`📤 Emitting '${event}' to ${handlers.size} handler(s)`);
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`❌ Error in event handler for ${event}:`, error);
        }
      });
    } else {
      console.warn(`⚠️ No handlers registered for event: '${event}'`);
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getConnectionState(): string {
    if (!this.ws) return 'NULL';

    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'CONNECTING';
      case WebSocket.OPEN: return 'OPEN';
      case WebSocket.CLOSING: return 'CLOSING';
      case WebSocket.CLOSED: return 'CLOSED';
      default: return 'UNKNOWN';
    }
  }

  setWebSocketUrl(url: string) {
    this.wsUrl = url;
  }
}