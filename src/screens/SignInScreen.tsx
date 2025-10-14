// src/screens/SignInScreen.tsx
import { router } from "expo-router";
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { authService } from "../services/authService";
import { LinearGradient } from "expo-linear-gradient";

const { width, height} = Dimensions.get('screen');

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      await authService.signIn(email, password);
      Alert.alert("Success", "Welcome back!");
      router.replace("/(tabs)");
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign In</Text>
      <Image
        style={styles.logo}
        source={require('../../assets/official_app_icon.png')}
        resizeMode="contain"
      />
      <Text style={styles.subtitle}>Welcome back to LocationLink</Text>

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

      <TouchableOpacity
        style={[loading && styles.buttonDisabled]}
        onPress={handleSignIn}
        disabled={loading}
      >
        <LinearGradient
         colors={['#1b3decff', '#9420ceff', '#4709b1ff']}
          locations={[0, 0.5, 1]}
          start={{x: 0, y: 0}}
          end={{ x: 1, y: 0}}
          style={[styles.button, styles.firstBtn]}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity
        style={[loading && styles.buttonDisabled]}
        // onPress={ ** Function that leads to Account Recovery }
        disabled={true} // Change this to loading once function above implemented
      >
        <LinearGradient
          // Gradient goes from left to right
          colors={['#1b3decff', '#9420ceff', '#4709b1ff']}
          locations={[0, 0.5, 1]}
          start={{x: 0, y: 0}}
          end={{ x: 1, y: 0}}
          style={styles.button}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Forget Password/Recovery</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push("/signup")} disabled={loading}>
        <Text style={styles.link}>Don’t have an account? Register HERE</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: width * 0.04,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: width * 0.10,
    fontWeight: "bold",
    textAlign: "center",
    color: "#A910F5",
  },
  logo: {
    marginVertical: width * 0.1,
    alignSelf: "center",
    width: width * 0.35,
    height: undefined,
    aspectRatio: 1
  },
  subtitle: {
    fontSize: width * 0.040,
    textAlign: "center",
    fontStyle: 'italic',
    marginBottom: width * 0.02,
    color: "#A910F5",
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
  iconContainer: {
    position: 'absolute',
    right: width * 0.03,
    height: '100%',
    justifyContent: 'center',
  },
  button: {
    width: '100%',
    padding: width * 0.04,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: width * 0.05
  },
  firstBtn: {
    marginTop: width * 0.1,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.04,
  },
  link: {
    color: "#A910F5",
    fontWeight: "600",
    fontStyle: "italic",
    textAlign: "center",
    textDecorationLine: "underline",
    marginTop: width * 0.025,
    marginBottom: width * 0.075,
    fontSize: width * 0.035,
  },
});
