// src/config/maps.ts
import Constants from 'expo-constants';
import { Platform } from 'react-native';

interface MapsConfig {
  androidApiKey?: string;
  iosApiKey?: string;
  webApiKey?: string;
}

class GoogleMapsConfig {
  private static instance: GoogleMapsConfig;
  private config: MapsConfig;

  private constructor() {
    // For web, we can use the public key from environment
    this.config = {
      webApiKey: Constants.expoConfig?.extra?.googleMapsWebApiKey,
      // Native keys are embedded at build time through app.config.js
      // They are not accessible here for security
    };
  }

  static getInstance(): GoogleMapsConfig {
    if (!GoogleMapsConfig.instance) {
      GoogleMapsConfig.instance = new GoogleMapsConfig();
    }
    return GoogleMapsConfig.instance;
  }

  getWebApiKey(): string | undefined {
    return this.config.webApiKey;
  }

  // For debugging only - remove in production
  validateConfiguration(): boolean {
    if (Platform.OS === 'web' && !this.config.webApiKey) {
      console.warn('Web API key not configured');
      return false;
    }
    return true;
  }
}

export default GoogleMapsConfig.getInstance();