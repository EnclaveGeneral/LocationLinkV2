// src/screens/SignUpScreen.tsx
import { router } from "expo-router";
import React, { useState, useEffect } from "react";
import {
  Image,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Dimensions,
  ScrollView,
  Touchable,
} from "react-native";
import { LinearGradient } from 'expo-linear-gradient'
import CustomModal from "@/components/modal";
import { authService } from "../services/authService";
import { dataService } from "../services/dataService";
import { Ionicons } from '@expo/vector-icons';

// Get the current device size to style our elements appropriately.
const {height, width} = Dimensions.get("screen");

export default function SignUpScreen() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState({
    title: '',
    message: '',
    type: 'error' as 'error' | 'success' | 'warning'
  });
  const [code, setCode] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  // This effect will run everytime 'password' variable changes.
  useEffect(() => {
    setPasswordErrors(validatePasswords());
  }, [password, confirmPassword]);

  const showModal = (title: string, message: string, type: 'error' | 'success' | 'warning' = 'error') => {
    setModalContent({title, message, type});
    setModalVisible(true);
  };

  const handleSignUp = async () => {
    if (!email || !username || !password || !confirmPassword) {
      showModal("Registration Failed", "Error: One or more required field(s) not filled", "error");
      return;
    }

    if (password !== confirmPassword) {
      showModal("Password Confirmation Incorrect", "Error: Please check your password is identical to the confirmed password", "error");
      return;
    }

    setLoading(true);
    try {
      await authService.signUp(email, password, username);
      setShowConfirm(true);
      showModal("Registration Suceed", "Please select the method for MFA Authentication Next", "success");
    } catch (error: any) {
      showModal("Registration Error", error.message || "There is an error during registration", "error");
    } finally {
      setLoading(false);
    }
  };

  const validatePasswords = () => {

    let currentErrors = [];

    let x = "❌";
    let y = "✅";

    let lengthCheck = x;
    let uppeCaseCheck = x;
    let lowerCaseCheck = x;
    let numbersCheck = x;
    let specialCheck = x;
    let confirmCheck = y;

    if (password.length >= 8) {
      lengthCheck = y;
    }

    if (/[A-Z]/.test(password)) {
      uppeCaseCheck = y;
    }

    if (/[a-z]/.test(password)) {
      lowerCaseCheck = y;
    }

    if (/[0-9]/.test(password)) {
      numbersCheck = y;
    }

    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      specialCheck = y;
    }

    if (password !== confirmPassword) {
      confirmCheck = x;
    }

    currentErrors.push(lengthCheck + " At Least 8 Characters");
    currentErrors.push(uppeCaseCheck + " At Least One Uppercase Letter");
    currentErrors.push(lowerCaseCheck + " At Least One Lowercase Letter");
    currentErrors.push(numbersCheck + " At Least One Numerical Digit");
    currentErrors.push(specialCheck + " At Least One Special Character");
    currentErrors.push(confirmCheck + " Password Must Match Confirmed");

    return currentErrors;

  }

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await authService.confirmSignUp(email, code);

      // Auto sign in
      await authService.signIn(email, password);

      // Get current user
      const user = await authService.getCurrentUser();
      if (user) {
        // Create user with empty friends array
        await dataService.createUser({
          id: user.userId,
          username: username,
          email: email,
          isLocationSharing: true,
          friends: [] // Initialize empty friends array
        });

        // Create public profile for user discovery
        await dataService.createPublicProfile({
          userId: user.userId,
          username: username,
        });
      }

      showModal("Registration Complete", "Your LocationLink account has been created", "success");
      router.replace("/(tabs)");
    } catch (error: any) {
      showModal("Error", error.message || "There is an error in confirming your account", 'error');
    } finally {
      setLoading(false);
    }
  };

  if (showConfirm) {
    return (
      <KeyboardAvoidingView style={styles.container}>

        <ScrollView>
          <Text style={styles.title}>Confirm Account</Text>
          <Text style={styles.subtitle}>Enter the code sent to {email}</Text>

          <TextInput
            style={styles.input}
            placeholder="Confirmation Code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            editable={!loading}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleConfirm}
            disabled={loading}
          >

          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Confirm</Text>
          )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setShowConfirm(false)} disabled={loading}>
            <Text style={styles.link}>Back to Sign Up</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container}>
      <ScrollView>

        <Image
          style={styles.logo}
          source={require('../../assets/individual_pointer.png')}
          resizeMode= "contain"
        />

        <Text style={styles.title}>Create Your Account</Text>
        <Text style={styles.subtitle}>Join LocationLink, A Community Like No Other</Text>

        <TextInput
          style={styles.input}
          placeholder="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!loading}
        />

        <View>
          <TextInput
            style={[styles.input, styles.passInput]}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            editable={!loading}
          />

          <TouchableOpacity
            style={styles.iconContainer}
            onPress={() => setShowPassword(!showPassword)} // Toggle password visibility
          >
            <Ionicons
              name={showPassword ? 'eye-off' : 'eye'}
              size={width * 0.05}
              color='#6F2CE2'
            />
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Confirm Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showPassword}
          editable={!loading}
        />

        <View style={styles.errorList}>
          <Text style={styles.requirements}>
            Password Requirements:
          </Text>
          {passwordErrors.map((curError, index) => (
            <Text key={index} style={[styles.individualError]}>
              {curError}
            </Text>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignUp}
          disabled={loading}
        >
          <LinearGradient
            // Gradient goes from left to right
            colors={['#3385F0', '#5611CB']}
            start={{x: 0, y: 0}}
            end={{ x: 0, y: 1}}
            style={styles.button}

          >

            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Register</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/signin")} disabled={loading}>
          <Text style={styles.link}>Already have an account? Sign In Instead Here.</Text>
        </TouchableOpacity>

        <CustomModal
          visible={modalVisible}
          title={modalContent.title}
          message={modalContent.message}
          type={modalContent.type}
          onClose={() => setModalVisible(false)}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: width * 0.04,
    backgroundColor: "#fff",
  },
  logo : {
    marginTop: width * 0.075,
    alignSelf: "center",
    width: width * 0.35,
    height: undefined,
    aspectRatio: 1
  },
  title: {
    fontSize: width * 0.075,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: width * 0.075,
    marginBottom: width * 0.03,
    color: "#A910F5",
  },
  subtitle: {
    fontSize: width * 0.03,
    textAlign: "center",
    marginBottom: width * 0.15,
    color: "#666",
  },
  input: {
    borderWidth: width * 0.002,
    borderColor: "#ddd",
    padding: width * 0.04,
    marginVertical: width * 0.015,
    borderRadius: 8,
    fontSize: width * 0.03,
  },
  passInput: {
    paddingRight: width * 0.1,
  },
  requirements: {
    fontSize: width * 0.03,
    fontWeight: "700",
    color: "#A910F5",
    marginBottom: width * 0.01,
  },
  errorList: {
  },
  individualError: {
    marginLeft: width * 0.0075,
    fontSize: width * 0.03,
    marginBottom: width * 0.01,
  },
  button: {
    width: '100%',
    padding: width * 0.03,
    borderRadius: 8,
    alignItems: "center",
    marginTop: width * 0.10,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.04,
  },
  iconContainer: {
    position: 'absolute',
    right: width * 0.03,
    height: '100%',
    justifyContent: 'center',
  },
  link: {
    color: "#A910F5",
    fontWeight: "600",
    fontStyle: "italic",
    textAlign: "center",
    textDecorationLine: "underline",
    marginBottom: width * 0.075,
    fontSize: width * 0.035,
  },
});