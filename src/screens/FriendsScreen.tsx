// src/screens/FriendsScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { friendService } from '../services/friendService';
import { authService } from '../services/authService';
import { useSubscriptions } from '../contexts/SubscriptionContext';
import { Ionicons } from '@expo/vector-icons';
import CustomModal from '@/components/modal';

export default function FriendsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [removingFriendId, setRemovingFriendId] = useState<string | null>(null); // Track which friend is being removed
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<any>(null);

  const { friends } = useSubscriptions();

  console.log('👥 FriendsScreen rendering:', friends.length, 'friends');

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  const removeFriend = async (friend: any) => {
    setRemovingFriendId(friend.id);
    try {
      const user = await authService.getCurrentUser();
      if (!user) {
        Alert.alert('Error', 'Not authenticated');
        return;
      }

      console.log('🗑️ Removing friend:', friend.username);

      // Set a timeout in case Lambda is slow
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), 15000) // 15 second timeout
      );

      const removePromise = friendService.removeFriend(user.userId, friend.id);

      await Promise.race([removePromise, timeoutPromise]);

      console.log('✅ Friend removed successfully');
      Alert.alert('Success', 'Friend removed');
    } catch (error: any) {
      console.error('❌ Error removing friend:', error);
      if (error.message === 'Request timeout') {
        Alert.alert('Timeout', 'Request is taking too long. The friend may have been removed. Please refresh.');
      } else {
        Alert.alert('Error', error.message || 'Failed to remove friend');
      }
    } finally {
      setRemovingFriendId(null);
    }
  };

  const renderFriend = ({ item }: any) => {
    const isRemoving = removingFriendId === item.id;

    return (
      <View style={styles.friendItem}>
        <View style={styles.friendInfo}>
          <Ionicons name="person-circle" size={50} color="#4CAF50" />
          <View style={styles.friendDetails}>
            <Text style={styles.friendName}>{item.username}</Text>
            <Text style={styles.friendStatus}>
              {item.isLocationSharing ? '📍 Sharing location' : '📍 Location off'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => {
            setSelectedFriend(item);
            setModalVisible(true);
          }}
          disabled={isRemoving}
        >
          {isRemoving ? (
            <ActivityIndicator size="small" color="#ff5252" />
          ) : (
            <Ionicons name="close-circle" size={24} color="#ff5252" />
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={friends}
        renderItem={renderFriend}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={80} color="#ddd" />
            <Text style={styles.emptyText}>No friends yet</Text>
          </View>
        }
      />

      <CustomModal
        visible={modalVisible}
        title={'Remove Friend'}
        message={`Are you sure you want to remove ${selectedFriend?.username}?`}
        type={'confirm'}
        onClose={() => setModalVisible(false)}
        onConfirm={() => {
          if (selectedFriend) {
            removeFriend(selectedFriend);
            setModalVisible(false);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  friendItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 15,
    marginHorizontal: 10,
    marginVertical: 5,
    borderRadius: 10,
  },
  friendInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  friendDetails: {
    marginLeft: 15,
  },
  friendName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  friendStatus: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    marginTop: 10,
  },
});