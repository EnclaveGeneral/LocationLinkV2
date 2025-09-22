// src/screens/RequestsScreen.tsx - Updated setupSubscriptions
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { friendService } from '../services/friendService';
import { authService } from '../services/authService';
import { client } from '../services/amplifyConfig';
import { Ionicons } from '@expo/vector-icons';

export default function RequestsScreen() {
  const [searchUsername, setSearchUsername] = useState('');
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [sentRequests, setSentRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showSent, setShowSent] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const subscriptionsRef = useRef<any[]>([]);

  useEffect(() => {
    initializeRequests();

    // Cleanup subscriptions on unmount
    return () => {
      subscriptionsRef.current.forEach(sub => {
        if (sub && typeof sub.unsubscribe === 'function') {
          sub.unsubscribe();
        }
      });
    };
  }, []);

  const initializeRequests = async () => {
    const user = await authService.getCurrentUser();
    if (!user) return;

    setCurrentUserId(user.userId);
    await loadRequests(user.userId);
    setupSubscriptions(user.userId);
  };

  const setupSubscriptions = (userId: string) => {
    try {
      // FIXED: Single subscription with NO filter, then filter on client side
      const sub = client.models.FriendRequest.observeQuery().subscribe({
        next: ({ items }) => {
          // Filter on client side for this user's requests
          const incoming = items.filter(item =>
            item.receiverId === userId && item.status === 'PENDING'
          );
          const sent = items.filter(item =>
            item.senderId === userId && item.status === 'PENDING'
          );

          setPendingRequests(incoming);
          setSentRequests(sent);

          // Check for accepted requests from sent items
          const accepted = items.find(req =>
            req.senderId === userId && req.status === 'ACCEPTED'
          );
          if (accepted) {
            Alert.alert('Request Accepted!', `${accepted.receiverUsername} accepted your friend request!`);
          }
        },
        error: (error) => {
          console.error('Friend requests subscription error:', error);
          if (error?.error?.errors) {
            console.error('Detailed error:', JSON.stringify(error.error.errors, null, 2));
          }
        }
      });

      subscriptionsRef.current.push(sub);
    } catch (error) {
      console.error('Error setting up subscriptions:', error);
    }
  };

  const loadRequests = async (userId: string) => {
    try {
      const [pending, sent] = await Promise.all([
        friendService.getPendingRequests(userId),
        friendService.getSentRequests(userId),
      ]);

      setPendingRequests(pending);
      setSentRequests(sent);
    } catch (error) {
      console.error('Error loading requests:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (currentUserId) {
      await loadRequests(currentUserId);
    }
    setRefreshing(false);
  };

  const sendFriendRequest = async () => {
    if (!searchUsername.trim()) {
      Alert.alert('Error', 'Please enter a username');
      return;
    }

    setLoading(true);
    try {
      await friendService.sendFriendRequest(searchUsername.trim());
      Alert.alert('Success', 'Friend request sent!');
      setSearchUsername('');
      // The subscription will automatically update the sent requests
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const acceptRequest = async (request: any) => {
    try {
      await friendService.acceptFriendRequest(request.id);
      Alert.alert('Success', `You are now friends with ${request.senderUsername}!`);
      // The subscription will automatically update the lists
    } catch (error) {
      Alert.alert('Error', 'Failed to accept request');
    }
  };

  const rejectRequest = async (request: any) => {
    try {
      await friendService.rejectFriendRequest(request.id);
      // The subscription will automatically update the lists
    } catch (error) {
      Alert.alert('Error', 'Failed to reject request');
    }
  };

  const cancelSentRequest = async (request: any) => {
    try {
      await friendService.rejectFriendRequest(request.id);
      Alert.alert('Success', 'Request cancelled');
      // The subscription will automatically update the lists
    } catch (error) {
      Alert.alert('Error', 'Failed to cancel request');
    }
  };

  const renderPendingRequest = ({ item }: any) => (
    <View style={styles.requestItem}>
      <View style={styles.requestInfo}>
        <Ionicons name="person-add" size={24} color="#FF9800" />
        <View style={styles.requestText}>
          <Text style={styles.requestUsername}>
            {item.senderUsername || 'Unknown'}
          </Text>
          <Text style={styles.requestSubtext}>Wants to be your friend</Text>
          <Text style={styles.requestTime}>
            {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}
          </Text>
        </View>
      </View>
      <View style={styles.requestButtons}>
        <TouchableOpacity
          style={[styles.button, styles.acceptButton]}
          onPress={() => acceptRequest(item)}
        >
          <Ionicons name="checkmark" size={20} color="white" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.rejectButton]}
          onPress={() => rejectRequest(item)}
        >
          <Ionicons name="close" size={20} color="white" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSentRequest = ({ item }: any) => (
    <View style={styles.requestItem}>
      <View style={styles.requestInfo}>
        <Ionicons name="send" size={24} color="#2196F3" />
        <View style={styles.requestText}>
          <Text style={styles.requestUsername}>
            {item.receiverUsername || 'Unknown'}
          </Text>
          <Text style={styles.requestSubtext}>Pending</Text>
          <Text style={styles.requestTime}>
            {item.createdAt ? `Sent ${new Date(item.createdAt).toLocaleDateString()}` : ''}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={[styles.button, styles.cancelButton]}
        onPress={() => cancelSentRequest(item)}
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchSection}>
        <Text style={styles.sectionTitle}>Add Friend</Text>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.input}
            placeholder="Enter username"
            value={searchUsername}
            onChangeText={setSearchUsername}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[styles.sendButton, loading && styles.disabledButton]}
            onPress={sendFriendRequest}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.sendButtonText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, !showSent && styles.activeTab]}
          onPress={() => setShowSent(false)}
        >
          <Text style={[styles.tabText, !showSent && styles.activeTabText]}>
            Received ({pendingRequests.length})
          </Text>
          {pendingRequests.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingRequests.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, showSent && styles.activeTab]}
          onPress={() => setShowSent(true)}
        >
          <Text style={[styles.tabText, showSent && styles.activeTabText]}>
            Sent ({sentRequests.length})
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={showSent ? sentRequests : pendingRequests}
        renderItem={showSent ? renderSentRequest : renderPendingRequest}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons
              name={showSent ? "send-outline" : "mail-open-outline"}
              size={60}
              color="#ddd"
            />
            <Text style={styles.emptyText}>
              {showSent ? 'No sent requests' : 'No pending requests'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  searchSection: {
    backgroundColor: 'white',
    padding: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  searchContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  sendButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    borderRadius: 8,
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.7,
  },
  sendButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#4CAF50',
  },
  tabText: {
    color: '#666',
  },
  activeTabText: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  badge: {
    marginLeft: 5,
    backgroundColor: '#FF9800',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  requestItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 15,
    marginHorizontal: 10,
    marginVertical: 5,
    borderRadius: 10,
  },
  requestInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  requestText: {
    marginLeft: 15,
    flex: 1,
  },
  requestUsername: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  requestSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  requestTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  requestButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#f44336',
  },
  cancelButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
    backgroundColor: '#f0f0f0',
  },
  cancelText: {
    color: '#666',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 50,
  },
  emptyText: {
    color: '#999',
    marginTop: 10,
    fontSize: 16,
  },
});