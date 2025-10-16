// app/(tabs)/_layout.tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs, Redirect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { getCurrentUser } from 'aws-amplify/auth';
import { View, ActivityIndicator, StyleSheet, Text, Image, ImageSourcePropType, Dimensions} from 'react-native';
import { useSubscriptions } from '../../src/contexts/SubscriptionContext';
import { TabActions, useLinkProps } from '@react-navigation/native';
import FriendsScreen from './friends';

// Create our custom TabIcons
const TabIcon = ({
  source,
  color,
  size,
  focused,
  badgeCount,
  type
} : {
  source: ImageSourcePropType,
  color: string,
  size: number,
  focused: boolean,
  badgeCount?: number
  type?: 'friends' | 'requests'
}) => {

  const getBadgeStyle = ()=> {
    switch (type) {
      case 'friends':
        return { backgroundColor: '#A910F5'}
      case 'requests':
        return { backgroundColor: '#32af16ff'}
    }
  }

  return (
    // Style the badge colors based on the type of badge

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

const { height, width } = Dimensions.get('screen');


export default function TabLayout() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // Fetch the number of friends that are online and the numebr of subscriptions.
  const { pendingRequests, friends } = useSubscriptions();
  // const pendingRequests = 5;
  // const friendsOnline = 10;

  const friendsOnline = friends.filter(f => f.isLocationSharing).length;

  const insets = useSafeAreaInsets();

  const barHeight = width * 0.125 + insets.bottom;
  const iconSize = barHeight * 0.50;
  const textSize = barHeight * 0.25;

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

  // Authenticated, show tabs
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#A910F5',
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: {
          height: barHeight,           // includes safe area
          paddingBottom: insets.bottom,
          paddingTop: 0,
          justifyContent: 'center',    // center content vertically
          alignItems: 'center',
          backgroundColor: '#fff',     // or your color

        },
        tabBarItemStyle: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',

        },
        tabBarLabelStyle: {
          fontSize: textSize,
          margin: 0,
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
                {/* Left icon */}
                <Image
                  style={styles.headerImg}
                  source={require('../../assets/task_bar_icon.png')}
                />

                {/* Center title */}
                <Text style={styles.headerText}>LocationLink</Text>

              </View>
            </LinearGradient>
          ),
          tabBarIcon: ({ color, size, focused}) => (
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
                {/* Left icon */}
                {/* <Image
                  style={styles.headerImg}
                  source={require('../../assets/task_bar_icon.png')}
                /> */}

                {/* Center title */}
                <Text style={styles.headerText}>My Friends</Text>

              </View>
            </LinearGradient>
          ),
          tabBarIcon: ({color, size, focused}) => (
            <TabIcon
              source ={
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
                {/* Left icon */}
                {/* <Image
                  style={styles.headerImg}
                  source={require('../../assets/task_bar_icon.png')}
                /> */}

                {/* Center title */}
                <Text style={styles.headerText}>My Requests</Text>

              </View>
            </LinearGradient>
          ),
          tabBarIcon: ({color, size, focused}) => (
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
                {/* Left icon */}
                {/* <Image
                  style={styles.headerImg}
                  source={require('../../assets/task_bar_icon.png')}
                /> */}

                {/* Center title */}
                <Text style={styles.headerText}>My Profile</Text>

              </View>
            </LinearGradient>
          ),
          tabBarIcon: ({color, size, focused}) => (
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
    justifyContent: 'space-between', // left - center - right layout
  },
  headerImg: {
    marginLeft: width * 0.0075,
    width: width * 0.075,
    height: width * 0.075,
    resizeMode: 'contain',
  },
  headerText: {
    color: '#fff',
    marginVertical: width * 0.025,
    fontSize: width * 0.050,
    fontWeight: 'bold',
    textAlign: 'center',
    flex: 1, // ensures takes remaining space
  },
  tabBarItems: {
    flex: 1,
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    right: -8,
    top: -3,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: 'white',
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
})