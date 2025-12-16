// src/screens/MapScreen.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Dimensions,
  Animated,
  Easing,
  Image
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { LocationService } from '../services/locationService';
import { authService } from '../services/authService';
import { useSubscriptions } from '../contexts/SubscriptionContext';
import { Ionicons } from '@expo/vector-icons';
import WebSocketIndicator from '../components/WebSocketIndicator';
import CustomModal from '@/components/modal';

const { height, width } = Dimensions.get('screen');

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState({
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });
  const [userLocation, setUserLocation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const animatedFriends = useRef(new Map()).current;
  const { friends, friendsMap, friendsOnline, isWebSocketConnected } = useSubscriptions();
  const [showModal, setShowModal] = useState(false);
  const [modalStats, setModalStats] = useState({
    type: 'error' as 'error' | 'success' | 'confirm',
    title: '',
    message: ''
  })

  useEffect(() => {
    initializeMap();
  }, []);

  // Get friends array from map, filter for those sharing location
  const friendsArray = useMemo(() => {
    return Array.from(friendsMap.values()).filter(
      f => f.isLocationSharing && f.latitude && f.longitude
    );
  }, [friendsMap]);

  // Update front end locations everytime the backend location changes!
  useEffect(() => {
    console.log('🗺️ MapScreen - friendsMap updated:', friendsMap.size, 'friends');

    friendsMap.forEach(friend => {
      // First, ensure all new friends have an animated location object if they are added!
      if (!animatedFriends.has(friend.id) && friend.latitude && friend.longitude) {
        animatedFriends.set(friend.id, {
          lat: new Animated.Value(friend.latitude),
          lng: new Animated.Value(friend.longitude),
          lastTime: Date.now(),
        });
      }

      // We do not need to care if they are not location sharing
      if (!friend.isLocationSharing || !friend.latitude || !friend.longitude) {
        return; // Basically a continue process
      }

      const curFriendEntry = animatedFriends.get(friend.id);
      if (!curFriendEntry) {
        return;
      }

      const now = Date.now();
      const duration = now - curFriendEntry.lastTime;
      curFriendEntry.lastTime = now;

      Animated.parallel([
        Animated.timing(curFriendEntry.lat, {
          toValue: friend.latitude,
          duration,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
        Animated.timing(curFriendEntry.lng, {
          toValue: friend.longitude,
          duration,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
      ]).start()
    })

    return () => {
      // Delete all animations so that our current map is clean when we switch tabs
      animatedFriends.forEach( friend => {
        friend.lat.stopAnimation();
        friend.lng.stopAnimation();
      });
    }

  }, [friendsMap]);

  const initializeMap = async () => {
    try {
      const user = await authService.getCurrentUser();
      if (!user) return;

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

        await locationService.startLocationTracking(user.userId, (newLocation) => {
          setUserLocation(newLocation);
        });
      }

    } catch (error) {
      console.error('Error initializing map:', error);
    } finally {
      setLoading(false);
    }
  };

  const searchFriend = () => {
    if (!searchText.trim()) return;


    console.log('🗺️ MapScreen rendering:', {
      friendsCount: friends.length,
      mapSize: friendsMap.size,
      visibleOnMap: friendsArray.length,
      online: friendsOnline,
    });


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
      setModalStats({
        type: 'error',
        title: 'Search Failure',
        message: 'Failure to find and locate friends in near proximity'
      });
      setShowModal(true);
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


  console.log('🗺️ MapScreen rendering:', friendsArray.length, 'friends visible on map');

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
        <WebSocketIndicator />
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

        {Array.from(friendsMap.values()).map(friend => {
          // Check for the all latitude and longtitudes to be valid!
          if (!friend.isLocationSharing || !friend.latitude || !friend.longitude) return null;
          const anim = animatedFriends.get(friend.id);
          // Null check for animation field
          if (!anim) return null;

          return (
            <Marker.Animated
              key={friend.id}
              coordinate={{ latitude: anim.lat, longitude: anim.lng }}
              title={friend.username}
              description={`Last updated: ${friend.locationUpdatedAt ? new Date(friend.locationUpdatedAt).toLocaleTimeString() : 'unknown'}`}
            >
              <View style={styles.friendMarker}>

                {friend.avatarUrl ? (
                  <Image source={{ uri: friend.avatarUrl }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                ) : (
                  <Text style={styles.friendMarkerText}>
                    {friend.username.substring(0, 2).toUpperCase()}
                  </Text>
                )}
              </View>
            </Marker.Animated>
          );
        })}
      </MapView>

      <TouchableOpacity style={styles.centerButton} onPress={centerOnUser}>
        <Ionicons name="locate" size={24} color="#666" />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.refreshButton}
        onPress={async () => {
          console.log('🔄 Manual refresh triggered');
        }}
      >
        <Ionicons name="refresh" size={24} color="#666" />
      </TouchableOpacity>

      <View style={styles.statusBar}>
        <Text style={styles.statusText}>
          {friendsArray.length} friend{friendsArray.length !== 1 ? 's' : ''} online
        </Text>
        {friendsArray.length > 0 && (
          <Text style={styles.statusSubtext}>Real-time tracking active</Text>
        )}
      </View>
      <CustomModal
        visible={showModal}
        title={modalStats.title}
        message={modalStats.message}
        type={modalStats.type}
        onClose={() => setShowModal(false)}
      />
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
    top: width * 0.04,
    left: width * 0.02,
    right: width * 0.02,
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: width * 0.02,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: width * 0.04,
    paddingHorizontal: width * 0.02,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: width * 0.02,
    },
    shadowOpacity: 0.25,
    shadowRadius: width * 0.035,
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
    paddingHorizontal: width * 0.02,
    paddingVertical: width * 0.03,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
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
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  refreshButton: {
    position: 'absolute',
    right: 15,
    bottom: 160, // Above the center button
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
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
  statusSubtext: {
    color: '#90EE90',
    fontSize: 10,
    marginTop: 2,
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