import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSubscriptions } from '../contexts/SubscriptionContext';

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
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  connected: {
    backgroundColor: '#4CAF50',
  },
  disconnected: {
    backgroundColor: '#FF9800',
  },
  text: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
});
