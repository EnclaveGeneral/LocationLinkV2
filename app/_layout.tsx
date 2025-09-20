import { Stack, useRouter, useSegments } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { Amplify } from 'aws-amplify';
import amplifyOutputs from '../amplify_outputs.json';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';

Amplify.configure(amplifyOutputs);

function RootNavigator() {
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
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
        [
          <Stack.Screen
            key="signin"
            name="signin"
            options={{ title: 'Sign In', headerShown: true, headerBackVisible: false }}
          />,
          <Stack.Screen
            key="signup"
            name="signup"
            options={{ title: 'Sign Up', headerShown: true }}
          />,
        ]
      ) : (
        <Stack.Screen
          name="(tabs)"
          options={{ headerShown: false }}
        />
      )}
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
