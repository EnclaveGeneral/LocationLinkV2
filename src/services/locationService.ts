// src/services/locationService.ts
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dataService } from './dataService';
import { data } from '../../amplify/data/resource';

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

  static getInstance(): LocationService {
    if (!LocationService.instance) {
      LocationService.instance = new LocationService();
    }
    return LocationService.instance;
  }

  async requestPermissions(): Promise<boolean> {
    // Request location permissions
    const { status: foreGroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foreGroundStatus !== 'granted') {
      return false;
    }

    // Then request background
    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    return backgroundStatus === 'granted';
  }

  async getCurrentLocation() {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  }

  async startLocationTracking(userId: string, onLocationUpdate?: (location: any) => void) {
    if (this.isTracking) return;

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error('Location permission not granted');
    }

    // Store userId for background task access
    await AsyncStorage.setItem('currentUserId', userId);

    this.isTracking = true;

    // Start FOREGROUND tracking (for UI updates)
    this.locationSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 1000,
        distanceInterval: 1,
      },
      async (location) => {
        const coords = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };

        // Throttled DB updates
        if (Date.now() - this.lastDbUpdateTime >= 5000) {
          this.lastDbUpdateTime = Date.now();
          this.updateLocationInDB(userId, coords).catch(err => console.error(err));
        }

        if (onLocationUpdate) {
          onLocationUpdate(coords);
        }
      }
    );

    // Start BACKGROUND tracking (for background updates)
    const isTaskDefined = TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK);
    const hasStarted = Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);

    if (isTaskDefined && !hasStarted) {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 30000,        // Every 30 seconds in background
        distanceInterval: 50,        // Or every 50 meters
        deferredUpdatesInterval: 60000,
        showsBackgroundLocationIndicator: true,  // iOS blue bar
        foregroundService: {
          notificationTitle: "LocationLink",
          notificationBody: "Sharing your location with friends",
          notificationColor: "#4CAF50",
        },
      });
      console.log('✅ Background location tracking started');
    }
  }

  async stopLocationTracking() {
    // Stop foreground tracking
    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
    }

    // Stop background tracking
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      console.log('🛑 Background location tracking stopped');
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
      await AsyncStorage.setItem('lastLocation', JSON.stringify(coords));
    } catch (error) {
      console.error('Error updating location:', error);
    }
  }
}