import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useSubscriptions } from '../contexts/SubscriptionContext';

const { width } = Dimensions.get('screen');

export default function WebSocketIndicator() {
  const { isWebSocketConnected } = useSubscriptions();

  return (
    <View style={styles.container}>
      <View style={[styles.dot, isWebSocketConnected ? styles.connected : styles.disconnected]} />
      <Text style={styles.text}>
        {isWebSocketConnected ? 'Live' : 'Connecting...'}
      </Text>
    </View>
  );

}


const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: width * 0.027,  // was: 12
    paddingVertical: width * 0.013,    // was: 6
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: width * 0.045,       // was: 20
  },
  dot: {
    width: width * 0.018,              // was: 8
    height: width * 0.018,
    borderRadius: width * 0.009,       // was: 4
    marginRight: width * 0.013,        // was: 6
  },
  connected: {
    backgroundColor: '#4CAF50',
  },
  disconnected: {
    backgroundColor: '#FF9800',
  },
  text: {
    color: 'white',
    fontSize: width * 0.027,           // was: 12
    fontWeight: '600',
  },
});

