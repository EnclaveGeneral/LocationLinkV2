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
import MapView, { Marker, PROVIDER_GOOGLE, AnimatedRegion } from 'react-native-maps';
import { LocationService } from '../services/locationService';
import { authService } from '../services/authService';
import { useSubscriptions } from '../contexts/SubscriptionContext';
import { Ionicons } from '@expo/vector-icons';
import WebSocketIndicator from '../components/WebSocketIndicator';
import CustomModal from '@
/components/modal';

const { height, width } = Dimensions.get('screen');

const MARKER_COLORS = [
  '#4CAF50', // Green
  '#2196F3', // Blue
  '#9C27B0', // Purple
  '#FF9800', // Orange
  '#E91E63', // Pink
  '#00BCD4', // Cyan
  '#FF5722', // Deep Orange
  '#673AB7', // Deep Purple
];

const getRandomColor = (oderId: string) => {
  // Generate a color based on friend ID
  let hash = 0;
  for (let i = 0 ; i < oderId.length; i++) {
    hash = oderId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return MARKER_COLORS[Math.abs(hash) % MARKER_COLORS.length];
}

const FriendMarker = ({ friend, coordinate, color }: any) => {
  // FIX 2: specific state to track image loading
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    // Stop tracking changes after a delay to save battery/performance
    // but give the image time to render first
    if (!friend.avatarUrl) {
        const timer = setTimeout(() => {
            setTracksViewChanges(false);
        }, 500);
        return () => clearTimeout(timer);
    }
  }, [friend.avatarUrl]);

  const onImageLoad = () => {
    // Once image loads, allow one more render cycle then freeze
    setTimeout(() => {
      setTracksViewChanges(false);
    }, 100);
  };

  return (
    <Marker.Animated
      coordinate={coordinate}
      title={friend.username}
      anchor={{ x: 0.5, y: 0.5 }}
      // Use the dynamic state here
      tracksViewChanges={tracksViewChanges}
    >
      <View style={styles.friendMarker}>
        {friend.avatarUrl ? (
          <Image
            source={{ uri: friend.avatarUrl }}
            style={{ width: width * 0.1, height: width * 0.1, borderRadius: width * 0.05 }}
            onLoad={onImageLoad}
          />
        ) : (
          <View style={[styles.friendMarker, { backgroundColor: color }]}>
             <Text style={styles.friendMarkerText}>
               {friend.username.substring(0, 2).toUpperCase()}
             </Text>
          </View>
        )}
      </View>
    </Marker.Animated>
  );
};

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
  const { friends, friendsMap, friendsOnline, forceReload } = useSubscriptions();
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
      f => f.isLocationSharing && f.latitude != null && f.longitude != null
    );
  }, [friendsMap]);

  // Update front end locations everytime the backend location changes!
  useEffect(() => {
    console.log('🗺️ MapScreen - friendsMap updated:', friendsMap.size, 'friends');

    friendsMap.forEach(friend => {
      // First, ensure all new friends have an animated location object if they are added!
      if (
        friend.isLocationSharing &&
        friend.latitude != null &&
        friend.longitude != null &&
        !animatedFriends.has(friend.id)
      ) {
        animatedFriends.set(friend.id, {
          coordinate: new AnimatedRegion({
            latitude: friend.latitude,
            longitude: friend.longitude,
            latitudeDelta: 0,
            longitudeDelta: 0,
          }),
          lastTime: Date.now(),
        });
      }

      // We need to terminate animations for friends who have stopped sharing locations
      if (!friend.isLocationSharing || friend.latitude == null || friend.longitude == null) {
        animatedFriends.delete(friend.id);
        return;
      }

      const curFriendEntry = animatedFriends.get(friend.id);
      if (!curFriendEntry) {
        return;
      }

      const now = Date.now();
      const duration = Math.min(1500, Math.max(500, now - curFriendEntry.lastTime));
      curFriendEntry.lastTime = now;

      curFriendEntry.coordinate.timing({
        latitude: friend.latitude,
        longitude: friend.longitude,
        duration,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();
    });

    return () => {
      // Delete all animations so that our current map is clean when we switch tabs
      animatedFriends.clear();
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

    if (friend && friend.latitude != null && friend.longitude != null) {
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
        <ActivityIndicator size="large" color="#9420ceff" />
        <Text style={styles.loadingText}>Loading map...</Text>
      </View>
    );
  }


  console.log('🗺️ MapScreen rendering:', friendsArray.length, 'friends visible on map');

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search friend..."
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={searchFriend}
          />
          <Ionicons name="search" size={width * 0.05} color="#4709b1ff" />
        </View>
        <WebSocketIndicator />
      </View>

      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        toolbarEnabled={false}
        style={styles.map}
        initialRegion={region}
        showsUserLocation={false}
      >
        {userLocation && (
          <Marker
            coordinate={userLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.userMarker}>
              <View style={styles.userMarkerInner} />
            </View>
          </Marker>
        )}

        {Array.from(friendsMap.values()).map(friend => {
          if (!friend.isLocationSharing || friend.latitude == null || friend.longitude == null) return null;

          // Immediate render the object
          // Don't wait for useEffect, or the first render will always be null.
          if (!animatedFriends.has(friend.id)) {
            animatedFriends.set(friend.id, {
              coordinate: new AnimatedRegion({
                latitude: friend.latitude,
                longitude: friend.longitude,
                latitudeDelta: 0,
                longitudeDelta: 0,
              }),
              lastTime: Date.now(),
            });
          }

          const anim = animatedFriends.get(friend.id);
          const markerColor = getRandomColor(friend.id);

          return (
            <FriendMarker
                key={friend.id}
                friend={friend}
                coordinate={anim.coordinate}
                color={markerColor}
            />
          );
        })}
      </MapView>

      <TouchableOpacity style={styles.centerButton} onPress={centerOnUser}>
        <Ionicons name="locate" size={width * 0.06} color="#9420ceff" />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.refreshButton}
        onPress={async () => {
          {/* Manual Refresh Current and All Friends Location! */}
          await forceReload();
          console.log('🔄 Manual refresh triggered');
        }}
      >
        <Ionicons name="refresh" size={width * 0.06} color="#9420ceff" />
      </TouchableOpacity>

      <View style={styles.statusBar}>
        <Text style={styles.statusText}>
          {friendsArray.length} friend{friendsArray.length > 1 ? 's' : ''} online
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
    marginTop: width * 0.025,
    color: '#9420ceff',
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
    height: width * 0.10,
    marginLeft: 10,
    color: '#9420ceff'
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: width * 0.02,
    paddingVertical: width * 0.10,
    borderRadius: width * 0.05,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: width * 0.005,
    },
    shadowOpacity: 0.25,
    shadowRadius: width * 0.0086,
    elevation: 5,
  },
  liveDot: {
    width: width * 0.018,  // was: 8
    height: width * 0.018,  // was: 8
    borderRadius: width * 0.009,  // was: 4
    backgroundColor: '#4CAF50',
    marginRight: width * 0.011,  // was: 5
  },
  liveText: {
    color: '#4CAF50',
    fontWeight: '600',
    fontSize: width * 0.035,  // was: 14
  },
  map: {
    flex: 1,
  },
  centerButton: {
    position: 'absolute',
    right: width * 0.033,  // was: 15
    bottom: width * 0.223,  // was: 100
    width: width * 0.112,  // was: 50
    height: width * 0.112,  // was: 50
    borderRadius: width * 0.056,  // was: 25
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: width * 0.0045,  // was: 2
    },
    shadowOpacity: 0.25,
    shadowRadius: width * 0.0086,  // was: 3.84
    elevation: 5,
  },
  refreshButton: {
    position: 'absolute',
    right: width * 0.033,  // was: 15
    bottom: width * 0.357,  // was: 160
    width: width * 0.112,  // was: 50
    height: width * 0.112,  // was: 50
    borderRadius: width * 0.056,  // was: 25
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: width * 0.0045,  // was: 2
    },
    shadowOpacity: 0.25,
    shadowRadius: width * 0.0086,  // was: 3.84
    elevation: 5,
  },
  statusBar: {
    position: 'absolute',
    bottom: width * 0.02,
    right: width * 0.01,
    backgroundColor: 'rgba(117, 9, 167, 1)',
    paddingHorizontal: width * 0.033,  // was: 15
    paddingVertical: width * 0.018,  // was: 8
    borderRadius: width * 0.045,  // was: 20
  },
  statusText: {
    color: 'white',
    fontSize: width * 0.031,  // was: 14
  },
  statusSubtext: {
    color: '#90EE90',
    fontSize: width * 0.022,  // was: 10
    marginTop: width * 0.0045,  // was: 2
  },
  userMarker: {
    width: width * 0.07,
    height: width * 0.07,
    borderRadius: width * 0.035,
    backgroundColor: 'rgba(109, 74, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMarkerInner: {
    width: width * 0.03,
    height: width * 0.03,
    borderRadius: width * 0.015,
    backgroundColor: '#b133f0ff',
  },
  friendMarker: {
    width: width * 0.08,  // was: 36
    height: width * 0.08,  // was: 36
    borderRadius: width * 0.04,  // was: 18
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: width * 0.0045,  // was: 2
    borderColor: 'white',
  },
  friendMarkerText: {
    color: 'white',
    fontSize: width * 0.027,  // was: 12
    fontWeight: 'bold',
  },
});