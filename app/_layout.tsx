// app/_layout.tsx
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { Amplify } from 'aws-amplify';
import amplifyOutputs from '../amplify_outputs.json';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { SubscriptionProvider } from '../src/contexts/SubscriptionContext';

Amplify.configure(amplifyOutputs);

function RootNavigator() {
  const { isAuthenticated, loading } = useAuth();

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
          <>
            <Stack.Screen
              name="signin"
              options={{ title: 'Sign In', headerShown: false }}
            />
            <Stack.Screen
              name="signup"
              options={{ title: 'Sign Up', headerShown: false }}
            />
          </>
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