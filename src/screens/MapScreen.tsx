// src/screens/MapScreen.tsx - FULLY FIXED VERSION
//
// FIXES APPLIED:
// 1. ✅ User marker is now ANIMATED (no more snappy jumping)
// 2. ✅ Stale friend entries cleaned up when friends are removed
// 3. ✅ Proper cleanup of animated coordinates
// 4. ✅ User preference respected for location sharing
// 5. ✅ Dark/light theme support for map and tab bar

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  AppState,
  Linking,
  Platform
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, AnimatedRegion } from 'react-native-maps';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { LocationService, LocationUpdate } from '../services/locationService';
import { WebSocketService } from '../services/websocketService';
import { authService } from '../services/authService';
import { dataService } from '../services/dataService';
import { FriendLocationPollingService } from '@/services/friendLocationPollingServices';
import { useSubscriptions } from '../contexts/SubscriptionContext';
import { Ionicons } from '@expo/vector-icons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';

import Feather from '@expo/vector-icons/Feather';

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
  accent: '#9420ceff',
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
const FriendMarker = ({ friend, coordinate, color, reloadVersion }: any) => {
  // Load once and keep it for friend pfps
  const tracksViewChangesRef = useRef(true);
  const hasLoadedRef = useRef(false);

  const onImageLoad = useCallback(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      tracksViewChangesRef.current = false;  // ✅ Changes value without re-render!
      console.log(`✅ Image loaded for ${friend.username}, stopped tracking changes`);
    }
  }, [friend.username]);

  // Render friend marker pfp when force reloaded
  useEffect(() => {
    hasLoadedRef.current = false;
    tracksViewChangesRef.current = true;
  }, [reloadVersion]);

  // Reset tracking only when avatar URL actually changes (e.g. user updates profile pic)
  useEffect(() => {
    if (friend.avatarUrl && !hasLoadedRef.current) {
      console.log(`🖼️ Loading avatar for ${friend.username}`);
      tracksViewChangesRef.current = true;
    }
  }, [friend.avatarUrl, friend.username]);

  return (
    <Marker.Animated
      coordinate={coordinate as any}
      title={friend.username}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksViewChangesRef.current}
      zIndex={1}
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
const UserMarker = React.memo(({
  coordinate,
  locationAccuracy,
  theme
}: {
  coordinate: AnimatedRegion;
  locationAccuracy: 'low' | 'high';
  theme: typeof COLORS;
}) => {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  // Stop tracking after initial render
  useEffect(() => {
    const timer = setTimeout(() => {
      setTracksViewChanges(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // Re-enable tracking when accuracy changes, then disable again
  useEffect(() => {
    setTracksViewChanges(true);
    const timer = setTimeout(() => {
      setTracksViewChanges(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [locationAccuracy]);

  return (
    <Marker.Animated
      coordinate={coordinate as any}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksViewChanges}
      zIndex={1000}
    >
      <View style={[styles.userMarker, { backgroundColor: theme.userMarkerBg }]}>
        <View style={[
          styles.userMarkerInner,
          { backgroundColor: locationAccuracy === 'low' ? theme.lowAccuracyColor : theme.highAccuracyColor }
        ]} />
      </View>
    </Marker.Animated>
  );
}, (prevProps, nextProps) => {
  // Only re-render if accuracy changes (theme changes don't matter visually)
  return prevProps.locationAccuracy === nextProps.locationAccuracy;
});

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
  latitude: 47.6062,
  longitude: -122.3321,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const GOOD_ACCURACY_THRESHOLD = 25;

// Animation duration for smooth marker movement
const USER_ANIMATION_DURATION = 5000;
const FRIEND_MIN_ANIMATION_DURATION = 5000;
const FRIEND_MAX_ANIMATION_DURATION = 30000;

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
  const [isFollowMode, setIsFollowMode] = useState(true); // Default to Follow Mode
  const [isLocationSharing, setIsLocationSharing] = useState(false); // From DB
  const [permissionDenied, setPermissionDenied] = useState(false); // Block map if no permissions
  const [showModal, setShowModal] = useState(false);
  const [modalStats, setModalStats] = useState({
    type: 'error' as 'error' | 'success' | 'confirm',
    title: '',
    message: ''
  });
  const [reloadVersion, setReloadVersion] = useState(0);

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
      // Stop foreground tracking when MapScreen unmounts
      const locationService = LocationService.getInstance();
      locationService.stopForegroundTracking();
    };
  }, []);

  // ============================================
  // Polling based location fetching service
  // ============================================
  useEffect(() => {
    // Only start polling when map is loaded
    if (loading) {
      console.log('⏳ Waiting for map initialization before starting polling');
      return;
    }

    const pollingService = FriendLocationPollingService.getInstance();

    console.log('🔄 Starting friend location polling (3s interval)');

    pollingService.startPolling(
      // Callback that returns current friends from SubscriptionContext
      // This is MUCH better than fetching from database!
      () => Array.from(friendsMap.values()).map(friend => ({
        ...friend,
        isLocationSharing: friend.isLocationSharing ?? false,
      })),

      // Callback when locations update
      (friendLocations) => {
        // Update each friend's animated marker with new location
        friendLocations.forEach(friendLoc => {
          // Get the existing animated entry for this friend
          const existingEntry = animatedFriends.get(friendLoc.id);

          if (existingEntry) {
            const now = Date.now();
            const duration = Math.min(
              FRIEND_MAX_ANIMATION_DURATION,
              Math.max(FRIEND_MIN_ANIMATION_DURATION, (now - existingEntry.lastTime))
            );

            // Update timestamp
            existingEntry.lastTime = now;

            // Animate to new position
            animateMarker(existingEntry.coordinate, {
              latitude: friendLoc.latitude,
              longitude: friendLoc.longitude,
            }, duration);

            console.log(`📍 Updated ${friendLoc.username || friendLoc.id} location via polling`);
          } else {
            console.log(`⚠️ No animated entry for ${friendLoc.id}, will be created on next friendsMap update`);
          }
        });
      },
      3000 // Poll every 3 seconds
    );

    // Cleanup: stop polling when component unmounts
    return () => {
      console.log('🛑 Stopping friend location polling');
      pollingService.stopPolling();
    };
  }, [loading, friendsMap]);

  // ============================================
  // APPSTATE LISTENER - CROSS-PLATFORM
  // ============================================
  useEffect(() => {
    console.log('🔧 ========================================');
    console.log('🔧 AppState listener MOUNTING');
    console.log('🔧 Initial state:', AppState.currentState);
    console.log('🔧 userIdRef:', userIdRef.current);
    console.log('🔧 ========================================');

    if (!userIdRef.current) {
      console.log('⚠️ No userIdRef, skipping listener');
      return;
    }

    let transitionInProgress = false;
    let lastState = AppState.currentState;
    let backgroundTrackingStarted = false; // Track if we already started background

    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      console.log('🔔 AppState:', lastState, '→', nextAppState);

      if (transitionInProgress) {
        console.log('⚠️ Transition in progress, queuing...');
        return;
      }

      const locationService = LocationService.getInstance();
      const wsService = WebSocketService.getInstance();

      try {
        // ============================================
        // FOREGROUND (background/inactive → active)
        // ============================================
        if (nextAppState === 'active' && lastState !== 'active') {
          transitionInProgress = true;
          backgroundTrackingStarted = false; // Reset flag

          console.log('📱 ========================================');
          console.log('📱 FOREGROUND TRANSITION');
          console.log('📱 ========================================');

          // Stop background tracking
          console.log('🛑 Stopping background tracking...');
          await locationService.stopBackgroundTracking();
          console.log('✅ Background stopped');

          // Reconnect WebSocket
          console.log('🔵 Reconnecting WebSocket...');
          if (!wsService.isConnected()) {
            await wsService.connect(userIdRef.current!);
            console.log('✅ WebSocket connected');
          }

          // Start foreground tracking
          if (!locationService.isForegroundTracking()) {
            console.log('🚀 Starting foreground tracking...');
            await startForegroundTracking(userIdRef.current!, isLocationSharing);
            console.log('✅ Foreground started');
          }

          console.log('📱 FOREGROUND COMPLETE ✅');
          transitionInProgress = false;

        // ============================================
        // INACTIVE (active → inactive)
        // iOS uses this, Android skips it
        // ============================================
        } else if (nextAppState === 'inactive' && lastState === 'active') {
          console.log('📱 App going INACTIVE (iOS flow)');

          // Start background tracking during inactive (iOS requirement)
          if (isLocationSharing && userIdRef.current && !backgroundTrackingStarted) {
            transitionInProgress = true;

            console.log('🔵 Starting background tracking (iOS: during inactive)...');
            try {
              await locationService.startBackgroundTracking(userIdRef.current, isLocationSharing);
              backgroundTrackingStarted = true;
              console.log('✅ Background started');
            } catch (error: any) {
              setModalStats({
                type: 'error',
                title: 'Background Initialization Failure',
                message: error.message || 'An error has occured during background initialization'
              });
              setShowModal(true);
              console.log('❌ Background start failed:', error);
            }

            transitionInProgress = false;
          }

        // ============================================
        // BACKGROUND (inactive → background OR active → background)
        // ============================================
        } else if (nextAppState === 'background') {

          if (lastState === 'inactive') {
            // iOS flow: inactive → background
            console.log('📱 Now BACKGROUND (iOS: after inactive)');

            // Background already started in inactive, just cleanup
            console.log('🔴 Disconnecting WebSocket...');
            wsService.disconnect();

            console.log('🛑 Stopping foreground tracking...');
            await locationService.stopForegroundTracking();

            console.log('📱 BACKGROUND COMPLETE ✅');

          } else if (lastState === 'active') {
            // Android flow: active → background (skipped inactive!)
            transitionInProgress = true;

            console.log('📱 ========================================');
            console.log('📱 BACKGROUND TRANSITION (Android: no inactive)');
            console.log('📱 ========================================');

            // Disconnect WebSocket first
            console.log('🔴 Disconnecting WebSocket...');
            wsService.disconnect();
            console.log('✅ WebSocket disconnected');

            // Stop foreground tracking
            console.log('🛑 Stopping foreground tracking...');
            await locationService.stopForegroundTracking();
            console.log('✅ Foreground stopped');

            // Try to start background (may fail on Android 12+)
            if (isLocationSharing && userIdRef.current && !backgroundTrackingStarted) {
              console.log('🔵 Attempting background tracking (Android)...');

              try {
                await locationService.startBackgroundTracking(userIdRef.current, isLocationSharing);
                backgroundTrackingStarted = true;
                console.log('✅ Background started');
              } catch (error) {
                console.error('❌ Background failed (Android 12+ restriction):', error);
                console.log('💡 Will work on next foreground → background cycle');
              }
            }

            console.log('📱 BACKGROUND COMPLETE ✅');
            transitionInProgress = false;
          }
        }

      } catch (error: any) {
        setModalStats({
          type: 'error',
          title: 'Transition Phase Error',
          message: error.message || 'An error has occured during transition'
        });
        setShowModal(true);
        console.log('❌ Transition error:', error);
      } finally {
        lastState = nextAppState;
      }
    });

    console.log('✅ AppState listener registered');

    return () => {
      console.log('🔧 AppState listener unmounting');
      subscription.remove();
    };
  }, [isLocationSharing]);


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
        Math.max(FRIEND_MIN_ANIMATION_DURATION, (now - curFriendEntry.lastTime))
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

  const openLocationSettings = async () => {
    try {
      await Linking.openSettings();
    } catch (error: any) {
      setModalStats({
        type: 'error',
        title: 'Settings Error',
        message: error.message || 'An error(s) has occured while attempting to open settings'
      });
      setShowModal(true)
      console.log('Error opening settings:', error);
    }
  };

  const requestNotificationPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      try {
        const { PermissionsAndroid } = require('react-native');
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          {
            title: 'Notification Permission',
            message: 'LocationLink requires notification permission to notify you of important transitions.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );

        const isGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
        console.log(isGranted ? '✅ Notification permission granted' : '⚠️ Notification permission denied');
        return isGranted;
      } catch (err) {
        console.warn('Error requesting notification permission:', err);
        return false;
      }
    }
    return true; // iOS/older Android don't need explicit permission
  };


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
        console.log('No user found');
        setLoading(false);
        router.replace('/signin');
        return;
      }
      userIdRef.current = user.userId;
      console.log(`✅ Auth complete (${Date.now() - startTime}ms)`);

      // STEP 2: Check user's location sharing PREFERENCE from DB
      const userData = await dataService.getUser(user.userId);
      const shouldShareLocation = userData?.isLocationSharing ?? true;

      // STEP 3: Permission check
      setLoadingStep('permissions');

      // CHeck to see if we already have an existing permissions


      const curForeGroundPerm = (await Location.getForegroundPermissionsAsync()).status;

      if (curForeGroundPerm !== 'granted') {
        const foreResponse = await Location.requestForegroundPermissionsAsync();
        if (foreResponse.status !== 'granted') {
          console.log('⚠️ Foreground Location permission not granted');
          setPermissionDenied(true);
          setModalStats({
            type: 'error',
            title: 'Location Permission Required',
            message: 'LocationLink requires foreground permission, Tap "Open Settings" to enable permissions.',
          });
          setShowModal(true);
          setLoading(false);
          return;
        }
      }

      // Check if background permission already exists
      const curBackGroundPerm = (await Location.getBackgroundPermissionsAsync()).status;

      // STEP 3.5: Ask Background Permission
      if (curBackGroundPerm !== 'granted') {
        const backResponse = await Location.requestBackgroundPermissionsAsync();
        if (backResponse.status !== 'granted') {
          console.log('⚠️ Background Location permission not granted');
          setPermissionDenied(true);
          setModalStats({
            type: 'error',
            title: 'Location Permission Required',
            message: 'LocationLink requires background permission. Tap "Open Settings" to enable permissions.',
          });
          setShowModal(true);
          setLoading(false);
          return;
        }
      }

      // After location permissions are granted
      console.log(`✅ Permissions granted (${Date.now() - startTime}ms)`);

      // ✅ Request notification permission (Android 13+)
      await requestNotificationPermission();


      setIsLocationSharing(shouldShareLocation);

      console.log(`✅ Permissions granted (${Date.now() - startTime}ms)`);

      // Ask for notification permissions
      const { status: notifStatus } = await Location.getForegroundPermissionsAsync();
      if (notifStatus !== 'granted') {
        await Location.requestForegroundPermissionsAsync();
      }

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
        } catch (error : any) {
          setModalStats({
            type: 'error',
            title: 'Location Service Error',
            message: error.message || "An error(s) has occured while attempting to fetch your location"
          });
          setShowModal(true);
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
      // STEP 6: Start foreground tracking (always runs for UI, conditionally writes to DB)
      setLoadingStep('tracking');
      await startForegroundTracking(user.userId, shouldShareLocation);
      await new Promise(resolve => setTimeout(resolve, 200));


    } catch (error: any) {
      setModalStats({
        type: 'error',
        title: 'Initialization Failure',
        message: error.message || 'An error has occured during Map initialization'
      });
      setShowModal(true);
      console.log('Error initializing map:', error);
      setLoading(false);
    }
  };


  // ============================================
  // TRACKING (with animated user marker)
  // ============================================
  const startForegroundTracking = async (userId: string, shouldShareLocation: boolean) => {
    const locationService = LocationService.getInstance();

    try {
      await locationService.startForegroundTracking((location) => {
        // 1. Always update UI (animate marker)
        animateMarker(userAnimatedCoordinate, {
          latitude: location.latitude,
          longitude: location.longitude,
        }, USER_ANIMATION_DURATION);

        currentUserPosition.current = {
          latitude: location.latitude,
          longitude: location.longitude,
        };

        setHasUserLocation(true);

        // Update accuracy indicator
        if (location.accuracy != null && location.accuracy < GOOD_ACCURACY_THRESHOLD) {
          setLocationAccuracy('high');
        } else if (locationService.hasUpgradedAccuracy()) {
          setLocationAccuracy('high');
        }

        // 2. Conditionally animate camera if in Follow Mode
        if (isFollowMode && mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }, 500);
        }

        // 3. Conditionally write to DB based on isLocationSharing
        if (shouldShareLocation) {
          updateLocationInDB(userId, location);
        }
      });
    } catch (error: any) {
      setModalStats({
        type: 'error',
        title: 'Location Tracking Failure',
        message: error.message || 'An error(s) has occured while attempting foreground tracking'
      });
      setShowModal(true);
      console.log('Error starting foreground tracking:', error);
    }
  };

  const updateLocationInDB = async (userId: string, location: LocationUpdate) => {
    try {
      await dataService.updateUserWithRetry(userId, {
        latitude: location.latitude,
        longitude: location.longitude,
        locationUpdatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      setModalStats({
        type: 'error',
        title: 'Update Failure',
        message: error.message || 'An error(s) has occured while attempting to update location'
      });
      setShowModal(true);
      console.log('❌ Failed to update location after retries:', error);
      // Silent fail - don't crash app
    }
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

  // User Focus Panning Detection
  const onMapPanDrag = () => {
    if (isFollowMode) {
      console.log('🗺️ User panned map - exiting Follow Mode');
      setIsFollowMode(false);
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

  // If permissions denied, show empty screen with persistent modal
  if (permissionDenied) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.background }]}>
        <Ionicons name='location' size={width * 0.2} color="#ccc" />
        <Text style={[styles.emptyText, { color: '#999', marginTop: width * 0.05 }]}>
          LocationLink App Requires Both Foreground and Background Location Permissions!
        </Text>
        <CustomModal
          visible={showModal}
          title={modalStats.title}
          message={modalStats.message}
          type={modalStats.type}
          actionButtonText="Open Settings"
          onAction={openLocationSettings}
          onClose={() => {}} // Don't allow closing
        />
      </View>
    );
  }


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
          <FontAwesome5 name="search-location" size={width * 0.05} color={theme.accent} />
        </View>
        <WebSocketIndicator />
      </View>

      {/* Map */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={region}
        onPanDrag={onMapPanDrag}
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
              reloadVersion={reloadVersion}
            />
          );
        })}
      </MapView>


      {/* Center on User Button */}
      <TouchableOpacity
        style={[styles.centerButton, { backgroundColor: theme.buttonBg }]}
        onPress={centerOnUser}
      >
        <Ionicons name="locate-sharp" size={width * 0.06} color={theme.primary} />
      </TouchableOpacity>

      {/* ADD Follow Me button (place it with your other buttons): */}
      {!isFollowMode && hasUserLocation && (
        <TouchableOpacity
          style={[styles.followButton, { backgroundColor: theme.buttonBg }]}
          onPress={() => {
            setIsFollowMode(true);
            centerOnUser(); // Recenter + enable following
          }}
        >
          <Ionicons name="navigate" size={width * 0.06} color={theme.primary} />
        </TouchableOpacity>
      )}


      {/* Refresh Button */}
      <TouchableOpacity
        style={[styles.refreshButton, { backgroundColor: theme.buttonBg }]}
        onPress={async () => {
          await forceReload();
          setReloadVersion(prev => prev + 1); // Trigger any dependent effects
          console.log('🔄 Manual refresh triggered');
        }}
      >
        <Feather name="refresh-ccw" size={width * 0.06} color={theme.primary} />
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

      {/* Custom Modal */}
      <CustomModal
        visible={showModal}
        title={modalStats.title}
        message={modalStats.message}
        type={modalStats.type}
        actionButtonText={permissionDenied ? "Open Settings" : undefined}
        onAction={permissionDenied ? openLocationSettings : undefined}
        onClose={() => {
          if (!permissionDenied) {
            setShowModal(false);
          }
          // Don't close if permissions denied - keep modal persistent
        }}
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
    bottom: width * 0.325,
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
  followButton: {
    position: 'absolute',
    right: width * 0.033,
    bottom: width * 0.475, // Between recenter and refresh
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
  emptyText: {
    fontSize: width * 0.04,
    color: '#999',
    textAlign: 'center',
  },
  refreshButton: {
    position: 'absolute',
    right: width * 0.033,
    bottom: width * 0.175,
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
    borderColor: '#9420ceff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: width * 0.0045,
    overflow: 'hidden',
  },
  friendMarkerText: {
    color: 'white',
    fontSize: width * 0.027,
    fontWeight: 'bold',
  },
});