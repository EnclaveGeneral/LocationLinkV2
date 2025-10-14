import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('screen');

// Define the props interface that other components interact with
interface CustomModalProps {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
  type?: 'error' | 'success' | 'warning';
  onConfirm?: () => void;
}

export default function CustomModal({
  visible,
  title,
  message,
  onClose,
  type = 'error',
  onConfirm
}: CustomModalProps) {

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    } else {
      onClose();
    }
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType='fade'
      onRequestClose={onClose}
    >

      {/* This is the backdrop/overlay for our modal */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose} // Tap to close by anywhere outside

      >

        {/* Prevents modal closing when modal itself is rapped */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >

          <View style={styles.modalContainer}>
            <View style={styles.content}>
              <Text style={[styles.title,
                            type === 'error' && styles.errorModal,
                            type === 'success' && styles.successModal,
                            type === 'warning' && styles.warningModal,
                          ]}>{title}</Text>
              <Text style={[styles.message,
                            type === 'error' && styles.errorModal,
                            type === 'success' && styles.successModal,
                            type === 'warning' && styles.warningModal,
                          ]}>{message}</Text>
            </View>

            <View style={styles.buttonLayout}>
              <TouchableOpacity
                style={[styles.button, styles.buttonLeft]}
                onPress={handleConfirm}
              >
                <Text style={[styles.buttonText, styles.leftButtonText]}>Confirm</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.buttonRight]}
                onPress={onClose}
              >
                <Text style={[styles.buttonText, styles.rightButtonText]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000080',  // Semi-transparent black
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    borderRadius: width * 0.015,
    width: width * 0.75,
    shadowColor: '#000',
    justifyContent: 'space-between',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    backgroundColor: '#f0f0f0ff',
  },
  errorModal: {
    color: '#f80606ff',

  },
  successModal: {
    color: '#rgba(42, 153, 14, 1)',
  },
  warningModal: {
    color: '#A910F5',
  },
  title: {
    fontSize: width * 0.040,
    fontWeight: 'bold',
    marginBottom: width * 0.075,
    color: '#1c1a1aff',
  },
  content: {
    margin: width * 0.075,
    alignItems: 'center',
  },
  message: {
    fontSize: width * 0.035,
    color: '#1c1a1aff',
    marginBottom: width * 0.025,
  },
  buttonLayout: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-evenly',
  },
  button: {
    flex: 1,
    padding: width * 0.030,
    alignItems: 'center',
  },
  buttonLeft: {
    borderBottomLeftRadius: width * 0.015,
    backgroundColor: '#A910F5'
  },
  leftButtonText: {
    color: '#ffffffff',
  },
  buttonRight: {
    borderBottomRightRadius: width * 0.015,
    backgroundColor: '#ffffffff'
  },
  rightButtonText: {
    color: '#A910F5',
  },
  buttonText: {
    color: '#f2eef4ef',
    fontWeight: 'bold',
    fontSize: width * 0.036,
  },
});