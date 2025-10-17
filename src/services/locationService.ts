// src/services/locationService.ts
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dataService } from './dataService';

export class LocationService {
  private static instance: LocationService;
  private locationSubscription: Location.LocationSubscription | null = null;
  private isTracking: boolean = false;

  static getInstance(): LocationService {
    if (!LocationService.instance) {
      LocationService.instance = new LocationService();
    }
    return LocationService.instance;
  }

  async requestPermissions(): Promise<boolean> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
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

    this.isTracking = true;

    this.locationSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000, // Update every 5 seconds of time
        distanceInterval: 10, // Update on every 10 meters of movement
      },
      async (location) => {
        const coords = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };

        // Update in database
        await this.updateLocationInDB(userId, coords);

        // Callback for UI updates
        if (onLocationUpdate) {
          onLocationUpdate(coords);
        }
      }
    );
  }

  async stopLocationTracking() {
    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
    }
    this.isTracking = false;
  }

  private async updateLocationInDB(userId: string, coords: { latitude: number; longitude: number }) {
    try {
      await dataService.updateUser(userId, {
        latitude: coords.latitude,
        longitude: coords.longitude,
        locationUpdatedAt: new Date().toISOString(), // Fixed: correct field name
        isLocationSharing: true,
      });

      // Cache location locally
      await AsyncStorage.setItem('lastLocation', JSON.stringify(coords));
    } catch (error) {
      console.error('Error updating location:', error);
    }
  }
}