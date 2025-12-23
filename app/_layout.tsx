// app/_layout.tsx
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { View, ActivityIndicator, StatusBar, useColorScheme } from 'react-native';
import { Amplify } from 'aws-amplify';
import amplifyOutputs from '../amplify_outputs.json';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';

Amplify.configure(amplifyOutputs);

function RootNavigator() {
  const { isAuthenticated, loading } = useAuth();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();

  const STATUS_BG = colorScheme === 'dark' ? '#121212' : '#ffffff';


  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: STATUS_BG }}>
        <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      {/* PAINT THE AREA BEHIND THE PUNCH HOLE */}
      <View
        style={{
          height: insets.top,
          backgroundColor: STATUS_BG,
        }}
      />

      <StatusBar
        barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'}
        translucent
        backgroundColor="transparent"
      />

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
            <Stack.Screen
              name="recovery"
              options={{ title: 'Recovery', headerShown: false }}
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