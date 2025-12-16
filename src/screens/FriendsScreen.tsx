// src/screens/FriendsScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Image
} from 'react-native';
import { friendService } from '../services/friendService';
import { authService } from '../services/authService';
import { useSubscriptions } from '../contexts/SubscriptionContext';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Ionicons } from '@expo/vector-icons';
import CustomModal from '@/components/modal';

export default function FriendsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [removingFriendId, setRemovingFriendId] = useState<string | null>(null); // Track which friend is being removed
  const [selectedFriend, setSelectedFriend] = useState<any>(null);
  const { friends } = useSubscriptions();
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState({
    title: '',
    message: '',
    type: 'error' as 'error' | 'success' | 'confirm',
  });

  console.log('👥 FriendsScreen rendering:', friends.length, 'friends');

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  const setModal = (title: string, message: string, type: 'error' | 'success' | 'confirm' = 'error' ) => {
    setModalType({title, message, type});
  }

  const removeFriend = async (friend: any) => {
    setRemovingFriendId(friend.id);
    try {
      const user = await authService.getCurrentUser();
      if (!user) {
        setModal("Connection Error", "User not authenticated", 'error');
        setModalVisible(true);
        return;
      }

      console.log('🗑️ Removing friend:', friend.username);

      // Set a timeout in case Lambda is slow
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), 15000) // 15 second timeout
      );

      const removedFriend = friend.username;

      const removePromise = friendService.removeFriend(user.userId, friend.id);

      await Promise.race([removePromise, timeoutPromise]);

      console.log('✅ Friend removed successfully');
      setModal("Friend Removed", `You have removed ${removedFriend} from your friendlist`, 'success');
      setSelectedFriend(null);
      setModalVisible(true);
    } catch (error: any) {
      console.error('❌ Error removing friend:', error);
      if (error.message === 'Request timeout') {
        setModal(
          'Request Timeout',
          'Your friend request has been cancelled due to timeout, please try again',
          'error',
        )
        setModalVisible(true);
      } else {
        setModalVisible(true);
        setModal(
          'Failed to remove friend',
          error.message || 'Failure to remove friend',
          'error',
        )
      }
    } finally {
      setRemovingFriendId(null);
    }
  };

  const renderFriend = ({ item }: any) => {
    const isAnyRemoving = removingFriendId !== null;
    const isRemoving = removingFriendId === item.id;

    return (
      <View style={styles.friendItem}>
        <View style={styles.friendInfo}>

          { item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={{ width: 50, height: 50, borderRadius: 25 }} />
          ) : (
            <Ionicons name="person-circle" size={50} color="#4CAF50" />
          )}

          <View style={styles.friendDetails}>
            <Text style={styles.friendName}>{item.username}</Text>

            <View style={{ flexDirection: 'row', alignItems: 'center' }}>

              {item.isLocationSharing ? (
                <MaterialIcons name='location-on' size={14} color="#9420ceff" />
              ) : (
                <MaterialIcons name='location-off' size={14} color="#9420ceff" />
              )}

              <Text style={styles.friendStatus}>
                {item.isLocationSharing ? ' Sharing location' : ' Location off'}
              </Text>
            </View>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => {
            setSelectedFriend(item);
            setModal('Friend Removal Confirmation', `Remove ${item.username} from your friend list?`, 'confirm');
            setModalVisible(true);
          }}
          disabled={isAnyRemoving}
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
        title={modalType.title}
        message={modalType.message}
        type={modalType.type}
        onClose={() => setModalVisible(false)}
        onConfirm={() => {
          setModalVisible(false);
          if (selectedFriend) {
            removeFriend(selectedFriend);
          }
        }}
        >
      </CustomModal>
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