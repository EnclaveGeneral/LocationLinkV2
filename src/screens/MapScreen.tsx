// src/screens/MapScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { LocationService } from '../services/locationService';
import { authService } from '../services/authService';
import { useSubscriptions } from '../contexts/SubscriptionContext';
import { Ionicons } from '@expo/vector-icons';
import WebSocketIndicator from '../components/WebSocketIndicator';

const { height, width } = Dimensions.get('screen');

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState({
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });
  const [userLocation, setUserLocation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');

  // Read friends from context
  const { friendsMap, friendsOnline } = useSubscriptions();

  useEffect(() => {
    initializeMap();
  }, []);

  // Log whenever friendsMap changes
  useEffect(() => {
    console.log('🗺️ MapScreen - friendsMap updated:', friendsMap.size, 'friends');
  }, [friendsMap]);

  const initializeMap = async () => {
    try {
      const user = await authService.getCurrentUser();
      if (!user) return;

      // Start location tracking
      const locationService = LocationService.getInstance();
      const hasPermission = await locationService.requestPermissions();

      if (hasPermission) {
        const location = await locationService.getCurrentLocation();
        setUserLocation(location);
        setRegion({
          ...location,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });

        await locationService.startLocationTracking(user.userId, (newLocation) => {
          setUserLocation(newLocation);
        });
      }

    } catch (error) {
      console.error('Error initializing map:', error);
    } finally {
      setLoading(false);
    }
  };

  const searchFriend = () => {
    if (!searchText.trim()) return;

    const friendsArray = Array.from(friendsMap.values());
    const friend = friendsArray.find(f =>
      f.username.toLowerCase().includes(searchText.toLowerCase())
    );

    if (friend && friend.latitude && friend.longitude) {
      const newRegion = {
        latitude: friend.latitude,
        longitude: friend.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      setRegion(newRegion);
      mapRef.current?.animateToRegion(newRegion, 1000);
    } else {
      Alert.alert('Not Found', 'Friend not found or not sharing location');
    }
  };

  const centerOnUser = () => {
    if (userLocation && mapRef.current) {
      const newRegion = {
        ...userLocation,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      mapRef.current.animateToRegion(newRegion, 1000);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading map...</Text>
      </View>
    );
  }

  // Get friends array from map, filter for those sharing location
  const friendsArray = Array.from(friendsMap.values()).filter(
    f => f.isLocationSharing && f.latitude && f.longitude
  );

  console.log('🗺️ MapScreen rendering:', friendsArray.length, 'friends visible on map');

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#666" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search friend..."
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={searchFriend}
          />
        </View>
        <WebSocketIndicator />
      </View>

      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={region}
        showsUserLocation={false}
      >
        {userLocation && (
          <Marker
            coordinate={userLocation}
            title="You"
            description="Your current location"
          >
            <View style={styles.userMarker}>
              <View style={styles.userMarkerInner} />
            </View>
          </Marker>
        )}

        {friendsArray.map((friend) => (
          <Marker
            key={friend.id}
            coordinate={{ latitude: friend.latitude!, longitude: friend.longitude! }}
            title={friend.username}
            description={`Last updated: ${friend.locationUpdatedAt ? new Date(friend.locationUpdatedAt).toLocaleTimeString() : 'Unknown'}`}
          >
            <View style={styles.friendMarker}>
              <Text style={styles.friendMarkerText}>
                {friend.username.substring(0, 2).toUpperCase()}
              </Text>
            </View>
          </Marker>
        ))}
      </MapView>

      <TouchableOpacity style={styles.centerButton} onPress={centerOnUser}>
        <Ionicons name="locate" size={24} color="#666" />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.refreshButton}
        onPress={async () => {
          console.log('🔄 Manual refresh triggered');
          Alert.alert('Refreshed', 'Friend locations updated');
        }}
      >
        <Ionicons name="refresh" size={24} color="#666" />
      </TouchableOpacity>

      <View style={styles.statusBar}>
        <Text style={styles.statusText}>
          {friendsArray.length} friend{friendsArray.length !== 1 ? 's' : ''} online
        </Text>
        {friendsArray.length > 0 && (
          <Text style={styles.statusSubtext}>Real-time tracking active</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
  },
  searchContainer: {
    position: 'absolute',
    top: width * 0.04,
    left: width * 0.02,
    right: width * 0.02,
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: width * 0.02,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: width * 0.04,
    paddingHorizontal: width * 0.02,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: width * 0.02,
    },
    shadowOpacity: 0.25,
    shadowRadius: width * 0.035,
    elevation: 5,
  },
  searchInput: {
    flex: 1,
    height: 45,
    marginLeft: 10,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: width * 0.02,
    paddingVertical: width * 0.03,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginRight: 5,
  },
  liveText: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  map: {
    flex: 1,
  },
  centerButton: {
    position: 'absolute',
    right: 15,
    bottom: 100,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  refreshButton: {
    position: 'absolute',
    right: 15,
    bottom: 160, // Above the center button
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  statusBar: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusText: {
    color: 'white',
    fontSize: 14,
  },
  statusSubtext: {
    color: '#90EE90',
    fontSize: 10,
    marginTop: 2,
  },
  userMarker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(33, 150, 243, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMarkerInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2196F3',
  },
  friendMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  friendMarkerText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
});