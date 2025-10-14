// src/services/authService.ts
import { signUp, signIn, signOut, confirmSignUp, getCurrentUser, fetchUserAttributes, resendSignUpCode } from 'aws-amplify/auth';

export const authService = {
  async signUp(email: string, password: string, username: string, phoneNumber: string) {
    const result = await signUp({
      username: email,
      password,
      options: {
        userAttributes: {
          email,
          preferred_username: username,
          phone_number: phoneNumber,
        },
      },
    });
    return result;
  },

  async confirmSignUp(email: string, code: string) {
    const result = await confirmSignUp({
      username: email,
      confirmationCode: code,
    });
    return result.isSignUpComplete;
  },

  async resendConfirmationCode (email: string) {
    const result = await resendSignUpCode({
      username: email,
    });
    return result;
  },

  async signIn(email: string, password: string) {
    const result = await signIn({
      username: email,
      password,
    });
    return result.isSignedIn;
  },

  async signOut() {
    await signOut();
  },

  async getCurrentUser() {
    try {
      const { username, userId } = await getCurrentUser();
      return { username, userId };
    } catch {
      return null;
    }
  },

  async fetchUserAttributes() {
    try {
      const attributes = await fetchUserAttributes();
      return attributes;
    } catch {
      return null;
    }
  }
};