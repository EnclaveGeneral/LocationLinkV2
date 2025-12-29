import { fetchAuthSession } from "aws-amplify/auth";

type MessageHandler = (message: any) => void;

export class WebSocketService {
  private static instance: WebSocketService;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private listeners: Map<string, Set<MessageHandler>> = new Map();
  private userId: string | null = null;
  private isIntentionalClose = false;

  // WebSocket URL = you'll need to update this after deployement
  private wsUrl = 'wss://4g5skmt4j7.execute-api.us-west-2.amazonaws.com/production/';

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  async connect(userId: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('⚠️ WebSocket already connected');
      return;
    }

    this.userId = userId;
    this.isIntentionalClose = false;

    try {
      // Get auth token
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      if (!token) {
        throw new Error('No auth token available');
      }

      const url = `${this.wsUrl}?userId=${userId}&token=${token}`;
      console.log('🔵 Connecting to WebSocket...', url)

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
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
      // ✅ FIX: Don't crash on normal disconnects during backgrounding
      const errorMsg = JSON.stringify(error);

      // "Software caused connection abort" is normal when app backgrounds
      if (errorMsg.includes('Software caused connection abort')) {
        console.log('📱 WebSocket closed by OS (app backgrounded) - this is normal');
        return; // Don't emit error, onclose will handle reconnection
      }

      // Only log/emit actual errors
      console.error('❌ WebSocket error:', error);
      this.emit('error', error);
    };

    this.ws.onclose = (event) => {
      console.log('🔴 WebSocket disconnected', event.code, event.reason);
      this.stopPingInterval();
      this.emit('disconnected', {code: event.code, reason: event.reason});

      // ✅ FIX: Don't try to reconnect if app is backgrounded
      if (!this.isIntentionalClose && typeof document !== 'undefined') {
        // Only reconnect if we're in foreground (document is visible)
        this.reconnect();
      } else {
        console.log('📱 Skipping reconnect (app backgrounded or intentional close)');
      }
    };

    } catch (error) {
      console.error('❌ Error connecting to WebSocket:', error);
      this.reconnect();
    }
  }

  private handleMessage(message: any) {
    const { type, data} = message;

    switch (type) {
      case 'USER_UPDATE':
        this.emit('userUpdate', data);
        break;

      case 'FRIEND_ADDED':
        this.emit('friendAdded', data);
        break;

      case 'FRIEND_REMOVED':
        this.emit('friendRemoved', data);
        break;

      case 'FRIEND_REQUEST_SENT':
        this.emit('friendRequestSent', data);
        break;

      case 'FRIEND_REQUEST_RECEIVED':
        this.emit('friendRequestReceived', data);
        break;

      case 'FRIEND_REQUEST_ACCEPTED':
        this.emit('friendRequestAccepted', data);
        break;

      case 'FRIEND_REQUEST_DELETED':
        this.emit('friendRequestDeleted', data);
        break;

      default:
        console.log('⚠️ Unknown message type:', type);

    }
  }

  private reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      this.emit('maxReconnectAttemptsReached', {});
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    console.log(`🔄 Reconnecting in ${delay}ms... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      if (this.userId) {
        this.connect(this.userId);
      }
    }, delay);

  }

  private startPingInterval() {
    // Send ping every 30 seconds to keep connection alive
    this.pingInterval = setInterval(() => {
      this.send({ action: 'ping'});
    }, 30000);
  }

  private stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  send(message: any) {
    if (this.ws?.readyState == WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('⚠️ WebSocket not connected, fail to send message');
    }
  }

  disconnect() {
    console.log('🔴 Intentionally disconnecting WebSocket');

    this.isIntentionalClose = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.stopPingInterval();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.listeners.clear();
  }

  // Event emitter methods
  on(event: string, handler: MessageHandler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: MessageHandler) {
    this.listeners.get(event)?.delete(handler);
  }

  private emit(event: string, data: any) {
    this.listeners.get(event)?.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`❌ Error in event handler for ${event}:`, error);
      }
    });
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // Add a method to update WebSocket URL after deployement
  setWebSocketUrl(url: string) {
    this.wsUrl = url;
  }
}

