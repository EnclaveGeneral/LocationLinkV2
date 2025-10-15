// app/(tabs)/_layout.tsx
import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { getCurrentUser } from 'aws-amplify/auth';
import { View, ActivityIndicator, StyleSheet, Text, Image, ImageSourcePropType} from 'react-native';
import { useSubscriptions } from '../../src/contexts/SubscriptionContext';
import { TabActions, useLinkProps } from '@react-navigation/native';
import FriendsScreen from './friends';

// Create our custom TabIcons
const TabIcon = ({
  source,
  color,
  size,
  focused,
  badgeCount
} : {
  source: ImageSourcePropType,
  color: string,
  size: number,
  focused: boolean,
  badgeCount?: number
}) => {
  return (
    <View>
      <Image
        source={source}
        style={[
          styles.baseIcon,
          {
            width: size,
            height: size,
            tintColor: color,
            opacity: focused ? 1 : 0.7,
          }
        ]}
      />
      {badgeCount !== undefined && badgeCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </Text>
        </View>
      )}
    </View>
  );
};

export default function TabLayout() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // Fetch the number of friends that are online and the numebr of subscriptions.
  const { pendingRequests, friends } = useSubscriptions();

  // Fetch the number of friends currently online sharing their locations
  const friendsOnline = friends.filter(f => f.isLocationSharing).length;

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      await getCurrentUser();
      setIsAuthenticated(true);
    } catch {
      setIsAuthenticated(false);
    }
  };

  // Still checking auth
  if (isAuthenticated === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  // Not authenticated, redirect to sign in
  if (!isAuthenticated) {
    return <Redirect href="/signin" />;
  }

  // Authenticated, show tabs
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#4CAF50',
        tabBarInactiveTintColor: 'gray',
        headerStyle: {
          backgroundColor: '#A910F5',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
          headerShown: true,
          headerTitle: () => (
            <View style={styles.headerContainer}>
              <Image
                style={styles.headerImg}
                source={require('../../assets/task_bar_icon.png')}
              />
              <Text style={styles.headerText}>
                LocationLink
              </Text>
            </View>
          ),
          tabBarIcon: (props) => (
            <TabIcon
              {...props}
              source={require('../../assets/map_icon.png')}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          headerShown: true,
          title: 'Friends',
          headerTitle: () => (
            <View style={styles.headerContainer}>
              <Text style={styles.headerText}>
                My Friends
              </Text>
            </View>
          ),
          tabBarIcon: (props) => (
            <TabIcon
              {...props}
              source={require('../../assets/friends_icon.png')}
              badgeCount={friendsOnline}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          headerShown: true,
          title: 'Requests',
          headerTitle: () => (
            <View style={styles.headerContainer}>
              <Text style={styles.headerText}>
                My Friend Requests
              </Text>
            </View>
          ),
          tabBarIcon: (props) => (
            <TabIcon
              {...props}
              source={require('../../assets/add_friend_icon.png')}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          headerShown: true,
          title: 'Profile',
          headerTitle: () => (
            <View style={styles.headerContainer}>
              <Text style={styles.headerText}>
                Profile
              </Text>
            </View>
          ),
          tabBarIcon: (props) => (
            <TabIcon
              {...props}
              source={require('../../assets/profile_icon.png')}
              badgeCount={pendingRequests.length}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  baseIcon: {
    resizeMode: 'contain' as const,
  },
  headerContainer: {
    justifyContent: 'center',
  },
  headerImg: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
  },
  headerText: {
    color: '#A910F5',
  },
  badge: {

  },
  badgeText: {

  },
})