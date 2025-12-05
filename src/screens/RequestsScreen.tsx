// src/screens/RequestsScreen.tsx
import React, { useState, useEffect } from 'react';
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
import { useSubscriptions } from '../contexts/SubscriptionContext';
import { Ionicons } from '@expo/vector-icons';
import CustomModal from '@/components/modal';

export default function RequestsScreen() {
  const [searchUsername, setSearchUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showSent, setShowSent] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState({
    title: '',
    message: '',
    type: 'error' as 'error' | 'success' | 'confirm'
  })
  const [selectedRequest, setSelectedRequest] = useState<any>(null);

  // Read from context
  const { pendingRequests, sentRequests, forceReload } = useSubscriptions();

  console.log('📬 RequestsScreen rendering - Pending:', pendingRequests.length, 'Sent:', sentRequests.length);

  const setModal = (title: string, message: string, type: 'error' | 'success' | 'confirm' = 'error') => {
    setModalContent({title, message, type});
  }

  const onRefresh = async () => {
    setRefreshing(true);
    console.log('🔄 Pull-to-refresh triggered');
    await forceReload();
    setRefreshing(false);
  };

  const sendFriendRequest = async () => {
    if (!searchUsername.trim()) {
      setModal("Request Not Sent", "Please enter a username to send friend request", "error");
      setModalVisible(true);
      return;
    }

    setLoading(true);
    try {
      console.log('📤 Sending friend request to:', searchUsername);
      await friendService.sendFriendRequest(searchUsername.trim());

      setModal("Request Sent", "Your request has been successfully sent!", "success");
      setModalVisible(true);
      setSearchUsername('');
    } catch (error: any) {
      console.error('Error sending request:', error);
      setModal("Request Not Sent", `Error during sending request: ${error}`, "error");
      setModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const acceptRequest = async (request: any) => {
    try {
      console.log('✅ Accepting request from:', request.senderUsername);
      await friendService.acceptFriendRequest(request.id);

      console.log('✅ Request accepted, forcing reload...');
      await forceReload();

      setModal("Request accepted!", `You are now friends with ${request.senderUsername}!`, 'success');
      setModalVisible(true);
    } catch (error) {
      console.error('Error accepting request:', error);

      setModal('Failed to accept request:', `An error occured during accepting request: ${error}`, 'error');
      setModalVisible(true);
    }
  };

  const rejectRequest = async (request: any) => {
    try {
      console.log('❌ Rejecting request from:', request.senderUsername);
      await friendService.rejectFriendRequest(request.id);

      console.log('✅ Request rejected, forcing reload...');
      await forceReload();

    } catch (error) {
      console.error('Error rejecting request:', error);
      Alert.alert('Error', 'Failed to reject request');
    }
  };

  const cancelSentRequest = async (request: any) => {
    try {
      console.log('🚫 Cancelling request to:', request.receiverUsername);
      await friendService.rejectFriendRequest(request.id);

      console.log('✅ Request cancelled, forcing reload...');
      await forceReload();

      Alert.alert('Success', 'Request cancelled');
    } catch (error) {
      console.error('Error cancelling request:', error);
      Alert.alert('Error', 'Failed to cancel request');
    }
  };

  const renderPendingRequest = ({ item }: any) => (
    <View style={styles.requestItem}>
      <View style={styles.requestInfo}>
        <Ionicons name="person-add" size={24} color="#FF9800" />
        <View style={styles.requestText}>
          <Text style={styles.requestUsername}>{item.senderUsername || 'Unknown'}</Text>
          <Text style={styles.requestSubtext}>Wants to be your friend</Text>
          <Text style={styles.requestTime}>
            {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}
          </Text>
        </View>
      </View>
      <View style={styles.requestButtons}>
        <TouchableOpacity
          style={[styles.button, styles.acceptButton]}
          onPress={() => {
            setSelectedRequest(item);
            setModalVisible(true);
          }}
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
          <Text style={styles.requestUsername}>{item.receiverUsername || 'Unknown'}</Text>
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons
              name={showSent ? 'send-outline' : 'mail-open-outline'}
              size={60}
              color="#ddd"
            />
            <Text style={styles.emptyText}>
              {showSent ? 'No sent requests' : 'No pending requests'}
            </Text>
          </View>
        }
      />

      <CustomModal
        visible={modalVisible}
        title={'Warning'}
        message={'Are you sure you want to accept this friend request?'}
        type={'confirm'}
        onClose={() => setModalVisible(false)}
        onConfirm={() => {
          if (selectedRequest) {
            acceptRequest(selectedRequest);
            setModalVisible(false);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // keep all your existing styles as-is
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  searchSection: { backgroundColor: 'white', padding: 15 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  searchContainer: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 15, paddingVertical: 10 },
  sendButton: { backgroundColor: '#4CAF50', paddingHorizontal: 20, borderRadius: 8, justifyContent: 'center' },
  disabledButton: { opacity: 0.7 },
  sendButtonText: { color: 'white', fontWeight: 'bold' },
  tabs: { flexDirection: 'row', backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  tab: { flex: 1, paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#4CAF50' },
  tabText: { color: '#666' },
  activeTabText: { color: '#4CAF50', fontWeight: '600' },
  badge: { marginLeft: 5, backgroundColor: '#FF9800', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  requestItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: 15, marginHorizontal: 10, marginVertical: 5, borderRadius: 10 },
  requestInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  requestText: { marginLeft: 15, flex: 1 },
  requestUsername: { fontSize: 16, fontWeight: 'bold' },
  requestSubtext: { fontSize: 14, color: '#666', marginTop: 2 },
  requestTime: { fontSize: 12, color: '#999', marginTop: 2 },
  requestButtons: { flexDirection: 'row', gap: 10 },
  button: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  acceptButton: { backgroundColor: '#4CAF50' },
  rejectButton: { backgroundColor: '#f44336' },
  cancelButton: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 15, backgroundColor: '#f0f0f0' },
  cancelText: { color: '#666', fontSize: 14 },
  emptyContainer: { alignItems: 'center', paddingTop: 50 },
  emptyText: { color: '#999', marginTop: 10, fontSize: 16 },
});
