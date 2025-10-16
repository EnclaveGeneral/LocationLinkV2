import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack, useRouter, useSegments } from 'expo-router';
import { View, ActivityIndicator, Platform } from 'react-native';
import { Amplify } from 'aws-amplify';
// import Constants from 'expo-constants';
import amplifyOutputs from '../amplify_outputs.json';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';

Amplify.configure(amplifyOutputs);

function RootNavigator() {

  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, loading } = useAuth();

  // Ensure the app has access to the right Google Map API Key
  /* const googleMapKey =
    Platform.OS == 'android'
      ? Constants.expoConfig?.extra?.googleMapsKeyAndroid
      : Constants.expoConfig?.extra?.googleMapsKeyIos */

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        {!isAuthenticated ? (
          [
            <Stack.Screen
              key="signin"
              name="signin"
              options={{ title: 'Sign In', headerShown: false }}
            />,
            <Stack.Screen
              key="signup"
              name="signup"
              options={{ title: 'Sign Up', headerShown: false }}
            />,
          ]
        ) : (
          <Stack.Screen
            name="(tabs)"
            options={{ headerShown: false }}
          />
        )}
      </Stack>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
