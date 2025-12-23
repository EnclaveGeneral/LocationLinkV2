// src/screens/MapScreen.tsx - FIXED VERSION
//
// FIXES APPLIED:
// 1. REMOVED dark/light theme - back to original colors
// 2. Properly reads user's isLocationSharing preference from DB
// 3. Only starts tracking if user has enabled location sharing

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
  Easing,
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
// ORIGINAL COLORS (no dark/light theme)
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
}

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

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState<LoadingStep>('auth');
  const [searchText, setSearchText] = useState('');
  const [locationAccuracy, setLocationAccuracy] = useState<'low' | 'high'>('low');
  const animatedFriends = useRef(new Map()).current;
  const { friendsMap, forceReload } = useSubscriptions();
  const [showModal, setShowModal] = useState(false);
  const [modalStats, setModalStats] = useState({
    type: 'error' as 'error' | 'success' | 'confirm',
    title: '',
    message: ''
  });

  const userIdRef = useRef<string | null>(null);
  const locationServiceRef = useRef<LocationService | null>(null);

  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? DARK_THEME : COLORS;

  useEffect(() => {
    initializeMap();

    return () => {
      // Cleanup handled by LocationService singleton
    };
  }, []);

  const friendsArray = useMemo(() => {
    return Array.from(friendsMap.values()).filter(
      f => f.isLocationSharing && f.latitude != null && f.longitude != null
    );
  }, [friendsMap]);

  // Animate friend markers
  useEffect(() => {
    friendsMap.forEach(friend => {
      if (!friend.isLocationSharing || friend.latitude == null || friend.longitude == null) {
        animatedFriends.delete(friend.id);
        return;
      }

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

      const curFriendEntry = animatedFriends.get(friend.id);
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

  // ============================================
  // INITIALIZATION
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

      // STEP 4: Get initial location FAST
      setLoadingStep('location');
      const initialLocation = await locationService.getFastLocation();

      if (initialLocation) {
        console.log(`✅ Got initial location in ${Date.now() - startTime}ms`);
        setUserLocation({
          latitude: initialLocation.latitude,
          longitude: initialLocation.longitude,
        });
        setRegion({
          latitude: initialLocation.latitude,
          longitude: initialLocation.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });

        if (initialLocation.accuracy != null && initialLocation.accuracy < GOOD_ACCURACY_THRESHOLD) {
          setLocationAccuracy('high');
        }
      }

      // STEP 5: Show map
      setLoadingStep('tracking');
      await new Promise(resolve => setTimeout(resolve, 200));

      setLoadingStep('done');
      setLoading(false);
      console.log(`✅ Map ready in ${Date.now() - startTime}ms`);

      // STEP 6: Start tracking ONLY if user has location sharing enabled (their preference)
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
  // TRACKING
  // ============================================
  const startTracking = (userId: string) => {
    const locationService = LocationService.getInstance();

    locationService.startLocationTracking(userId, (location: LocationUpdate) => {
      setUserLocation({
        latitude: location.latitude,
        longitude: location.longitude,
      });

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
    if (userLocation && mapRef.current) {
      const newRegion = {
        ...userLocation,
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
        {/* User Marker */}
        {userLocation && (
          <Marker
            coordinate={userLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={[styles.userMarker, { backgroundColor: theme.userMarkerBg }]}>
              <View style={[
                styles.userMarkerInner,
                { backgroundColor: locationAccuracy === 'low' ? theme.lowAccuracyColor : theme.highAccuracyColor }
              ]} />
            </View>
          </Marker>
        )}

        {/* Friend Markers */}
        {Array.from(friendsMap.values()).map(friend => {
          if (!friend.isLocationSharing || friend.latitude == null || friend.longitude == null) {
            return null;
          }

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
          <View style={{flexDirection: 'row', marginTop: width * 0.01, alignItems: 'center'}}>
            <Text style={[styles.statusSubtext, {color: "#FFA500"}]}>
              Improving Accuracy...
            </Text>
          </View>
        )}
        {locationAccuracy === 'high' && friendsArray.length > 0 && (
          <View style={{flexDirection: 'row', marginTop: width * 0.01, alignItems: 'center'}}>
            <Text style={[styles.statusSubtext, {color: "#90EE90" }]}>
              Real =Time Tracking
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