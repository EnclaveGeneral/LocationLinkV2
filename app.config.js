// app.config.js
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
    newArchEnabled: true,
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
        NSLocationAlwaysAndWhenInUseUsageDescription: "LocationLink needs access to your location to continuously share it with your friends.",
        NSLocationAlwaysUsageDescription: "LocationLink needs access to your location to share it with your friends even when the app is in the background."
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
        "ACCESS_COARSE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION"
      ]
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      "expo-router",
      "expo-secure-store",
      "expo-location"
    ],
    extra: {
      // These will be accessible in the app via Constants.expoConfig.extra
      googleMapsWebApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_WEB,
      // Add any other non-sensitive config here
      eas: {
        projectId: process.env.EAS_PROJECT_ID
      }
    },
    // EAS Build configuration
    owner: "EncalvePresident", // Replace with your Expo username
  }
};