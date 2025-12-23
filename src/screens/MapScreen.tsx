// src/screens/MapScreen.tsx - FULLY FIXED VERSION
//
// FIXES APPLIED:
// 1. ✅ User marker is now ANIMATED (no more snappy jumping)
// 2. ✅ Stale friend entries cleaned up when friends are removed
// 3. ✅ Proper cleanup of animated coordinates
// 4. ✅ User preference respected for location sharing
// 5. ✅ Dark/light theme support for map and tab bar

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Dimensions,
  useColorScheme,
  Image,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, AnimatedRegion } from 'react-native-maps';
import * as Location from 'expo-location';
import { LocationService, LocationUpdate } from '../services/locationService';
import { authService } from '../services/authService';
import { dataService } from '../services/dataService';
import { useSubscriptions } from '../contexts/SubscriptionContext';
import { Ionicons } from '@expo/vector-icons';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import WebSocketIndicator from '../components/WebSocketIndicator';
import CustomModal from '@/components/modal';

const { width } = Dimensions.get('screen');

// ============================================
// THEME COLORS
// ============================================
const COLORS = {
  background: '#ffffff',
  primary: '#9420ceff',
  accent: '#9420ceff',
  statusBar: 'rgba(117, 9, 167, 1)',
  statusText: '#ffffff',
  statusSubtext: '#90EE90',
  searchBg: '#ffffff',
  searchText: '#9420ceff',
  searchPlaceholder: '#999999',
  buttonBg: '#ffffff',
  lowAccuracyColor: '#FFA500',
  highAccuracyColor: '#b133f0ff',
  userMarkerBg: 'rgba(14, 7, 41, 0.22)',
};

const DARK_THEME = {
  background: '#191919ff',
  primary: '#9420ceff',
  accent: '#4709b1ff',
  statusBar: 'rgba(117, 9, 167, 1)',
  statusText: '#ffffff',
  statusSubtext: '#90EE90',
  searchBg: '#191919ff',
  searchText: '#ffffff',
  searchPlaceholder: '#999999',
  buttonBg: '#191919ff',
  lowAccuracyColor: '#FFA500',
  highAccuracyColor: '#b133f0ff',
  userMarkerBg: 'rgba(245, 245, 245, 0.22)',
};

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

// ============================================
// FRIEND MARKER COMPONENT (unchanged - already animated)
// ============================================
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
      coordinate={coordinate as any}
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

// ============================================
// USER MARKER COMPONENT (Animated Version)
// ============================================
const UserMarker = ({
  coordinate,
  locationAccuracy,
  theme
}: {
  coordinate: AnimatedRegion;
  locationAccuracy: 'low' | 'high';
  theme: typeof COLORS;
}) => {
  return (
    <Marker.Animated
      coordinate={coordinate as any}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={false}
    >
      <View style={[styles.userMarker, { backgroundColor: theme.userMarkerBg }]}>
        <View style={[
          styles.userMarkerInner,
          { backgroundColor: locationAccuracy === 'low' ? theme.lowAccuracyColor : theme.highAccuracyColor }
        ]} />
      </View>
    </Marker.Animated>
  );
};

// Loading steps
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

const GOOD_ACCURACY_THRESHOLD = 50;

// Animation duration for smooth marker movement
const USER_ANIMATION_DURATION = 500;
const FRIEND_MIN_ANIMATION_DURATION = 500;
const FRIEND_MAX_ANIMATION_DURATION = 1500;

// Helper to animate an AnimatedRegion (works on both iOS and Android)
const animateMarker = (
  animatedRegion: AnimatedRegion,
  newCoordinate: { latitude: number; longitude: number },
  duration: number
) => {
  // Cast any to bypass TypeScript strict checking on the timing API
  (animatedRegion as any).timing({
    latitude: newCoordinate.latitude,
    longitude: newCoordinate.longitude,
    latitudeDelta: 0,
    longitudeDelta: 0,
    duration,
    useNativeDriver: false,
  }).start();
};


