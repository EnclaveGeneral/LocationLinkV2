import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet } from 'react-native';
import { useSubscriptions } from '../src/contexts/SubscriptionContext';

export default function TabLayout() {
  const { pendingRequests, friendsOnline } = useSubscriptions();

  const renderTabIcon = (name: string, focused: boolean, color: string, size: number, badge?: number) => {
    return (
      <View style={{ position: 'relative' }}>
        <Ionicons name={name as any} size={size} color={color} />
        {badge !== undefined && badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#4CAF50',
        tabBarInactiveTintColor: 'gray',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
          headerTitle: 'LocationLink',
          tabBarIcon: ({ color, size, focused }) =>
            renderTabIcon(focused ? 'map' : 'map-outline', focused, color, size, friendsOnline),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: 'Friends',
          headerTitle: 'My Friends',
          tabBarIcon: ({ color, size, focused }) =>
            renderTabIcon(focused ? 'people' : 'people-outline', focused, color, size),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: 'Requests',
          headerTitle: 'Friend Requests',
          tabBarIcon: ({ color, size, focused }) =>
            renderTabIcon(focused ? 'person-add' : 'person-add-outline', focused, color, size, pendingRequests.length),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerTitle: 'My Profile',
          tabBarIcon: ({ color, size, focused }) =>
            renderTabIcon(focused ? 'person' : 'person-outline', focused, color, size),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    right: -8,
    top: -3,
    backgroundColor: '#FF6B6B',
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
});