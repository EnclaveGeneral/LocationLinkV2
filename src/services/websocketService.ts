// src/services/websocketService.ts - FIXED VERSION
//
// FIXES:
// 1. Removed broken document check (web-only, doesn't work in React Native)
// 2. Don't clear listeners on disconnect (preserves handlers across reconnects)
// 3. Let MapScreen control reconnection via shouldReconnect flag (no AppState race conditions)
// 4. Better reconnection flow with state management
// 5. Added connection state tracking

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

  // ✅ FIX: Let MapScreen control reconnection via this flag
  private shouldReconnect = true;

  // WebSocket URL
  private wsUrl = 'wss://4g5skmt4j7.execute-api.us-west-2.amazonaws.com/production/';

  constructor() {
    // NOTE: We don't track AppState here to avoid race conditions with MapScreen
    // MapScreen controls reconnection via shouldReconnect flag
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

    // ✅ FIX: Clean up any existing connection before creating new one
    if (this.ws) {
      console.log('🔄 Cleaning up previous WebSocket instance...');
      this.ws.close();
      this.ws = null;
    }

    this.userId = userId;
    this.isIntentionalClose = false;
    this.shouldReconnect = true; // ✅ Enable reconnection when explicitly connecting

    try {
      // Get auth token
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      if (!token) {
        throw new Error('No auth token available');
      }

      const url = `${this.wsUrl}?userId=${userId}&token=${token}`;
      console.log('🔵 Connecting to WebSocket...', url);

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected successfully');
        this.reconnectAttempts = 0; // ✅ Reset counter on success
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
        console.log('🔴 WebSocket disconnected', {
          code: event.code,
          reason: event.reason,
          isIntentional: this.isIntentionalClose,
          shouldReconnect: this.shouldReconnect
        });

        this.stopPingInterval();
        this.emit('disconnected', { code: event.code, reason: event.reason });

        // ✅ SIMPLIFIED: Only check shouldReconnect flag
        // MapScreen controls this via connect()/disconnect() calls
        // This avoids race conditions with AppState listeners
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

      // ✅ FIX: Only reconnect if shouldReconnect flag is true
      if (this.shouldReconnect) {
        this.reconnect();
      }
    }
  }

  private handleMessage(message: any) {
    const { type, data } = message;

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

      case 'NEW_MESSAGE':
        this.emit('newMessage', data);
        break;

      case 'MESSAGE_SENT':
        this.emit('messageSent', data);
        break;

      default:
        console.log('⚠️ Unknown message type:', type);
    }
  }

  private reconnect() {
    // ✅ FIX: Clear any existing reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      this.emit('maxReconnectAttemptsReached', {});
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    console.log(`🔄 Reconnecting in ${delay}ms... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      if (this.userId && this.shouldReconnect) {
        console.log('🔄 Executing reconnect...');
        this.connect(this.userId);
      }
    }, delay);
  }

  private startPingInterval() {
    // ✅ FIX: Clear existing interval first
    this.stopPingInterval();

    // Send ping every 30 seconds to keep connection alive
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ action: 'ping' });
      }
    }, 30000);
  }

  private stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  send(message: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('⚠️ WebSocket not connected, failed to send message');
    }
  }

  disconnect() {
    console.log('🔴 Intentionally disconnecting WebSocket');

    this.isIntentionalClose = true;
    this.shouldReconnect = false; // ✅ Disable reconnection on intentional disconnect

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.stopPingInterval();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    // ✅ FIX: DON'T clear listeners! They need to persist for reconnection
    // this.listeners.clear(); // ❌ REMOVED - causes loss of event handlers

    console.log('✅ WebSocket disconnected, listeners preserved');
  }

  // ✅ NEW: Method to cleanly shutdown and clear everything (for logout)
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

    // Only clear listeners on complete shutdown
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
  }

  off(event: string, handler: MessageHandler) {
    this.listeners.get(event)?.delete(handler);
  }

  private emit(event: string, data: any) {
    const handlers = this.listeners.get(event);
    if (handlers && handlers.size > 0) {
      console.log(`📤 Emitting ${event} to ${handlers.size} handlers`);
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`❌ Error in event handler for ${event}:`, error);
        }
      });
    } else {
      console.warn(`⚠️ No handlers registered for event: ${event}`);
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // Get current connection state for debugging
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

  // Add a method to update WebSocket URL after deployment
  setWebSocketUrl(url: string) {
    this.wsUrl = url;
  }
}