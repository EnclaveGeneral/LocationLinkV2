// src/services/locationService.ts - COMPLETELY REFACTORED
//
// NEW ARCHITECTURE:
// 1. LocationService ONLY handles GPS tracking - no DB writes, no isLocationSharing logic
// 2. MapScreen/ProfileScreen handle DB updates conditionally based on isLocationSharing
// 3. AppState management for proper foreground/background transitions
// 4. Use Balanced accuracy everywhere (no High accuracy needed)
// 5. Progressive enhancement: Low → Balanced

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

const BACKGROUND_LOCATION_TASK = 'background-location-task';

// Constants
const ACCURACY_THRESHOLD = 50; // Threshold to upgrade from Low to Balanced
const FOREGROUND_TIME_INTERVAL = 5000; // 5 seconds
const FOREGROUND_DISTANCE_INTERVAL = 10; // 10 meters
const BACKGROUND_TIME_INTERVAL = 30000; // 30 seconds
const BACKGROUND_DISTANCE_INTERVAL = 50; // 50 meters

// Location data passed to callbacks
export interface LocationUpdate {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

// Background task callback type
type BackgroundTaskCallback = (location: LocationUpdate) => Promise<void>;

// Track app state globally for background task
let appState = AppState.currentState;
AppState.addEventListener('change', nextState => {
  appState = nextState;
});

// Background task - defined outside class
// This is registered globally and persists across service resets
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('❌ Background location error:', error);
    return;
  }

  if (!data) return;

  // Don't process if app is actually in foreground
  if (appState === 'active') {
    return;
  }

  const { locations } = data as { locations: Location.LocationObject[] };
  const location = locations[0];
  if (!location) return;

  const userId = await AsyncStorage.getItem('currentUserId');
  if (!userId) {
    console.warn('⚠️ Background task: missing userId');
    return;
  }

  // Check if user has location sharing enabled
  const isLocationSharingStr = await AsyncStorage.getItem('isLocationSharing');
  const isLocationSharing = isLocationSharingStr === 'true';

  if (!isLocationSharing) {
    console.log('⚠️ Background task: location sharing disabled, skipping DB update');
    return;
  }

  const coords = {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };

  try {
    // Import dataService dynamically to avoid circular dependencies
    const { dataService } = require('./dataService');

    // Write to DB with retry logic
    await dataService.updateUserWithRetry(userId, {
      latitude: coords.latitude,
      longitude: coords.longitude,
      locationUpdatedAt: new Date().toISOString(),
    });

    // Cache location for next app launch
    await AsyncStorage.setItem('lastLocation', JSON.stringify(coords));

    console.log('📍 Background location updated to DB');
  } catch (error) {
    console.error('❌ Background DB update failed after retries:', error);
    // Silent fail - don't crash the background task
  }
});

export class LocationService {
  private static instance: LocationService;
  private locationSubscription: Location.LocationSubscription | null = null;
  private isTracking = false;
  private hasUpgradedToBalanced = false;
  private onLocationUpdate: ((location: LocationUpdate) => void) | null = null;

  static getInstance(): LocationService {
    if (!LocationService.instance) {
      LocationService.instance = new LocationService();
    }
    return LocationService.instance;
  }

  static resetInstance(): void {
    if (LocationService.instance) {
      LocationService.instance.stopForegroundTracking();
    }
    LocationService.instance = new LocationService();
  }

  // ============================================
  // FAST INITIAL LOCATION (for map centering)
  // ============================================
  async getFastLocation(): Promise<LocationUpdate | null> {
    try {
      // Strategy 1: Cached location (instant!)
      const cachedStr = await AsyncStorage.getItem('lastLocation');
      if (cachedStr) {
        const cached = JSON.parse(cachedStr);
        console.log('📍 Using cached location');
        return { ...cached, accuracy: null };
      }

      // Strategy 2: Last known position (very fast)
      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 10 * 60 * 1000, // 10 minutes
      });

      if (lastKnown) {
        console.log('📍 Using last known position');
        const coords = {
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
          accuracy: lastKnown.coords.accuracy,
        };
        await AsyncStorage.setItem('lastLocation', JSON.stringify({
          latitude: coords.latitude,
          longitude: coords.longitude,
        }));
        return coords;
      }

