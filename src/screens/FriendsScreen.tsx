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
  Image,
  Dimensions
} from 'react-native';
import { friendService } from '../services/friendService';
import { authService } from '../services/authService';
import { chatService } from '../services/chatService';
import { useSubscriptions } from '../contexts/SubscriptionContext';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Ionicons } from '@expo/vector-icons';
import CustomModal from '@/components/modal';
import Entypo from '@expo/vector-icons/Entypo';
import { router } from 'expo-router';

const { width } = Dimensions.get('screen');

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
  const { forceReload } = useSubscriptions();

  console.log('👥 FriendsScreen rendering:', friends.length, 'friends');

  const onRefresh = async () => {
    setRefreshing(true);
    await forceReload();
    setTimeout(() => setRefreshing(false), 500);
  };

  const setModal = (title: string, message: string, type: 'error' | 'success' | 'confirm' = 'error' ) => {
    setModalType({title, message, type});
  }

  const openChat = async (friend: any) => {
    const user = await authService.getCurrentUser();
    if (!user) {
      setModalType({
        title: 'Connection Error',
        message: 'User cannot be authenticated',
        type: 'error'
      })
      setModalVisible(true);
      return;
    }

    const conversation = await chatService.getOrCreateConversation(user.userId, friend.id);
    console.log('💬 Opening chat with conversationId:', conversation?.conversationId);

    // Now that we are gaurantee to have created a conversation or loaded into an existing one, we we
    // navigate to the screen
    router.push({
      pathname: `/chats/${conversation?.conversationId}`,
      params: { otherUserId: friend.id}
    })

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

      // Now that we have removed that friend, check to see if we have a conversation open with that friend
      // If yes, we need to delete it asap.
      const curConversation = await chatService.getOneConversation(user.userId, friend.id);

      if (curConversation?.conversationId) {
        await chatService.deleteConversationAndMessages(curConversation.conversationId);
      }

      setModal("Friend Removed", `You have removed ${removedFriend} from your friendlist`, 'success');
      onRefresh();
      setSelectedFriend(null);
      setModalVisible(true);
    } catch (error: any) {
      console.log('❌ Error removing friend:', error);
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
            <Image source={{ uri: item.avatarUrl }} style={{ width: width * 0.15, height: width * 0.15, borderRadius: width * 0.075 }} />
          ) : (
            <Ionicons name="person-circle" size={width * 0.15} color="#4CAF50" />
          )}

          <View style={styles.friendDetails}>
            <Text style={styles.friendName}>{item.username}</Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: width * 0.008 }}>

              {item.isLocationSharing ? (
                <MaterialIcons name='location-on' size={width * 0.025} color="#9420ceff" />
              ) : (
                <MaterialIcons name='location-off' size={width * 0.025} color="#9420ceff" />
              )}

              <Text style={styles.friendStatus}>
                {item.isLocationSharing ? ' Sharing location' : ' Location off'}
              </Text>
            </View>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
          <TouchableOpacity
            onPress={() => {
              openChat(item);
            }}
            style={{ marginRight: width * 0.045 }}
          >
            <Entypo name='new-message' size={width * 0.065} color="#A910F5" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setSelectedFriend(item);
              setModal('Friend Removal Confirmation', `Remove ${item.username} from your friend list?`, 'confirm');
              setModalVisible(true);
            }}
            disabled={isAnyRemoving}
          >
            {isRemoving ? (
              <ActivityIndicator size="small" color="#f80606ff" />
            ) : (
              <Ionicons name="close-circle" size={width * 0.075} color="#f80606ff" />
            )}
          </TouchableOpacity>
        </View>
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
            <MaterialIcons name="contacts" size={width * 0.20} color="#ddd" />
            <Text style={styles.emptyText}>You have no friend(s)</Text>
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
    borderColor: '#9420ceff',
    borderWidth: width * 0.002,
    padding: width * 0.03,
    marginHorizontal: width * 0.03,
    marginVertical: width * 0.04,
    borderRadius: width * 0.02,
  },
  friendInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  friendDetails: {
    marginLeft: width * 0.030,
  },
  friendName: {
    fontSize:   width * 0.035,
    fontWeight: 'bold',
  },
  friendStatus: {
    fontSize: width * 0.030,
    color: '#666',
    marginTop: width * 0.005,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: width * 0.25,
  },
  emptyText: {
    fontSize: width * 0.04,
    color: '#999',
    marginTop: width * 0.025,
  },
});