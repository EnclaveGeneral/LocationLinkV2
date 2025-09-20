// app/_layout.tsx
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Amplify } from 'aws-amplify';
import { getCurrentUser } from 'aws-amplify/auth';

// Import the config
import amplifyOutputs from '../amplify_outputs.json';

// Configure Amplify OUTSIDE the component
Amplify.configure(amplifyOutputs);
console.log('✅ Amplify configured with User Pool:', amplifyOutputs.auth.user_pool_id);

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (!isReady) return;

    const inAuthGroup = segments[0] === '(tabs)';
    const inAuthScreens = segments[0] === 'signin' || segments[0] === 'signup';

    if (!isAuthenticated && inAuthGroup) {
      // User is in tabs but not authenticated, redirect to signin
      router.replace('/signin');
    } else if (isAuthenticated && inAuthScreens) {
      // User is authenticated but on auth screens, redirect to tabs
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, segments, isReady]);

  const checkAuth = async () => {
    try {
      await getCurrentUser();
      setIsAuthenticated(true);
    } catch {
      setIsAuthenticated(false);
    } finally {
      setIsReady(true);
    }
  };

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      {!isAuthenticated ? (
        <>
          {/* Auth screens - NO TABS */}
          <Stack.Screen
            name="signin"
            options={{
              title: 'Sign In',
              headerShown: true,
              headerBackVisible: false,
            }}
          />
          <Stack.Screen
            name="signup"
            options={{
              title: 'Sign Up',
              headerShown: true,
            }}
          />
        </>
      ) : (
        <>
          {/* Main app with tabs */}
          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown: false
            }}
          />
        </>
      )}
    </Stack>
  );
}