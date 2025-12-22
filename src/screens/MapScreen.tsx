// src/screens/MapScreen.tsx - OPTIMIZED FOR REAL DEVICES WITH LOADING DOTS
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
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocationService } from '../services/locationService';
import { authService } from '../services/authService';
import { useSubscriptions } from '../contexts/SubscriptionContext';
import { Ionicons } from '@expo/vector-icons';
import WebSocketIndicator from '../components/WebSocketIndicator';
import CustomModal from '@/components/modal';

const { height, width } = Dimensions.get('screen');

const MARKER_COLORS = [
  '#4CAF50', '#2196F3', '#9C27B0', '#FF9800',
  '#E91E63', '#00BCD4', '#FF5722', '#673AB7',
];

const getRandomColor = (oderId: string) => {
  let hash = 0;
  for (let i = 0; i < oderId.length; i++) {
    hash = oderId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return MARKER_COLORS[Math.abs(hash) % MARKER_COLORS.length];
};

const FriendMarker = ({ friend, coordinate, color }: any) => {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    if (!friend.avatarUrl) {
      const timer = setTimeout(() => setTracksViewChanges(false), 500);
      return () => clearTimeout(timer);
    }
  }, [friend.avatarUrl]);

  const onImageLoad = () => {
    setTimeout(() => setTracksViewChanges(false), 100);
  };

  return (
    <Marker.Animated
      coordinate={coordinate}
      title={friend.username}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksViewChanges}
    >
      {friend.avatarUrl ? (
        <View style={[styles.friendMarker, { backgroundColor: 'transparent' }]}>
          <Image
            source={{ uri: friend.avatarUrl }}
            style={{ width: width * 0.1, height: width * 0.1, borderRadius: width * 0.05 }}
            onLoad={onImageLoad}
          />
        </View>
      ) : (
        <View style={[styles.friendMarker, { backgroundColor: color }]}>
          <Text style={styles.friendMarkerText}>
            {friend.username.substring(0, 2).toUpperCase()}
          </Text>
        </View>
      )}
    </Marker.Animated>
  );
};

// Loading steps - YOUR ORIGINAL with dots
type LoadingStep = 'auth' | 'permissions' | 'location' | 'tracking' | 'done';

const LOADING_MESSAGES: Record<LoadingStep, string> = {
  auth: 'Checking authentication...',
  permissions: 'Requesting location permissions...',
  location: 'Getting your location...',
  tracking: 'Starting location tracking...',
  done: 'Map ready!',
};

