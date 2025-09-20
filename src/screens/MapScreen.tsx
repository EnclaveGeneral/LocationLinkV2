// src/screens/MapScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  Text,
  TouchableOpacity,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { LocationService } from '../services/locationService';
import { authService } from '../services/authService';
import { friendService } from '../services/friendService';
import { client } from '../services/amplifyConfig';
import { Ionicons } from '@expo/vector-icons';

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState({
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });
  const [userLocation, setUserLocation] = useState<any>(null);
  const [friends, setFriends] = useState<Map<string, any>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const subscriptionsRef = useRef<any[]>([]);

  useEffect(() => {
    initializeMap();

    // Cleanup subscriptions on unmount
    return () => {
      subscriptionsRef.current.forEach(sub => {
        if (sub && typeof sub.unsubscribe === 'function') {
          sub.unsubscribe();
        }
      });
    };
  }, []);

  const initializeMap = async () => {
    try {
      const user = await authService.getCurrentUser();
      if (!user) return;

      setCurrentUserId(user.userId);

      // Start location tracking
      const locationService = LocationService.getInstance();
      const hasPermission = await locationService.requestPermissions();

      if (hasPermission) {
        const location = await locationService.getCurrentLocation();
        setUserLocation(location);
        setRegion({
          ...location,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });

        // Start continuous tracking with callback for UI updates
        await locationService.startLocationTracking(user.userId, (newLocation) => {
          setUserLocation(newLocation);
        });
      }

      // Load friends and set up subscriptions
      await loadFriendsWithSubscriptions(user.userId);
    } catch (error) {
      console.error('Error initializing map:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFriendsWithSubscriptions = async (userId: string) => {
    try {
      // Get initial friends list
      const friendsList = await friendService.getFriends(userId);

      // Create a map for efficient updates
      const friendsMap = new Map();
      friendsList.forEach(friend => {
        if (friend.isLocationSharing && friend.latitude && friend.longitude) {
          friendsMap.set(friend.id, friend);
        }
      });
      setFriends(friendsMap);

      // Subscribe to each friend's location updates
      friendsList.forEach(friend => {
        subscribeToFriendLocationUpdates(friend.id);
      });

      // Subscribe to new friendships
      subscribeToNewFriendships(userId);

    } catch (error) {
      console.error('Error loading friends:', error);
    }
  };

  const subscribeToFriendLocationUpdates = (friendId: string) => {
    try {
      // Subscribe to User model updates for this specific friend
      const subscription = client.models.User.observeQuery({
        filter: { id: { eq: friendId } }
      }).subscribe({
        next: ({ items }) => {
          if (items.length > 0) {
            const friend = items[0];
            setFriends(prev => {
              const newMap = new Map(prev);

              // If friend is sharing location and has coordinates, update/add them
              if (friend.isLocationSharing && friend.latitude && friend.longitude) {
                newMap.set(friend.id, friend);
              } else {
                // If friend stopped sharing, remove from map
                newMap.delete(friend.id);
              }

              return newMap;
            });
          }
        },
        error: (error) => {
          console.error('Subscription error for friend:', friendId, error);
        }
      });

      subscriptionsRef.current.push(subscription);
    } catch (error) {
      console.error('Error subscribing to friend updates:', error);
    }
  };

  const subscribeToNewFriendships = (userId: string) => {
    try {
      // Subscribe to new Friend records where we're involved
      const friendshipSub = client.models.Friend.observeQuery({
        filter: {
          or: [
            { userId: { eq: userId } },
            { friendId: { eq: userId } }
          ]
        }
      }).subscribe({
        next: async ({ items }) => {
          // When a new friendship is created, load that friend's data
          for (const friendship of items) {
            const friendId = friendship.userId === userId ? friendship.friendId : friendship.userId;

            // Check if we're already subscribed to this friend
            if (!friends.has(friendId)) {
              try {
                const friendData = await client.models.User.get({ id: friendId });
                if (friendData.data) {
                  const friend = friendData.data;
                  if (friend.isLocationSharing && friend.latitude && friend.longitude) {
                    setFriends(prev => {
                      const newMap = new Map(prev);
                      newMap.set(friend.id, friend);
                      return newMap;
                    });
                  }
                  // Subscribe to this new friend's updates
                  subscribeToFriendLocationUpdates(friendId);
                }
              } catch (error) {
                console.error('Error loading new friend data:', error);
              }
            }
          }
        },
        error: (error) => {
          console.error('Friendship subscription error:', error);
        }
      });

      subscriptionsRef.current.push(friendshipSub);
    } catch (error) {
      console.error('Error subscribing to friendships:', error);
    }
  };

  const searchFriend = () => {
    if (!searchText.trim()) return;

    const friendsArray = Array.from(friends.values());
    const friend = friendsArray.find(f =>
      f.username.toLowerCase().includes(searchText.toLowerCase())
    );

    if (friend && friend.latitude && friend.longitude) {
      const newRegion = {
        latitude: friend.latitude,
        longitude: friend.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      setRegion(newRegion);
      mapRef.current?.animateToRegion(newRegion, 1000);
    } else {
      Alert.alert('Not Found', 'Friend not found or not sharing location');
    }
  };

  const centerOnUser = () => {
    if (userLocation && mapRef.current) {
      const newRegion = {
        ...userLocation,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      mapRef.current.animateToRegion(newRegion, 1000);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading map...</Text>
      </View>
    );
  }

  const friendsArray = Array.from(friends.values());

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#666" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search friend..."
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={searchFriend}
          />
        </View>
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live</Text>
        </View>
      </View>

      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={region}
        showsUserLocation={false}
      >
        {userLocation && (
          <Marker
            coordinate={userLocation}
            title="You"
            description="Your current location"
          >
            <View style={styles.userMarker}>
              <View style={styles.userMarkerInner} />
            </View>
          </Marker>
        )}

        {friendsArray.map((friend) => (
          <Marker
            key={friend.id}
            coordinate={{
              latitude: friend.latitude,
              longitude: friend.longitude,
            }}
            title={friend.username}
            description={`Last updated: ${friend.locationUpdatedAt ? new Date(friend.locationUpdatedAt).toLocaleTimeString() : 'Unknown'}`}
          >
            <View style={styles.friendMarker}>
              <Text style={styles.friendMarkerText}>
                {friend.username.substring(0, 2).toUpperCase()}
              </Text>
            </View>
          </Marker>
        ))}
      </MapView>

      <TouchableOpacity
        style={styles.centerButton}
        onPress={centerOnUser}
      >
        <Ionicons name="locate" size={24} color="#666" />
      </TouchableOpacity>

      <View style={styles.statusBar}>
        <Text style={styles.statusText}>
          {friendsArray.length} friend{friendsArray.length !== 1 ? 's' : ''} online
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
  },
  searchContainer: {
    position: 'absolute',
    top: 50,
    left: 10,
    right: 10,
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 25,
    paddingHorizontal: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  searchInput: {
    flex: 1,
    height: 45,
    marginLeft: 10,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginRight: 5,
  },
  liveText: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  map: {
    flex: 1,
  },
  centerButton: {
    position: 'absolute',
    right: 15,
    bottom: 100,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  statusBar: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusText: {
    color: 'white',
    fontSize: 14,
  },
  userMarker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(33, 150, 243, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMarkerInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2196F3',
  },
  friendMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  friendMarkerText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
});