      // Strategy 3: Low accuracy with timeout (3 second max wait)
      console.log('📍 Getting low-accuracy location...');
      const location = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
      ]);

      if (location && 'coords' in location) {
        console.log('✅ Got low-accuracy location');
        const coords = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
        };
        await AsyncStorage.setItem('lastLocation', JSON.stringify({
          latitude: coords.latitude,
          longitude: coords.longitude,
        }));
        return coords;
      }

      console.log('⚠️ Could not get fast location');
      return null;
    } catch (error) {
      console.error('❌ Error getting fast location:', error);
      return null;
    }
  }

  // ============================================
  // FOREGROUND TRACKING
  // ============================================
  async startForegroundTracking(
    onLocationUpdate: (location: LocationUpdate) => void
  ): Promise<void> {
    if (this.isTracking) {
      console.log('⚠️ Foreground tracking already active');
      return;
    }

    // Request permissions
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Location permission not granted');
    }

    // Store callback
    this.onLocationUpdate = onLocationUpdate;
    this.isTracking = true;
    this.hasUpgradedToBalanced = false;

    // Start with LOW accuracy - fast GPS lock, battery friendly
    console.log('🚀 Starting LOW accuracy foreground tracking...');
    this.locationSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Low,
        timeInterval: 2000, // 2 seconds during cold start
        distanceInterval: 5, // 5 meters
      },
      (location) => this.handleLocationUpdate(location)
    );

    console.log('✅ Foreground tracking started (LOW accuracy)');
  }

  // Handle location updates and upgrade to Balanced when ready
  private async handleLocationUpdate(location: Location.LocationObject): Promise<void> {
    const coords: LocationUpdate = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
    };

    // Notify callback (MapScreen will update UI)
    this.onLocationUpdate?.(coords);

    // Cache location
    await AsyncStorage.setItem('lastLocation', JSON.stringify({
      latitude: coords.latitude,
      longitude: coords.longitude,
    }));

    // Check if we should upgrade to Balanced accuracy
    if (!this.hasUpgradedToBalanced &&
        coords.accuracy != null &&
        coords.accuracy > 0 &&
        coords.accuracy < ACCURACY_THRESHOLD) {
      console.log(`🎯 Good GPS fix (${coords.accuracy.toFixed(1)}m) - upgrading to BALANCED`);
      await this.upgradeToBalanced();
    }
  }

  // Upgrade to Balanced accuracy (final accuracy level - no High needed)
  private async upgradeToBalanced(): Promise<void> {
    const perms = await Location.getForegroundPermissionsAsync();
    if (!perms.granted) {
      console.log('⚠️ Cannot upgrade accuracy — permission revoked');
      return;
    }

    this.hasUpgradedToBalanced = true;

    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
    }

    this.locationSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: FOREGROUND_TIME_INTERVAL, // 5 seconds
        distanceInterval: FOREGROUND_DISTANCE_INTERVAL, // 10 meters
      },
      (location) => this.handleLocationUpdate(location)
    );

    console.log('✅ Upgraded to BALANCED accuracy tracking');
  }

  // Stop foreground tracking (doesn't affect background task)
  async stopForegroundTracking(): Promise<void> {
    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
    }

    this.isTracking = false;
    this.hasUpgradedToBalanced = false;
    this.onLocationUpdate = null;

    console.log('🛑 Foreground tracking stopped');
  }

  // ============================================
  // BACKGROUND TRACKING
  // ============================================
  async startBackgroundTracking(userId: string, isLocationSharing: boolean): Promise<void> {
    try {
      if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
        console.log('⚠️ Background task not defined');
        return;
      }

      const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (hasStarted) {
        console.log('📍 Background tracking already running');
        return;
      }

      const { status } = await Location.getBackgroundPermissionsAsync();
      if (status !== 'granted') {
        // Try requesting it again
        const { status } = await Location.requestBackgroundPermissionsAsync();
        if (status != 'granted') {
          console.log('⚠️ Background location permission not granted');
          return;
        }
      }

      // Store userId and isLocationSharing for background task
      await AsyncStorage.setItem('currentUserId', userId);
      await AsyncStorage.setItem('isLocationSharing', isLocationSharing.toString());

      try {
        // Try with foreground service (shows notification)
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: BACKGROUND_TIME_INTERVAL,
          distanceInterval: BACKGROUND_DISTANCE_INTERVAL,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'LocationLink',
            notificationBody: 'Sharing your location with friends',
            notificationColor: '#4CAF50',
          },
        });

        console.log('✅ Background tracking started (with notification)');

      } catch (foregroundError) {
        console.log('⚠️ Foreground service failed, trying headless mode...');
        console.log('   Error:', foregroundError);

        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: BACKGROUND_TIME_INTERVAL,
          distanceInterval: BACKGROUND_DISTANCE_INTERVAL,
          showsBackgroundLocationIndicator: false,
        });

        console.log('✅ Background tracking started (headless mode)');
      }

    } catch (error) {
      console.error('❌ Error starting background tracking:', error);
    }
  }

  async stopBackgroundTracking(): Promise<void> {
    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        // Clean up AsyncStorage
        await AsyncStorage.removeItem('currentUserId');
        await AsyncStorage.removeItem('isLocationSharing');
        console.log('🛑 Background tracking stopped');
      }
    } catch (error) {
      console.error('❌ Error stopping background tracking:', error);
    }
  }

  // ============================================
  // STATUS CHECKS
  // ============================================
  isForegroundTracking(): boolean {
    return this.isTracking;
  }

  hasUpgradedAccuracy(): boolean {
    return this.hasUpgradedToBalanced;
  }

  async isBackgroundTracking(): Promise<boolean> {
    try {
      return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    } catch {
      return false;
    }
  }
}