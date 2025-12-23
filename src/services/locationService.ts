// src/services/locationService.ts - FIXED VERSION
//
// FIXES APPLIED:
// 1. REMOVED isLocationSharing=false write from stopLocationTracking()
//    - This was destroying user preference on logout!
// 2. Kept isLocationSharing=true write on startLocationTracking() and updateLocationInDB()
//    - This ensures friends can see user when actively sharing
// 3. Proper Low → Balanced upgrade flow for battery efficiency

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dataService } from './dataService';

const BACKGROUND_LOCATION_TASK = 'background-location-task';

// Constants
const DB_UPDATE_INTERVAL = 5000;
const BG_DB_UPDATE_INTERVAL = 30000;
const ACCURACY_THRESHOLD = 50;
const BG_START_DELAY = 10000;

// Background task - defined outside class
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Background location error:', error);
    return;
  }

  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  const location = locations[0];
  if (!location) return;

  const userId = await AsyncStorage.getItem('currentUserId');
  if (!userId) return;

  try {
    const lastUpdateStr = await AsyncStorage.getItem('bgLastDbUpdate');
    const lastUpdate = lastUpdateStr ? Number(lastUpdateStr) : 0;

    if (Date.now() - lastUpdate < BG_DB_UPDATE_INTERVAL) {
      return;
    }

    const coords = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };

    await dataService.updateUser(userId, {
      latitude: coords.latitude,
      longitude: coords.longitude,
      locationUpdatedAt: new Date().toISOString(),
      isLocationSharing: true,
    });

    await AsyncStorage.setItem('lastLocation', JSON.stringify(coords));
    await AsyncStorage.setItem('bgLastDbUpdate', Date.now().toString());

    console.log('📍 Background location updated');
  } catch (error) {
    console.error('Background location DB update failed:', error);
  }
});

// Location data passed to callbacks
export interface LocationUpdate {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export class LocationService {
  private static instance: LocationService;
  private locationSubscription: Location.LocationSubscription | null = null;
  private isTracking = false;
  private hasUpgradedToBalanced = false;
  private lastDbUpdateTime = 0;
  private userId: string | null = null;
  private onLocationUpdate: ((location: LocationUpdate) => void) | null = null;

  static getInstance(): LocationService {
    if (!LocationService.instance) {
      LocationService.instance = new LocationService();
    }
    return LocationService.instance;
  }

  static resetInstance(): void {
    if (LocationService.instance) {
      LocationService.instance.stopLocationTracking();
    }
    LocationService.instance = new LocationService();
  }

  // Get location FAST for initial map display
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
        maxAge: 10 * 60 * 1000,
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

      // Strategy 3: Low accuracy with timeout
      console.log('📍 Getting low-accuracy location...');
      const location = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);

      if (location && 'coords' in location) {
        console.log('📍 Got low-accuracy location');
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
      console.error('Error getting fast location:', error);
      return null;
    }
  }

  // Start location tracking
  async startLocationTracking(
    userId: string,
    onLocationUpdate?: (location: LocationUpdate) => void
  ): Promise<void> {
    if (this.isTracking) {
      console.log('⚠️ Location tracking already active');
      return;
    }

    // Request permissions
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Location permission not granted');
    }

    // Store for later use
    this.userId = userId;
    this.onLocationUpdate = onLocationUpdate || null;
    this.isTracking = true;
    this.hasUpgradedToBalanced = false;

    await AsyncStorage.setItem('currentUserId', userId);

    // Set isLocationSharing=true in DB when tracking starts
    // This lets friends know we're actively sharing
    try {
      await dataService.updateUser(userId, {
        isLocationSharing: true,
      });
      console.log('✅ Set isLocationSharing=true in DB');
    } catch (error) {
      console.error('Failed to update isLocationSharing:', error);
    }

    // Start with LOW accuracy - fast updates, battery friendly
    console.log('🚀 Starting LOW accuracy tracking...');
    this.locationSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Low,
        timeInterval: 2000,
        distanceInterval: 5,
      },
      (location) => this.handleLocationUpdate(location)
    );

    console.log('✅ Foreground location tracking started (LOW accuracy)');

    // Start background tracking after a delay
    setTimeout(() => {
      this.startBackgroundTracking();
    }, BG_START_DELAY);
  }

  // Handle location updates
  private async handleLocationUpdate(location: Location.LocationObject): Promise<void> {
    const coords: LocationUpdate = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
    };

    // Notify UI with accuracy included
    this.onLocationUpdate?.(coords);

    // Cache location
    await AsyncStorage.setItem('lastLocation', JSON.stringify({
      latitude: coords.latitude,
      longitude: coords.longitude,
    }));

    // Throttled DB update
    if (Date.now() - this.lastDbUpdateTime >= DB_UPDATE_INTERVAL) {
      this.lastDbUpdateTime = Date.now();
      this.updateLocationInDB(coords);
    }

    // Check if we should upgrade to Balanced accuracy
    if (!this.hasUpgradedToBalanced &&
        coords.accuracy != null &&
        coords.accuracy < ACCURACY_THRESHOLD) {
      console.log(`🎯 Good GPS fix (${coords.accuracy.toFixed(1)}m) - upgrading to BALANCED`);
      await this.upgradeToBalanced();
    }
  }

  // Upgrade to Balanced accuracy
  private async upgradeToBalanced(): Promise<void> {
    this.hasUpgradedToBalanced = true;

    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
    }

    this.locationSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 5000,
        distanceInterval: 10,
      },
      (location) => this.handleLocationUpdate(location)
    );

    console.log('✅ Upgraded to BALANCED accuracy tracking');
  }

  // Background tracking
  private async startBackgroundTracking(): Promise<void> {
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

      const { status } = await Location.requestBackgroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('⚠️ Background location permission not granted');
        return;
      }

      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 30000,
        distanceInterval: 50,
        deferredUpdatesInterval: 60000,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'LocationLink',
          notificationBody: 'Sharing your location with friends',
          notificationColor: '#4CAF50',
        },
      });

      console.log('✅ Background location tracking started');
    } catch (error) {
      console.error('Error starting background tracking:', error);
    }
  }

  // Stop tracking - DOES NOT MODIFY USER PREFERENCE IN DB!
  // The user's isLocationSharing preference is preserved so it resumes on next login
  async stopLocationTracking(): Promise<void> {
    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
    }

    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        console.log('🛑 Background location tracking stopped');
      }
    } catch (error) {
      console.error('Error stopping background tracking:', error);
    }

    // ✅ FIX: DO NOT write isLocationSharing=false to DB here!
    // The user's preference should be preserved across sessions.
    // We only stop the actual tracking, not change their preference.

    await AsyncStorage.removeItem('currentUserId');
    this.isTracking = false;
    this.hasUpgradedToBalanced = false;
    this.userId = null;
    this.onLocationUpdate = null;

    console.log('🛑 Location tracking stopped');
  }

  // Update location in DB
  private updateLocationInDB(coords: LocationUpdate): void {
    if (!this.userId) return;

    dataService.updateUser(this.userId, {
      latitude: coords.latitude,
      longitude: coords.longitude,
      locationUpdatedAt: new Date().toISOString(),
      isLocationSharing: true,
    }).catch(error => {
      console.error('Error updating location in DB:', error);
    });
  }

  isTrackingActive(): boolean {
    return this.isTracking;
  }

  hasUpgraded(): boolean {
    return this.hasUpgradedToBalanced;
  }
}