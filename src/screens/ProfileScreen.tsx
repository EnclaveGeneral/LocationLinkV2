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
  ActivityIndicator,
  Dimensions,
  Platform
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { authService } from '../services/authService';
import { dataService } from '../services/dataService';
import { LocationService } from '../services/locationService';
import { Ionicons } from '@expo/vector-icons';
import { uploadData, getUrl } from 'aws-amplify/storage';
import CustomModal from '@/components/modal';
import { fetchAuthSession } from 'aws-amplify/auth';

const { width } = Dimensions.get('screen');

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
        await loadAvatar(userData.avatarKey);  // ✅ Pass the key directly
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

      if (user) {
        await dataService.updateUser(user.id, {
          isLocationSharing: false,
        });
      }

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

  const loadAvatar = async (avatarKey: string) => {
    try {
      // Use the stored avatarKey path from the database
      const result = await getUrl({
        path: avatarKey,
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

      // Get the Cognito Identity ID
      const session = await fetchAuthSession();
      const identityId = session.identityId;

      const response = await fetch(curUrl);
      const blob = await response.blob();

      await uploadData({
        path: `profile-pictures/${identityId}/avatar.jpg`,
        data: blob,
      }).result;

      setAvatarUrl(curUrl);

      await dataService.updateUser(user.id, {
        avatarKey: `profile-pictures/${identityId}/avatar.jpg`,
      });

    } catch (error) {
      setModalContent({
        type: 'error',
        title: 'Upload Error',
        message: 'Error uploading image'
      })
      console.log(error);
      setModalVisible(true);
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
          <TouchableOpacity onPress={pickAndUploadImage} disabled={uploadingImage}>
            <View style={styles.avatarContainer}>

              {uploadingImage ? (
                <ActivityIndicator size="large" color="#4CAF50" />
              ) : avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <Ionicons name="person-circle" size={width * 0.25} color="#4CAF50" />
              )}

              <View style={styles.editIconContainer}>
                <Ionicons name="camera" size={width * 0.035} color="white" />
              </View>
            </View>
          </TouchableOpacity>
        <Text style={styles.changePhotoText}>Tap to change photo</Text>
        <Text style={styles.username}>{user?.username}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Location Settings</Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Share My Location</Text>
          <Switch
            trackColor={{ false: '#666', true: '#A910F5' }}
            value={isLocationSharing}
            onValueChange={toggleLocationSharing}
            disabled={loading}

          />
        </View>
        <Text style={styles.settingDescription}>
          {isLocationSharing
            ? <Text style={[styles.settingDescription, styles.settingOn]}>
                Your current location is visible to friends
              </Text>
            : <Text style={[styles.settingDescription, styles.settingOff]}>
                Your current location is hidden to friends
              </Text>
           }
        </Text>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={() => {
        setModalContent({
          type: 'confirm',
          title: 'Confirm Sign Out',
          message: 'Are you sure you want to sign out?'
        })
        setModalVisible(true);
      }}>
        <Text style={styles.signOutText}> Sign Out </Text>
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
    padding: width * 0.070,
    backgroundColor: 'white',
  },
  changePhotoText: {
    fontSize: width * 0.030,
    color: '#666',
    marginTop: width * 0.020,
  },
  username: {
    fontSize: width * 0.050,
    fontWeight: 'bold',
    marginTop: width * 0.025,
  },
  email: {
    fontSize: width * 0.035,
    color: '#666',
    marginTop:  width * 0.010,
  },
  section: {
    backgroundColor: 'white',
    marginTop: width * 0.025,
    padding: width * 0.050,
  },
  avatar: {
    width: width * 0.25,
    height: width * 0.25,
    borderRadius: width * 0.125,  // Half of width/height = perfect circle
  },
  avatarContainer: {
    position: 'relative',
  },
  editIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#9420ceff',
    borderRadius: width * 0.025,
    width: width * 0.050,
    height: width * 0.050,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: width * 0.0045,
    borderColor: 'white',
  },
  sectionTitle: {
    fontSize: width * 0.040,
    fontWeight: 'bold',
    marginBottom: width * 0.030,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingLabel: {
    fontSize: width * 0.035,
  },
  settingDescription: {
    fontSize: width * 0.030,
    color: '#666',
    marginTop:  width * 0.020,
    fontWeight: 'bold',
  },
  settingOn: {
    color: '#4CAF50',
  },
  settingOff: {
    color: '#f80606ff',
  },
  signOutButton: {
    backgroundColor: '#f80606ff',
    margin: width * 0.055,
    padding: width * 0.035,
    borderRadius: width * 0.020,
    alignItems: 'center',
  },
  signOutText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: width * 0.040,
  },
});
