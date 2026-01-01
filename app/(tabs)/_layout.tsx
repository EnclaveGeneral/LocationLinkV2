// app/(tabs)/_layout.tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs, Redirect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { getCurrentUser } from 'aws-amplify/auth';
import { View, ActivityIndicator, StyleSheet, Text, Image, ImageSourcePropType, Dimensions, useColorScheme } from 'react-native';
import { SubscriptionProvider, useSubscriptions } from '../../src/contexts/SubscriptionContext';

// Theme definitions (these are fine at module level - they're just data)
const LIGHT_THEME = {
  tabActive: '#A910F5',
  tabNonActive: '#666666ff',
  headerText: '#ffffff',
  background: '#f3f3f3ff',
  badgeText: '#ffffff',
};

const DARK_THEME = {
  tabActive: '#A910F5',
  tabNonActive: '#ffffff',
  headerText: '#ffffff',
  background: '#1e1e1eff',
  badgeText: '#ffffff',
};

const { height, width } = Dimensions.get('screen');

// Create our custom TabIcons
const TabIcon = ({
  source,
  color,
  size,
  focused,
  badgeCount,
  type
}: {
  source: ImageSourcePropType,
  color: string,
  size: number,
  focused: boolean,
  badgeCount?: number
  type?: 'friends' | 'requests' | 'chats'
}) => {

  const getBadgeStyle = () => {
    switch (type) {
      case 'friends':
        return { backgroundColor: '#A910F5' }
      case 'requests':
        return { backgroundColor: '#32af16ff' }
      default:
        return { backgroundColor: '#666666ff' }
    }
  }

  return (
    <View style={styles.tabIcon}>
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
        <View style={[styles.badge, getBadgeStyle()]}>
          <Text style={styles.badgeText}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </Text>
        </View>
      )}
    </View>
  );
};

// Separate component that uses the subscription hook
function TabsContent() {
  // ✅ useColorScheme hook is now INSIDE the component
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? DARK_THEME : LIGHT_THEME;

  const { pendingRequests, friends } = useSubscriptions();
  const friendsOnline = friends.filter(f => f?.isLocationSharing).length;

  const insets = useSafeAreaInsets();
  const barHeight = width * 0.125 + insets.bottom;
  const iconSize = barHeight * 0.50;
  const textSize = barHeight * 0.25;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.tabActive,
        tabBarInactiveTintColor: theme.tabNonActive,
        tabBarStyle: {
          height: barHeight,
          paddingBottom: insets.bottom,
          paddingTop: 0,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: theme.background,
        },
        tabBarItemStyle: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
        },
        tabBarLabelStyle: {
          fontSize: textSize,
        },
        tabBarIconStyle: {
          justifyContent: 'center',
          alignItems: 'center',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
          headerShown: true,
          header: () => (
            <LinearGradient
              colors={['#1858AC', '#A910F5', '#542AD2']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <View style={styles.headerContainer}>
                <Image
                  style={styles.headerImg}
                  source={require('../../assets/task_bar_icon.png')}
                />
                <Text style={[styles.headerText, { color: theme.headerText }]}>LocationLink</Text>
              </View>
            </LinearGradient>
          ),
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              source={
                focused
                  ? require('../../assets/map_active_icon.png')
                  : require('../../assets/map_icon.png')
              }
              color={color}
              size={iconSize || size}
              focused={focused}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="chats"
        options={{
          headerShown: true,
          title: 'Chats',
          header: () => (
            <LinearGradient
              colors={['#1858AC', '#A910F5', '#542AD2']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <View style={styles.headerContainer}>
                <Text style={[styles.headerText, { color: theme.headerText }]}>My Chats</Text>
              </View>
            </LinearGradient>
          ),
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              source={
                focused
                  ? require('../../assets/chat_active_icon.png')
                  : require('../../assets/chat_icon.png')
              }
              color={color}
              size={iconSize || size}
              focused={focused}
              type='chats'
              badgeCount={0}  // TODO: Add unread message count
            />
          ),
        }}
      />

      <Tabs.Screen
        name="friends"
        options={{
          headerShown: true,
          title: 'Friends',
          header: () => (
            <LinearGradient
              colors={['#1858AC', '#A910F5', '#542AD2']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <View style={styles.headerContainer}>
                <Text style={[styles.headerText, { color: theme.headerText }]}>My Friends</Text>
              </View>
            </LinearGradient>
          ),
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              source={
                focused
                  ? require('../../assets/friends_active_icon.png')
                  : require('../../assets/friends_icon.png')
              }
              color={color}
              size={iconSize || size}
              focused={focused}
              type='friends'
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
          header: () => (
            <LinearGradient
              colors={['#1858AC', '#A910F5', '#542AD2']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <View style={styles.headerContainer}>
                <Text style={[styles.headerText, { color: theme.headerText }]}>My Requests</Text>
              </View>
            </LinearGradient>
          ),
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              source={
                focused
                  ? require('../../assets/add_friend_active_icon.png')
                  : require('../../assets/add_friend_icon.png')
              }
              color={color}
              size={iconSize || size}
              focused={focused}
              type='requests'
              badgeCount={pendingRequests.length}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          headerShown: true,
          title: 'Profile',
          header: () => (
            <LinearGradient
              colors={['#1858AC', '#A910F5', '#542AD2']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <View style={styles.headerContainer}>
                <Text style={[styles.headerText, { color: theme.headerText }]}>My Profile</Text>
              </View>
            </LinearGradient>
          ),
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              source={
                focused
                  ? require('../../assets/profile_active_icon.png')
                  : require('../../assets/profile_icon.png')
              }
              color={color}
              size={iconSize || size}
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

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
        <ActivityIndicator size="large" color="#A910F5" />
      </View>
    );
  }

  // Not authenticated, redirect to sign in
  if (!isAuthenticated) {
    return <Redirect href="/signin" />;
  }

  // Authenticated, show tabs wrapped in SubscriptionProvider
  return (
    <SubscriptionProvider>
      <TabsContent />
    </SubscriptionProvider>
  );
}

// ✅ Styles without theme-dependent colors (those are applied inline)
const styles = StyleSheet.create({
  baseIcon: {
    resizeMode: 'contain' as const,
  },
  tabIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    paddingVertical: 0,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerImg: {
    marginLeft: width * 0.0075,
    width: width * 0.075,
    height: width * 0.075,
    resizeMode: 'contain',
  },
  headerText: {
    marginVertical: width * 0.025,
    fontSize: width * 0.050,
    fontWeight: 'bold',
    textAlign: 'center',
    flex: 1,
  },
  badge: {
    position: 'absolute',
    right: width * -0.025,
    top: width * -0.005,
    borderRadius: width * 0.02,
    minWidth: width * 0.04,
    height: width * 0.04,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: width * 0.008,
    borderWidth: width * 0.004,
    borderColor: 'white',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: width * 0.02,
    fontWeight: 'bold',
  },
});