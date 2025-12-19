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
import { Ionicons } from '@expo/vector-icons';

const { height, width } = Dimensions.get('screen');

type RecoveryStep = 'email' | 'reset';

// The logic is simple, we have two versions of the page, one for confirming account
// access with a confirmation code from email, and one for resetting password after we
// have confirmed user identity.

export default function RecoveryScreen() {
  const [step, setStep] = useState<RecoveryStep>('email');
  const [firstLoading, setFirstLoading] = useState(false);
  const [secondLoading, setSecondLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [requirementsMet, setRequirementsMet] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState({
    title: "",
    message: "",
    type: "error" as "error" | "success" | "confirm"
  });


  useEffect(() => {
    const curErrors = validatePasswords();
    setPasswordErrors(curErrors);
    setRequirementsMet(curErrors.every(error => error.startsWith("✅")));
  }, [newPassword, confirmPassword]);

  // Handles when user presses "Confirm" button after entering their email address
  const handleEmail = async () => {
    setFirstLoading(true);

    try {
      const result = await authService.resetPassword(email);

      if (result.nextStep.resetPasswordStep === 'DONE') {
        setModalVisible(true);
        setModalContent({
          title: "Password Reset Successful",
          message: "Your password has been successfully reset",
          type: "success"
        });
        setFirstLoading(false);
        router.replace("/signin");
      }

      // Move to the next step
      setFirstLoading(false);
      setStep('reset');
    } catch (error : any) {
      setModalVisible(true);
      setModalContent({
        title: "Email Error",
        message: error.message || "An error has occured while attempting to confirm your identity through email",
        type: "error"
      });
      setFirstLoading(false);
      return;
    }

  }

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

    if (newPassword.length >= 8) {
      lengthCheck = y;
    }

    if (/[A-Z]/.test(newPassword)) {
      uppeCaseCheck = y;
    }

    if (/[a-z]/.test(newPassword)) {
      lowerCaseCheck = y;
    }

    if (/[0-9]/.test(newPassword)) {
      numbersCheck = y;
    }

    if (/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
      specialCheck = y;
    }

    if (newPassword !== confirmPassword) {
      confirmCheck = x;
    }

    currentErrors.push(lengthCheck + " At Least 8 Characters");
    currentErrors.push(uppeCaseCheck + " At Least One Uppercase Letter");
    currentErrors.push(lowerCaseCheck + " At Least One Lowercase Letter");
    currentErrors.push(numbersCheck + " At Least One Numerical Digit");
    currentErrors.push(specialCheck + " At Least One Special Character");
    currentErrors.push(confirmCheck + " Password Confirmed Identical");

    return currentErrors;

  }

  // Handles when user requests to resend confirmation code to their email
  // after indicating their email address.
  const resendConfirmationCode = async () => {
    setSecondLoading(true);
    try {
      const result = await authService.resetPassword(email);

      if (result.nextStep.resetPasswordStep === 'DONE') {
        setModalVisible(true);
        setModalContent({
          title: "Password Reset Successful",
          message: "Your password has been successfully reset",
          type: "success"
        });
        setSecondLoading(false);
        router.replace("/signin");
      }

      setSecondLoading(false);

    } catch (error : any) {
      setModalVisible(true);
      setModalContent({
        title: "Email Error",
        message: error.message || "An error has occured while attempting to confirm your identity through email",
        type: "error"
      });
      setSecondLoading(false);
      return;
    }
  }

  // Handles when user is already confirmed and has resetted their password after
  // indicating their email address/

  // We need to check their email is valid, their email confirmation code is valid,
  // and their new password is valid.
  const handleReset = async () => {
    setSecondLoading(true);

    try {
      await authService.confirmResetPassword(email, confirmationCode, newPassword);

      // If no errors, we can show success modal and redirect to sign in page.
      setModalVisible(true);
      setModalContent({
        title: "Password Reset Successful",
        message: "Your password has been successfully reset",
        type: "success"
      });

      // Set a certain time out!
      setTimeout(() => {
        setModalVisible(false);
        setSecondLoading(false);
        router.replace("/signin");
      }, 2000);
    } catch (error : any) {
      setModalVisible(true);
      setModalContent({
        title: "Password Reset Error",
        message: error.message || "An error has occured while attempting to reset your password",
        type: "error"
      })
      setSecondLoading(false);
      return;
    }
  }

  if (step === 'email') {
    return (
      <KeyboardAvoidingView style={styles.container}>

        <ScrollView>
          <Text style={styles.title}>Account Recovery</Text>
          <Text style={styles.subtitle}>Please enter your email address</Text>

          <TextInput
            style={styles.input}
            placeholder="Enter Email Here"
            value={email}
            onChangeText={setEmail}
            editable={!firstLoading}
          />

          <TouchableOpacity
            style={[styles.button,
                firstLoading || email.trim() === ""
                  ? styles.buttonDisabled
                  : styles.confirmButton
                ]}
            onPress={handleEmail}
            disabled={firstLoading || email.trim() === ""}
          >

          {firstLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Confirm Email</Text>
          )}
          </TouchableOpacity>

          {/* <TouchableOpacity
            style={[styles.button, styles.resendButton, firstLoading && styles.buttonDisabled]}
            onPress={handleResendCode}
            disabled={bottomLoading}
          >

          {bottomLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Resend Confirmation Code</Text>
          )}
          </TouchableOpacity> */}

          {/* <TouchableOpacity
            onPress={() => {
              setShowConfirm(false);
              setModalVisible(false);
            }} disabled={loading}>
            <Text style={styles.link}>Back to Sign Up</Text>
          </TouchableOpacity> */}
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

  return (
    <KeyboardAvoidingView style={styles.container}>

      <ScrollView>
        <Text style={styles.title}>Confirm Account</Text>
        <Text style={styles.subtitle}>Enter the code sent to {email}</Text>

        <TextInput
          style={styles.input}
          placeholder="Enter Email Confirmation Code Here"
          value={confirmationCode}
          onChangeText={setConfirmationCode}
          keyboardType="number-pad"
          editable={!secondLoading}
        />

        <View>
          <TextInput
            style={[styles.input, styles.passInput]}
            placeholder="Enter New Password Here"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry={!showPassword}
            editable={!secondLoading}
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
          style={[styles.input, styles.passInput]}
          placeholder="Confirm Your New Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showPassword}
          editable={!secondLoading}
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
          onPress={handleReset}
          disabled={secondLoading || newPassword.trim() === "" ||
                confirmPassword.trim() === "" || confirmationCode.trim() === ""
                || !requirementsMet}
        >
          <LinearGradient
            colors={ secondLoading || newPassword.trim() === "" ||
                    confirmPassword.trim() === "" || confirmationCode.trim() === ""
                    || !requirementsMet
                    ? ['#a8a4a4ef', '#a8a4a4ef', '#a8a4a4ef']
                    : ['#1b3decff', '#9420ceff', '#4709b1ff']
            }
            locations={[0, 0.5, 1]}
            start={{x: 0, y: 0}}
            end={{ x: 1, y: 0}}
            style={[styles.button, styles.firstBtn]}
          >
            {secondLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Reset Password</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.resendButton, secondLoading && styles.buttonDisabled]}
          onPress={resendConfirmationCode}
          disabled={secondLoading}
        >

        {secondLoading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.buttonText}>Resend Confirmation Code</Text>
        )}
        </TouchableOpacity>

        {/* <TouchableOpacity
          onPress={() => {
            setShowConfirm(false);
            setModalVisible(false);
          }} disabled={loading}>
          <Text style={styles.link}>Back to Sign Up</Text>
        </TouchableOpacity> */}

        <CustomModal
          visible={modalVisible}
          title={modalContent.title}
          message={modalContent.message}
          type={modalContent.type}
          onClose={() => setModalVisible(false)}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  )
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
    borderRadius: width * 0.020,
    alignItems: "center",
    marginTop: width * 0.05,
  },
  firstBtn: {
    marginTop: width * 0.10,
  },
  confirmButton: {
    backgroundColor: '#32af16ff',
  },
  buttonDisabled: {
    backgroundColor: '#a8a4a4ef',
  },
  resendButton: {
    backgroundColor: '#ec1c1cff',
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
    marginTop: width * 0.025,
    marginBottom: width * 0.075,
    fontSize: width * 0.035,
  },
});