const DEFAULT_REGION = {
  latitude: 39.8283,
  longitude: -98.5795,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [userLocation, setUserLocation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState<LoadingStep>('auth');
  const [searchText, setSearchText] = useState('');
  const [locationAccuracy, setLocationAccuracy] = useState<'low' | 'medium'>('low');
  const animatedFriends = useRef(new Map()).current;
  const { friends, friendsMap, friendsOnline, forceReload } = useSubscriptions();
  const [showModal, setShowModal] = useState(false);
  const [modalStats, setModalStats] = useState({
    type: 'error' as 'error' | 'success' | 'confirm',
    title: '',
    message: ''
  });

  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    initializeMapFast();
  }, []);

  const friendsArray = useMemo(() => {
    return Array.from(friendsMap.values()).filter(
      f => f.isLocationSharing && f.latitude != null && f.longitude != null
    );
  }, [friendsMap]);

  useEffect(() => {
    friendsMap.forEach(friend => {
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

      if (!friend.isLocationSharing || friend.latitude == null || friend.longitude == null) {
        animatedFriends.delete(friend.id);
        return;
      }

      const curFriendEntry = animatedFriends.get(friend.id);
      if (!curFriendEntry) return;

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
      animatedFriends.clear();
    };
  }, [friendsMap]);

  // OPTIMIZED: Fast initialization - show map ASAP
  const initializeMapFast = async () => {
    const startTime = Date.now();
    console.log('🗺️ Starting FAST map initialization...');

    try {
      // STEP 1: Auth check
      setLoadingStep('auth');
      const user = await authService.getCurrentUser();

      if (!user) {
        console.error('No user found');
        setLoading(false);
        return;
      }
      userIdRef.current = user.userId;
      console.log(`📍 Auth complete (${Date.now() - startTime}ms)`);

      // STEP 2: Permission check
      setLoadingStep('permissions');
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        console.log('⚠️ Location permission not granted');
        setModalStats({
          type: 'error',
          title: 'Permission Required',
          message: 'Location permission is required to show your position on the map.'
        });
        setShowModal(true);
        setLoading(false);
        return;
      }
      console.log(`📍 Permissions granted (${Date.now() - startTime}ms)`);

      // STEP 3: Get initial location FAST
      setLoadingStep('location');
      const initialLocation = await getFastLocation();

      if (initialLocation) {
        console.log(`📍 Got initial location in ${Date.now() - startTime}ms`);
        setUserLocation(initialLocation);
        setRegion({
          ...initialLocation,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      }

      // STEP 4: Show "tracking" briefly then show map
      setLoadingStep('tracking');

      // ⚡ KEY FIX: Don't wait for tracking to start - show map immediately!
      // Use a short delay just to show the step visually
      await new Promise(resolve => setTimeout(resolve, 300));

      // STEP 5: SHOW THE MAP NOW!
      setLoadingStep('done');
      setLoading(false);
      console.log(`✅ Map ready in ${Date.now() - startTime}ms`);

      // STEP 6: Start location tracking in BACKGROUND (fire and forget)
      startTrackingInBackground(user.userId);

      // Request background permissions in background too
      Location.requestBackgroundPermissionsAsync()
        .then(({ status }) => console.log('Background permission:', status))
        .catch(console.error);

    } catch (error) {
      console.error('Error initializing map:', error);
      setLoading(false);
    }
  };

  // Start tracking without blocking the UI
  const startTrackingInBackground = (userId: string) => {
    const locationService = LocationService.getInstance();

    locationService.startLocationTracking(userId, (newLocation) => {
      setUserLocation(newLocation);

      if (newLocation.accuracy != null && newLocation.accuracy < 50) {
        setLocationAccuracy('medium');
      }

    }).catch(err => console.error('Location tracking error:', err));
  };

  // Get location as fast as possible
  const getFastLocation = async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      // Strategy 1: Try cached location (instant!)
      const cachedStr = await AsyncStorage.getItem('lastLocation');
      if (cachedStr) {
        console.log('📍 Using cached location from storage');
        setLocationAccuracy('low');
        return JSON.parse(cachedStr);
      }

      // Strategy 2: Try getLastKnownPositionAsync (very fast)
      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 10 * 60 * 1000, // Accept up to 10 minutes old
      });

      if (lastKnown) {
        console.log('📍 Using last known position');
        setLocationAccuracy('low');
        return {
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
        };
      }

      // Strategy 3: Get LOW accuracy location with short timeout
      console.log('📍 Getting low-accuracy location...');
      const lowAccuracy = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low, // Cell/WiFi - fast
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);

      if (lowAccuracy && 'coords' in lowAccuracy) {
        console.log('📍 Got low-accuracy location');
        setLocationAccuracy('low');
        const coords = {
          latitude: lowAccuracy.coords.latitude,
          longitude: lowAccuracy.coords.longitude,
        };
        // Cache it for next time
        await AsyncStorage.setItem('lastLocation', JSON.stringify(coords));
        return coords;
      }

      console.log('⚠️ Could not get fast location');
      return null;

    } catch (error) {
      console.error('Error getting fast location:', error);
      return null;
    }
  };

  const searchFriend = () => {
    if (!searchText.trim()) return;

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
        message: 'Could not find friend on map'
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

  // YOUR ORIGINAL LOADING SCREEN WITH DOTS
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#9420ceff" />
        <Text style={styles.loadingText}>{LOADING_MESSAGES[loadingStep]}</Text>
        {/* Progress dots */}
        <View style={styles.progressContainer}>
          {(['auth', 'permissions', 'location', 'tracking'] as LoadingStep[]).map((step, index) => {
            const steps = ['auth', 'permissions', 'location', 'tracking'];
            const currentIndex = steps.indexOf(loadingStep);
            const isComplete = index < currentIndex;
            const isCurrent = index === currentIndex;

            return (
              <View
                key={step}
                style={[
                  styles.progressDot,
                  isComplete && styles.progressDotComplete,
                  isCurrent && styles.progressDotCurrent,
                ]}
              />
            );
          })}
        </View>
      </View>
    );
  }

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
              <View style={[
                styles.userMarkerInner,
                // Orange when low accuracy, purple when medium/high
                locationAccuracy === 'low' && { backgroundColor: '#FFA500' }
              ]} />
            </View>
          </Marker>
        )}

        {Array.from(friendsMap.values()).map(friend => {
          if (!friend.isLocationSharing || friend.latitude == null || friend.longitude == null) return null;

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
          await forceReload();
          console.log('🔄 Manual refresh triggered');
        }}
      >
        <Ionicons name="refresh" size={width * 0.06} color="#9420ceff" />
      </TouchableOpacity>

      <View style={styles.statusBar}>
        <Text style={styles.statusText}>
          {friendsArray.length} friend{friendsArray.length !== 1 ? 's' : ''} online
        </Text>
        {locationAccuracy === 'low' && (
          <Text style={styles.statusSubtext}>📍 Improving accuracy...</Text>
        )}
        {locationAccuracy === 'medium' && friendsArray.length > 0 && (
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
    fontSize: width * 0.04,
  },
  progressContainer: {
    flexDirection: 'row',
    marginTop: width * 0.05,
    gap: width * 0.02,
  },
  progressDot: {
    width: width * 0.025,
    height: width * 0.025,
    borderRadius: width * 0.0125,
    backgroundColor: '#e0e0e0',
  },
  progressDotComplete: {
    backgroundColor: '#9420ceff',
  },
  progressDotCurrent: {
    backgroundColor: '#4CAF50',
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
    shadowOffset: { width: 0, height: width * 0.02 },
    shadowOpacity: 0.25,
    shadowRadius: width * 0.035,
    elevation: 5,
  },
  searchInput: {
    flex: 1,
    height: width * 0.10,
    marginLeft: width * 0.02,
    color: '#9420ceff'
  },
  map: {
    flex: 1,
  },
  centerButton: {
    position: 'absolute',
    right: width * 0.033,
    bottom: width * 0.223,
    width: width * 0.112,
    height: width * 0.112,
    borderRadius: width * 0.056,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: width * 0.0045 },
    shadowOpacity: 0.25,
    shadowRadius: width * 0.0086,
    elevation: 5,
  },
  refreshButton: {
    position: 'absolute',
    right: width * 0.033,
    bottom: width * 0.357,
    width: width * 0.112,
    height: width * 0.112,
    borderRadius: width * 0.056,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: width * 0.0045 },
    shadowOpacity: 0.25,
    shadowRadius: width * 0.0086,
    elevation: 5,
  },
  statusBar: {
    position: 'absolute',
    bottom: width * 0.02,
    right: width * 0.01,
    backgroundColor: 'rgba(117, 9, 167, 1)',
    paddingHorizontal: width * 0.033,
    paddingVertical: width * 0.018,
    borderRadius: width * 0.045,
  },
  statusText: {
    color: 'white',
    fontSize: width * 0.031,
  },
  statusSubtext: {
    color: '#90EE90',
    fontSize: width * 0.022,
    marginTop: width * 0.0045,
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
    width: width * 0.08,
    height: width * 0.08,
    borderRadius: width * 0.04,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: width * 0.0045,
    borderColor: 'white',
    overflow: 'hidden',
  },
  friendMarkerText: {
    color: 'white',
    fontSize: width * 0.027,
    fontWeight: 'bold',
  },
});