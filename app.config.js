//app.config.js
import 'dotenv/config';

export default {
  expo: {
    name: "LocationLink",
    slug: "LocationLink",
    version: "1.0.0",
    scheme: "locationLink",
    platforms: ["android", "ios"],
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.yourcompany.locationlink",
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_IOS
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "LocationLink needs access to your location to share it with your friends.",
        NSLocationAlwaysAndWhenInUseUsageDescription: "LocationLink needs access to your location to continuously share it with your friends."
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      package: "com.yourcompany.locationlink",
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID
        }
      },
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION"
      ]
    },
    plugins: [
      "expo-router",
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission: "Allow LocationLink to use your location.",
          locationAlwaysPermission: "Allow LocationLink to use your location to share with your friends.",
          locationWhenInUsePermission: "Allow LocationLink to use your location to share with your friends."
        }
      ]
    ],
    extra: {
      "eas": {
        "projectId": "376bbf5e-f8f8-4ebc-a0d7-dc231975f03a",
      }
    }
  }
};