export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState<LoadingStep>('auth');
  const [searchText, setSearchText] = useState('');
  const [locationAccuracy, setLocationAccuracy] = useState<'low' | 'high'>('low');
  const [showModal, setShowModal] = useState(false);
  const [modalStats, setModalStats] = useState({
    type: 'error' as 'error' | 'success' | 'confirm',
    title: '',
    message: ''
  });

  // ✅ FIX 1: Animated user coordinate (prevents snappy jumping)
  const userAnimatedCoordinate = useRef(new AnimatedRegion({
    latitude: DEFAULT_REGION.latitude,
    longitude: DEFAULT_REGION.longitude,
    latitudeDelta: 0,
    longitudeDelta: 0,
  })).current;

  // Track current user position
  const currentUserPosition = useRef<{ latitude: number; longitude: number} | null>(null);

  // Track if user has a location yet (for conditional rendering)
  const [hasUserLocation, setHasUserLocation] = useState(false);

  // Friend animated coordinates
  const animatedFriends = useRef(new Map<string, {
    coordinate: AnimatedRegion;
    lastTime: number;
  }>()).current;

  const { friendsMap, forceReload } = useSubscriptions();

  const userIdRef = useRef<string | null>(null);
  const locationServiceRef = useRef<LocationService | null>(null);

  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? DARK_THEME : COLORS;

  // ============================================
  // INITIALIZATION
  // ============================================
  useEffect(() => {
    initializeMap();

    return () => {
      // Cleanup handled by LocationService singleton
    };
  }, []);

  // ============================================
  // FRIENDS ARRAY (for status bar count)
  // ============================================
  const friendsArray = useMemo(() => {
    return Array.from(friendsMap.values()).filter(
      f => f.isLocationSharing && f.latitude != null && f.longitude != null
    );
  }, [friendsMap]);

  // ============================================
  // ✅ FIX 2: ANIMATE FRIEND MARKERS + CLEANUP STALE ENTRIES
  // ============================================
  useEffect(() => {
    // First, clean up friends no longer in friendsMap (removed friends)
    const currentFriendIds = new Set(friendsMap.keys());
    animatedFriends.forEach((_, id) => {
      if (!currentFriendIds.has(id)) {
        console.log(`🗑️ Cleaning up stale animated entry for friend: ${id}`);
        animatedFriends.delete(id);
      }
    });

    // Then animate existing friends
    friendsMap.forEach(friend => {
      // Skip friends not sharing or without location
      if (!friend.isLocationSharing || friend.latitude == null || friend.longitude == null) {
        // Remove from animated map if they stopped sharing
        if (animatedFriends.has(friend.id)) {
          console.log(`📍 Friend ${friend.username} stopped sharing, removing animated entry`);
          animatedFriends.delete(friend.id);
        }
        return;
      }

      // Create new animated entry if needed
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
        return;
      }

      // Animate to new position
      const curFriendEntry = animatedFriends.get(friend.id)!;
      const now = Date.now();
      const duration = Math.min(
        FRIEND_MAX_ANIMATION_DURATION,
        Math.max(FRIEND_MIN_ANIMATION_DURATION, now - curFriendEntry.lastTime)
      );
      curFriendEntry.lastTime = now;

      // Call the helper function to animate user location and movement
      animateMarker(curFriendEntry.coordinate, {
        latitude: friend.latitude,
        longitude: friend.longitude,
      }, duration);
    });
    // Note: We don't clear animatedFriends on unmount anymore
    // because we handle cleanup properly above
  }, [friendsMap]);

  // ============================================
  // MAP INITIALIZATION
  // ============================================
  const initializeMap = async () => {
    const startTime = Date.now();
    console.log('🗺️ Starting map initialization...');

    const locationService = LocationService.getInstance();
    locationServiceRef.current = locationService;

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
      console.log(`✅ Auth complete (${Date.now() - startTime}ms)`);

      // STEP 2: Check user's location sharing PREFERENCE from DB
      const userData = await dataService.getUser(user.userId);
      const shouldShareLocation = userData?.isLocationSharing ?? true;

      // STEP 3: Permission check
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
      console.log(`✅ Permissions granted (${Date.now() - startTime}ms)`);

      // STEP 4: Get initial location with multiple fallback strategies
      setLoadingStep('location');
      let initialLocation = await locationService.getFastLocation();

      // If getFastLocation fails, try getting current position directly
      if (!initialLocation) {
        console.log('⚠️ Fast location failed, trying direct getCurrentPosition...');
        try {
          const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });

          if (location) {
            initialLocation = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy: location.coords.accuracy,
            };
            console.log('✅ Got location from getCurrentPosition');
          }
        } catch (err) {
          console.error('❌ getCurrentPosition also failed:', err);
        }
      }

      // If we got a location, use it
      if (initialLocation) {
        console.log(`✅ Got initial location in ${Date.now() - startTime}ms`);

        // ✅ Set animated coordinate (no animation for first position)
        userAnimatedCoordinate.setValue({
          latitude: initialLocation.latitude,
          longitude: initialLocation.longitude,
          latitudeDelta: 0,
          longitudeDelta: 0,
        });
        currentUserPosition.current = {
          latitude: initialLocation.latitude,
          longitude: initialLocation.longitude,
        };
        setHasUserLocation(true);

        setRegion({
          latitude: initialLocation.latitude,
          longitude: initialLocation.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });

        if (initialLocation.accuracy != null && initialLocation.accuracy < GOOD_ACCURACY_THRESHOLD) {
          setLocationAccuracy('high');
        }
      } else {
        console.log('⚠️ Could not get initial location, showing default region');
        // Show map anyway, tracking will update location when available
      }

      // STEP 5: Show map
      setLoadingStep('tracking');
      await new Promise(resolve => setTimeout(resolve, 200));

      setLoadingStep('done');
      setLoading(false);
      console.log(`✅ Map ready in ${Date.now() - startTime}ms`);

      // STEP 6: Start tracking ONLY if user has location sharing enabled
      if (shouldShareLocation) {
        startTracking(user.userId);
      } else {
        console.log('📍 Location sharing disabled by user preference');
      }

    } catch (error) {
      console.error('Error initializing map:', error);
      setLoading(false);
    }
  };


  // ============================================
  // TRACKING (with animated user marker)
  // ============================================
  const startTracking = (userId: string) => {
    const locationService = LocationService.getInstance();

    locationService.startLocationTracking(userId, (location: LocationUpdate) => {
      // ✅ FIX: Animate user marker smoothly instead of jumping
      animateMarker(userAnimatedCoordinate, {
        latitude: location.latitude,
        longitude: location.longitude,
      }, USER_ANIMATION_DURATION);

      // Store current position for centerOnUser
      currentUserPosition.current = {
        latitude: location.latitude,
        longitude: location.longitude,
      };

      setHasUserLocation(true);

      // Update accuracy indicator
      if (location.accuracy != null && location.accuracy < GOOD_ACCURACY_THRESHOLD) {
        setLocationAccuracy('high');
      }
    }).catch(err => {
      console.error('Location tracking error:', err);
    });
  };

  // ============================================
  // SEARCH & NAVIGATION
  // ============================================
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
    if (currentUserPosition.current && mapRef.current) {
      const newRegion = {
        latitude: currentUserPosition.current.latitude,
        longitude: currentUserPosition.current.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      mapRef.current.animateToRegion(newRegion, 1000);
    }
  };

  // ============================================
  // LOADING SCREEN
  // ============================================
  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.primary }]}>
          {LOADING_MESSAGES[loadingStep]}
        </Text>
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
                  { backgroundColor: '#ccc' },
                  isComplete && { backgroundColor: theme.primary },
                  isCurrent && { backgroundColor: '#4CAF50' },
                ]}
              />
            );
          })}
        </View>
      </View>
    );
  }

  // ============================================
  // MAP VIEW
  // ============================================
  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, { backgroundColor: theme.searchBg }]}>
          <TextInput
            style={[styles.searchInput, { color: theme.searchText }]}
            placeholder="Search friend..."
            placeholderTextColor={theme.searchPlaceholder}
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={searchFriend}
          />
          <Ionicons name="search" size={width * 0.05} color={theme.accent} />
        </View>
        <WebSocketIndicator />
      </View>

      {/* Map */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={region}
        showsUserLocation={false}
      >
        {/* ✅ FIX: User Marker - Now Animated */}
        {hasUserLocation && (
          <UserMarker
            coordinate={userAnimatedCoordinate}
            locationAccuracy={locationAccuracy}
            theme={theme}
          />
        )}

        {/* Friend Markers */}
        {Array.from(friendsMap.values()).map(friend => {
          if (!friend.isLocationSharing || friend.latitude == null || friend.longitude == null) {
            return null;
          }

          const anim = animatedFriends.get(friend.id);
          if (!anim) return null;

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

      {/* Center on User Button */}
      <TouchableOpacity
        style={[styles.centerButton, { backgroundColor: theme.buttonBg }]}
        onPress={centerOnUser}
      >
        <Ionicons name="locate" size={width * 0.06} color={theme.primary} />
      </TouchableOpacity>

      {/* Refresh Button */}
      <TouchableOpacity
        style={[styles.refreshButton, { backgroundColor: theme.buttonBg }]}
        onPress={async () => {
          await forceReload();
          console.log('🔄 Manual refresh triggered');
        }}
      >
        <Ionicons name="refresh" size={width * 0.06} color={theme.primary} />
      </TouchableOpacity>

      {/* Status Bar */}
      <View style={[styles.statusBar, { backgroundColor: theme.statusBar }]}>
        <Text style={[styles.statusText, { color: theme.statusText }]}>
          {friendsArray.length} friend{friendsArray.length !== 1 ? 's' : ''} online
        </Text>
        {locationAccuracy === 'low' && (
          <View style={{ flexDirection: 'row', marginTop: width * 0.01, alignItems: 'center' }}>
            <Text style={[styles.statusSubtext, { color: '#FFA500' }]}>
              Improving Accuracy...
            </Text>
          </View>
        )}
        {locationAccuracy === 'high' && friendsArray.length > 0 && (
          <View style={{ flexDirection: 'row', marginTop: width * 0.01, alignItems: 'center' }}>
            <Text style={[styles.statusSubtext, { color: '#90EE90' }]}>
              Real-Time Tracking
            </Text>
          </View>
        )}
      </View>

      {/* Modal */}
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
    paddingHorizontal: width * 0.033,
    paddingVertical: width * 0.018,
    borderRadius: width * 0.045,
  },
  statusText: {
    fontSize: width * 0.031,
  },
  statusSubtext: {
    fontSize: width * 0.022,
    marginTop: width * 0.0045,
  },
  userMarker: {
    width: width * 0.07,
    height: width * 0.07,
    borderRadius: width * 0.035,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMarkerInner: {
    width: width * 0.03,
    height: width * 0.03,
    borderRadius: width * 0.015,
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