// src/screens/ProfileScreen.tsx
import React, { useState, useEffect } from 'react';
import { router } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { authService } from '../services/authService';
import { dataService } from '../services/dataService';
import { LocationService } from '../services/locationService';
import { Ionicons } from '@expo/vector-icons';
import { uploadData, downloadData, getUrl } from 'aws-amplify/storage';
import CustomModal from '@/components/modal';

export default function ProfileScreen() {
  const [user, setUser] = useState<any>(null);
  const [isLocationSharing, setIsLocationSharing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState({
    type: 'error' as 'error' | 'success' | 'confirm',
    title: '',
    message: ''
  })
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [uploadingImage, setUploadingImage] = useState(false);

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

        if (userData?.avatarKey) {
          await loadAvatar();
        }
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
      setModalVisible(true);
      setModalContent({
        type: 'error',
        title: 'Update Failure',
        message: 'Failed to update location sharing'
      });
      setIsLocationSharing(!value);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      const locationService = LocationService.getInstance();
      await locationService.stopLocationTracking();
      await authService.signOut();
      router.replace('/signin');
    } catch (error) {
      setModalVisible(true);
      setModalContent({
        type: 'error',
        title: 'Signout Error',
        message: 'Failed to sign out'
      });
      // Alert.alert('Error', 'Failed to sign out');
    }
  };

  const loadAvatar = async () => {
    try {
      const result = await getUrl({
        path: `profile-pictures/${user.id}/avatar.jpg`,
      });

      setAvatarUrl(result.url.toString());
    } catch (error) {
      console.log('User has no custom avatar');
    }
  }

  // Image picker logic
  const pickAndUploadImage = async() => {

    try {

      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      // If no permission, we set an error modal and stop!
      if (!permissionResult.granted) {
        setModalContent({
          type: 'error',
          title: 'Permission Required',
          message: 'Permission to access the media library is denied'
        });
        setModalVisible(true);
        return;
      }

      // Proceed with avatar image picker
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1], // For our circular pfp icon display
        quality: 0.7
      })

      if (result.canceled) {
        return;
      }

      const curUrl = result.assets[0].uri;

      setUploadingImage(true);

      const response = await fetch(curUrl);
      const blob = await response.blob();

      await uploadData({
        path: `profile-pictures/${user.id}/avatar.jpg`,
        data: blob,
      }).result;

      setAvatarUrl(curUrl);

      await dataService.updateUser(user.id, {
        avatarKey: `profile-pictures/${user.id}/avatar.jpg`,
      });

    } catch (error) {
      setModalContent({
        type: 'error',
        title: 'Upload Error',
        message: 'Error uploading image'
      })
      setModalVisible(true);
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={pickAndUploadImage} disabled={uploadingImage}>
          {uploadingImage ? (
            <ActivityIndicator size="large" color="#4CAF50" />
          ) : avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <Ionicons name="person-circle" size={80} color="#4CAF50" />
          )}
        </TouchableOpacity>
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

      <TouchableOpacity style={styles.signOutButton} onPress={() => {setModalVisible(true)}}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <CustomModal
        visible={modalVisible}
        title={modalContent.title}
        message={modalContent.message}
        type={modalContent.type}
        onConfirm={modalContent.type === 'confirm'
                    ? () => handleSignOut()
                    : undefined
        }
        onClose={() => setModalVisible(false)}
      />
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
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,  // Half of width/height = perfect circle
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
