// src/services/locationService.ts - OPTIMIZED VERSION
// Key changes:
// 1. Separate methods for fast vs accurate location
// 2. Better caching strategy
// 3. Don't block on high-accuracy GPS

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dataService } from './dataService';

const BACKGROUND_LOCATION_TASK = 'background-location-task';

// Define the background task OUTSIDE the class
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Background location error:', error);
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    const location = locations[0];

    if (location) {
      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      const userId = await AsyncStorage.getItem('currentUserId');
      if (userId) {
        try {
          await dataService.updateUser(userId, {
            latitude: coords.latitude,
            longitude: coords.longitude,
            locationUpdatedAt: new Date().toISOString(),
            isLocationSharing: true,
          });
          console.log('📍 Background location updated');
        } catch (error) {
          console.error('Background location DB update failed:', error);
        }
      }
    }
  }
});

export class LocationService {
  private static instance: LocationService;
  private locationSubscription: Location.LocationSubscription | null = null;
  private isTracking: boolean = false;
  private lastDbUpdateTime = Date.now();
  private permissionsGranted: boolean | null = null;

  static getInstance(): LocationService {
    if (!LocationService.instance) {
      LocationService.instance = new LocationService();
    }
    return LocationService.instance;
  }

  // Reset the singleton (useful for logout)
  static resetInstance(): void {
    if (LocationService.instance) {
      LocationService.instance.stopLocationTracking();
    }
    LocationService.instance = new LocationService();
  }

  async requestPermissions(): Promise<boolean> {
    // Cache the result to avoid re-requesting
    if (this.permissionsGranted !== null) {
      return this.permissionsGranted;
    }

    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      this.permissionsGranted = false;
      return false;
    }

    // Request background permissions separately (don't block on it)
    Location.requestBackgroundPermissionsAsync().then(({ status }) => {
      console.log('Background permission:', status);
    }).catch(console.error);

    this.permissionsGranted = true;
    return true;
  }

  // NEW: Get a fast, potentially low-accuracy location
  async getFastLocation(): Promise<{ latitude: number; longitude: number } | null> {
    try {
      // Strategy 1: Check cache first (instant!)
      const cachedStr = await AsyncStorage.getItem('lastLocation');
      const cached = cachedStr ? JSON.parse(cachedStr) : null;

      // Strategy 2: Try last known position (very fast)
      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 5 * 60 * 1000, // 5 minutes
      });

      if (lastKnown) {
        return {
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
        };
      }

      // Strategy 3: Return cached if available
      if (cached) {
        return cached;
      }

      // Strategy 4: Get low-accuracy location with timeout
      const location = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Lowest,
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);

      if (location && 'coords' in location) {
        return {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };
      }

      return null;
    } catch (error) {
      console.error('Error getting fast location:', error);
      return null;
    }
  }

  // Get medium-high accuracy location after loading initial location
  async getHighAccuracyLocation(timeoutMs: number = 30000): Promise<{ latitude: number; longitude: number } | null> {
    try {
      const location = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ]);

      if (location && 'coords' in location) {
        const coords = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };
        await AsyncStorage.setItem('lastLocation', JSON.stringify(coords));
        return coords;
      }

      return null;
    } catch (error) {
      console.error('Error getting high accuracy location:', error);
      return null;
    }
  }

  async startLocationTracking(userId: string, onLocationUpdate?: (location: any) => void) {
    if (this.isTracking) {
      console.log('⚠️ Location tracking already active');
      return;
    }

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error('Location permission not granted');
    }

    // Store userId for background task access
    await AsyncStorage.setItem('currentUserId', userId);

    this.isTracking = true;

    // Start FOREGROUND tracking with balanced accuracy (faster start)
    this.locationSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced, // Changed from High - faster updates
        timeInterval: 2000, // Every 2 seconds
        distanceInterval: 5, // Or every 5 meters
      },
      async (location) => {
        const coords = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };

        // Cache locally
        await AsyncStorage.setItem('lastLocation', JSON.stringify(coords));

        // Throttled DB updates (every 5 seconds)
        if (Date.now() - this.lastDbUpdateTime >= 5000) {
          this.lastDbUpdateTime = Date.now();
          this.updateLocationInDB(userId, coords).catch(err =>
            console.error('DB update error:', err)
          );
        }

        if (onLocationUpdate) {
          onLocationUpdate(coords);
        }
      }
    );

    console.log('✅ Foreground location tracking started');

    // Start BACKGROUND tracking (don't await - let it start in background)
    this.startBackgroundTracking().catch(err =>
      console.error('Background tracking setup error:', err)
    );
  }

  private async startBackgroundTracking() {
    try {
      const isTaskDefined = TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK);

      if (!isTaskDefined) {
        console.log('⚠️ Background task not defined');
        return;
      }

      const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);

      if (!hasStarted) {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 30000,
          distanceInterval: 50,
          deferredUpdatesInterval: 60000,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: "LocationLink",
            notificationBody: "Sharing your location with friends",
            notificationColor: "#4CAF50",
          },
        });
        console.log('✅ Background location tracking started');
      }
    } catch (error) {
      console.error('Error starting background tracking:', error);
    }
  }

  async stopLocationTracking() {
    // Stop foreground tracking
    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
    }

    // Stop background tracking
    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        console.log('🛑 Background location tracking stopped');
      }
    } catch (error) {
      console.error('Error stopping background tracking:', error);
    }

    await AsyncStorage.removeItem('currentUserId');
    this.isTracking = false;
  }

  private async updateLocationInDB(userId: string, coords: { latitude: number; longitude: number }) {
    try {
      await dataService.updateUser(userId, {
        latitude: coords.latitude,
        longitude: coords.longitude,
        locationUpdatedAt: new Date().toISOString(),
        isLocationSharing: true,
      });
    } catch (error) {
      console.error('Error updating location:', error);
    }
  }

  // Utility method to check if tracking is active
  isTrackingActive(): boolean {
    return this.isTracking;
  }
}