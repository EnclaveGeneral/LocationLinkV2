// src/screens/RequestsScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Dimensions
} from 'react-native';
import { friendService } from '../services/friendService';
import { useSubscriptions } from '../contexts/SubscriptionContext';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from "expo-linear-gradient";
import CustomModal from '@/components/modal';
import FontAwesome from '@expo/vector-icons/FontAwesome';

const { width } = Dimensions.get('window');

type ModalContent = {
  title: string;
  message: string;
  type: 'error' | 'success' | 'confirm';
  onConfirm?: () => void;
};

export default function RequestsScreen() {
  const [searchUsername, setSearchUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showSent, setShowSent] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState<ModalContent>({
    title: '',
    message: '',
    type: 'error' as 'error' | 'success' | 'confirm',
  });
  const [selectedRequest, setSelectedRequest] = useState<any>(null);

  // Used to determine if we are removing a friend or not
  const [isRemoving, setIsRemoving] = useState(false);

  // Read from context
  const { pendingRequests, sentRequests, forceReload } = useSubscriptions();

  console.log('📬 RequestsScreen rendering - Pending:', pendingRequests.length, 'Sent:', sentRequests.length);

  const onRefresh = async () => {
    setRefreshing(true);
    console.log('🔄 Pull-to-refresh triggered');
    await forceReload();
    setRefreshing(false);
  };

  const sendFriendRequest = async () => {
    if (!searchUsername.trim()) {
      setModalContent({
        type: 'error',
        title: 'No User Entered',
        message: 'Please enter a valid username',
      });
      setModalVisible(true);
      return;
    }

    setLoading(true);
    try {
      console.log('📤 Sending friend request to:', searchUsername);
      await friendService.sendFriendRequest(searchUsername.trim());

      setModalContent({
        type: 'success',
        title: 'Friend Request Sent',
        message: `Your friend request to ${searchUsername} has been sent successfully`
      });
      setModalVisible(true);
      setSearchUsername('');
    } catch (error: any) {
      console.log('Error sending request:', error);
      setModalContent({
        type: 'error',
        title: 'Request Failed To Send',
        message: error.message || 'An error(s) has occured while attempting to send your friend request'
      })
      setModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const readyToAccept = async (request: any) => {
    setModalContent({
      type: 'confirm',
      title: `Accept friend request?`,
      message: `Confirm to accept friend request from ${request.senderUsername}`,
      onConfirm: () => {
        acceptRequest(request);
      }
    });
    setModalVisible(true);
    return;
  }

  const readyToReject = async (request: any) => {
    setModalContent({
      type: 'confirm',
      title: `Accept friend request?`,
      message: `Confirm to accept friend request from ${request.senderUsername}`,
      onConfirm: () => {
        rejectRequest(request);
      }
    });
    setModalVisible(true);
    return;
  }

  const acceptRequest = async (request: any) => {
    try {

      setModalVisible(false);

      console.log('✅ Accepting request from:', request.senderUsername);
      await friendService.acceptFriendRequest(request.id);

      console.log('✅ Request accepted, forcing reload...');

      await forceReload();

      setModalContent({
        type: 'success',
        title: 'Request accepted',
        message: `You are now friends with ${request.senderUsername}`
      });
      setModalVisible(true);
    } catch (error: any) {

      console.log('Error accepting request:', error);

      setModalContent({
        type: 'error',
        title: 'Error accepting request',
        message: error.message || 'An error(s) has occured while attempting to accept request'
      });
      setModalVisible(true);
    }
  };

  const rejectRequest = async (request: any) => {
    try {

      setModalVisible(false);

      console.log('❌ Rejecting request from:', request.senderUsername);
      await friendService.rejectFriendRequest(request.id);

      setModalContent({
        type: 'success',
        title: 'Request rejected',
        message: `You rejected friend request from ${request.senderUsername}`
      });
      setModalVisible(true);

      console.log('✅ Request rejected, forcing reload...');
      await forceReload();

    } catch (error: any) {
      console.log('Error rejecting request:', error);

      setModalContent({
        type: 'error',
        title: 'Error rejecting request',
        message: error.message || 'An error(s) has occured while attempting to reject request'
      });
      setModalVisible(true);
    }
  };

  const cancelSentRequest = async (request: any) => {
    try {
      setIsRemoving(true);

      console.log('🚫 Cancelling request to:', request.receiverUsername);
      await friendService.rejectFriendRequest(request.id);

      console.log('✅ Request cancelled, forcing reload...');
      await forceReload();

      setIsRemoving(false);
    } catch (error: any) {
      console.log('Error cancelling request:', error);
      setModalContent({
        title: 'Error cancel sent request',
        message: error.message || 'An error(s) has occured while attempting to cancel sent request',
        type: 'error'
      });
      setModalVisible(true);
    }
  };

  const renderPendingRequest = ({ item }: any) => (
    <View style={styles.requestItem}>
      <View style={styles.requestInfo}>
        <Ionicons name="person-add" size={width * 0.055} color="#4CAF50" />
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
            readyToAccept(item);
          }}
        >
          <Ionicons name="checkmark" size={width * 0.045} color="white" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.rejectButton]}
          onPress={() => readyToReject(item)}
        >
          <Ionicons name="close" size={width * 0.045} color="white" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSentRequest = ({ item }: any) => (
    <View style={styles.requestItem}>
      <View style={styles.requestInfo}>
        <MaterialCommunityIcons name="account-question" size={width * 0.055} color="#9420ceff" />
        <View style={styles.requestText}>
          <Text style={styles.requestUsername}>{item.receiverUsername || 'Unknown'}</Text>
          <Text style={styles.requestSubtext}>Pending</Text>
          <Text style={styles.requestTime}>
            {item.createdAt ? `Sent ${new Date(item.createdAt).toLocaleDateString()}` : ''}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.button}
        onPress={() => cancelSentRequest(item)}
      >
        {isRemoving ? (
          <ActivityIndicator size='small' color="#f80606ff" />
        ) : (
          <Ionicons name="close-circle" size={width * 0.065} color="#f80606ff" />
        )}
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
            onPress={sendFriendRequest}
            disabled={loading}
          >
            <LinearGradient
              colors={
                    loading
                      ? ['#a8a4a4ef', '#a8a4a4ef', '#a8a4a4ef']
                      : ['#9420ceff', '#9420ceff', '#9420ceff']
              }
              locations={[0, 0.25, 0.75]}
              start={{x: 0, y: 0}}
              end={{ x: 1, y: 0}}
              style={[styles.sendButton, loading && styles.disabledButton]}
            >
              {loading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.sendButtonText}>Send</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, !showSent && styles.activeTab]}
          onPress={() => setShowSent(false)}
        >
          <Text style={[styles.tabText, !showSent && styles.activeTabText]}>
            Received
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
        contentContainerStyle={{
          paddingTop: width * 0.03,
          paddingBottom: width * 0.03,
        }}
        ItemSeparatorComponent={() => <View style={{ height: width * 0.015 }} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {showSent ? (<FontAwesome name="send-o" size={width * 0.135} color="#ddd" />)
                      : (<MaterialIcons name="mail" size={width * 0.135} color="#ddd" />)}
            <Text style={styles.emptyText}>
              {showSent ? 'You have sent no request(s)' : 'You have received no request(s)'}
            </Text>
          </View>
        }
      />

      <CustomModal
        visible={modalVisible}
        title={modalContent.title}
        message={modalContent.message}
        type={modalContent.type}
        onClose={() => setModalVisible(false)}
        onConfirm={modalContent.onConfirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  searchSection: {
    backgroundColor: 'white',
    padding: width * 0.033             // was: 15
  },
  sectionTitle: {
    fontSize: width * 0.040,           // was: 18
    fontWeight: 'bold',
    marginBottom: width * 0.022        // was: 10
  },
  searchContainer: {
    flexDirection: 'row',
    gap: width * 0.022                 // was: 10
  },
  input: {
    flex: 1,
    borderWidth: width * 0.002,        // was: 1
    borderColor: '#ddd',
    borderRadius: width * 0.018,       // was: 8
    paddingHorizontal: width * 0.033,  // was: 15
    paddingVertical: width * 0.022,    // was: 10
    fontSize: width * 0.031            // was: 14
  },
  sendButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: width * 0.045,  // was: 20
    paddingVertical: width * 0.033,    // was: 15
    borderRadius: width * 0.018,       // was: 8
    justifyContent: 'center'
  },
  disabledButton: {
    opacity: 0.7
  },
  sendButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: width * 0.031            // was: 14
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: width * 0.002,  // was: 1
    borderBottomColor: '#e0e0e0'
  },
  tab: {
    flex: 1,
    paddingVertical: width * 0.033,    // was: 15
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center'
  },
  activeTab: {
    borderBottomWidth: width * 0.0045, // was: 2
    borderBottomColor: '#A910F5'
  },
  tabText: {
    color: '#666',
    fontSize: width * 0.031            // was: 14
  },
  activeTabText: {
    color: '#A910F5',
    fontWeight: '600'
  },
  badge: {
    marginLeft: width * 0.011,         // was: 5
    backgroundColor: '#4CAF50',
    borderRadius: width * 0.022,       // was: 10
    paddingHorizontal: width * 0.013,  // was: 6
    paddingVertical: width * 0.0045    // was: 2
  },
  badgeText: {
    color: 'white',
    fontSize: width * 0.027,           // was: 12
    fontWeight: 'bold'
  },
  requestItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: width * 0.033,            // was: 15
    marginHorizontal: width * 0.022,   // was: 10
    borderRadius: width * 0.022        // was: 10
  },
  requestInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  requestText: {
    marginLeft: width * 0.033,         // was: 15
    flex: 1
  },
  requestUsername: {
    fontSize: width * 0.036,           // was: 16
    fontWeight: 'bold'
  },
  requestSubtext: {
    fontSize: width * 0.031,           // was: 14
    color: '#666',
    marginTop: width * 0.0045          // was: 2
  },
  requestTime: {
    fontSize: width * 0.027,           // was: 12
    color: '#999',
    marginTop: width * 0.0045          // was: 2
  },
  requestButtons: {
    flexDirection: 'row',
    gap: width * 0.022                 // was: 10
  },
  button: {
    width: width * 0.080,              // was: 36
    height: width * 0.080,
    borderRadius: width * 0.040,       // was: 18
    justifyContent: 'center',
    alignItems: 'center'
  },
  acceptButton: {
    backgroundColor: '#4CAF50'
  },
  rejectButton: {
    backgroundColor: '#f44336'
  },
  cancelText: {
    color: '#666',
    fontSize: width * 0.031            // was: 14
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: width * 0.112          // was: 50
  },
  emptyText: {
    color: '#999',
    marginTop: width * 0.022,          // was: 10
    fontSize: width * 0.036            // was: 16
  },
});

