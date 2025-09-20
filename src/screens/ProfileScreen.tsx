// src/screens/ProfileScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { authService } from '../services/authService';
import { dataService } from '../services/dataService';
import { LocationService } from '../services/locationService';
import { Ionicons } from '@expo/vector-icons';

export default function ProfileScreen({ navigation }: any) {
  const [user, setUser] = useState<any>(null);
  const [isLocationSharing, setIsLocationSharing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      if (currentUser) {
        const userData = await dataService.getUser(currentUser.userId);
        setUser(userData);
        setIsLocationSharing(userData?.isLocationSharing || false);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const toggleLocationSharing = async (value: boolean) => {
    if (!user) return;

    setIsLocationSharing(value);
    setLoading(true);

    try {
      const locationService = LocationService.getInstance();

      if (value) {
        await locationService.startLocationTracking(user.id);
      } else {
        await locationService.stopLocationTracking();
      }

      await dataService.updateUser(user.id, {
        isLocationSharing: value,
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to update location sharing');
      setIsLocationSharing(!value);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              const locationService = LocationService.getInstance();
              await locationService.stopLocationTracking();
              await authService.signOut();
              navigation.replace('SignIn');
            } catch (error) {
              Alert.alert('Error', 'Failed to sign out');
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="person-circle" size={80} color="#4CAF50" />
        <Text style={styles.username}>{user?.username}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Location Settings</Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Share My Location</Text>
          <Switch
            value={isLocationSharing}
            onValueChange={toggleLocationSharing}
            disabled={loading}
          />
        </View>
        <Text style={styles.settingDescription}>
          {isLocationSharing
            ? 'Your location is visible to friends'
            : 'Your location is hidden'}
        </Text>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    alignItems: 'center',
    padding: 30,
    backgroundColor: 'white',
  },
  username: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 10,
  },
  email: {
    fontSize: 16,
    color: '#666',
    marginTop: 5,
  },
  section: {
    backgroundColor: 'white',
    marginTop: 10,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingLabel: {
    fontSize: 16,
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  signOutButton: {
    backgroundColor: '#ff5252',
    margin: 20,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  signOutText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
