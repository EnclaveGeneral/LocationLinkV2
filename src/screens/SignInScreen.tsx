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
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import CustomModal from "@/components/modal";
import { authService } from "../services/authService";
import { LinearGradient } from "expo-linear-gradient";

const { height, width } = Dimensions.get('screen');

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [topLoading, setTopLoading] = useState(false);
  const [bottomLoading, setBottomLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState({
    title: '',
    message: '',
    type: 'error' as 'error' | 'success' | 'confirm'
  });

  const showModal = (title: string, message: string, type: 'error' | 'success' | 'confirm' = 'error') => {
    setModalVisible(true);
    setModalContent({title, message, type});
  };

  const filled = email.trim() !== "" && password.trim() !== "";

  const handleSignIn = async () => {
    if (!email || !password) {
      showModal("Sign In Failed", "One or more required attribute(s) are unfilled", 'error');
      return;
    }

    setTopLoading(true);
    try {
      await authService.signIn(email, password);
      router.replace("/(tabs)");
    } catch (error: any) {
      showModal("Sign In Failed", error.message || "An error has occured during sign in", 'error');
    } finally {
      setTopLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container}>
      <Text style={styles.title}>Sign In</Text>
      <Image
        style={styles.logo}
        source={require('../../assets/official_icon.png')}
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
        editable={!topLoading}
      />

      <View>
        <TextInput
          style={[styles.input, styles.passInput]}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          editable={!topLoading}
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
        onPress={handleSignIn}
        disabled={topLoading || !filled}
      >
        <LinearGradient
         colors={
                !filled || topLoading
                  ? ['#a8a4a4ef', '#a8a4a4ef', '#a8a4a4ef']
                  : ['#1b3decff', '#9420ceff', '#4709b1ff']
          }
          locations={[0, 0.5, 1]}
          start={{x: 0, y: 0}}
          end={{ x: 1, y: 0}}
          style={[styles.button, styles.firstBtn]}
        >
          {topLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.push("/recovery")}
        disabled={topLoading}
      >
        <LinearGradient
         colors={
                topLoading
                  ? ['#a8a4a4ef', '#a8a4a4ef', '#a8a4a4ef']
                  : ['#1b3decff', '#9420ceff', '#4709b1ff']
          }
          locations={[0, 0.5, 1]}
          start={{x: 0, y: 0}}
          end={{ x: 1, y: 0}}
          style={styles.button}
        >
          {topLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Account Recovery</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push("/signup")} disabled={topLoading && bottomLoading}>
        <Text style={styles.link}>Don’t have an account? Register HERE</Text>
      </TouchableOpacity>

      <CustomModal
        visible={modalVisible}
        title={modalContent.title}
        message={modalContent.message}
        type={modalContent.type}
        onClose={() => setModalVisible(false)}
      />
    </KeyboardAvoidingView>
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
    borderColor: "#A910F5",
    color: "#A910F5",
    padding: width * 0.04,
    marginVertical: width * 0.015,
    borderRadius: width * 0.018,
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
    borderRadius: width * 0.020,
    alignItems: "center",
    marginBottom: width * 0.05
  },
  firstBtn: {
    marginTop: width * 0.35,
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
