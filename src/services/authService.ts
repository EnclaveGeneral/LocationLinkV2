// src/services/authService.ts
import { signUp, signIn, signOut, confirmSignUp, getCurrentUser, fetchUserAttributes, resendSignUpCode, resetPassword, confirmResetPassword } from 'aws-amplify/auth';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export const authService = {
  async signUp(email: string, password: string, username: string, phoneNumber: string) {

    // Build out the user profile and attributes conditionally based on available information
    const userAttributes: any = {
      email,
      preferred_username: username,
    }

    // Add phone number if provided in a valid format
    if (phoneNumber && phoneNumber.trim()) {
      const parsedNumber = parsePhoneNumberFromString(phoneNumber, 'US');
      if (parsedNumber && parsedNumber.isValid()) {
        userAttributes.phone_number = parsedNumber.number;
      } else {
        throw new Error('Invalid phone number format. Only a valid US phone number is accepted.');
      }
    }

    const result = await signUp({
      username: email,
      password: password,
      options: {
        userAttributes,
      }
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
  },

  async resetPassword(email: string) {
    try {
      const result = await resetPassword({
        username: email,
      });
      return result;
    } catch (error) {
      throw error;
    }
  },

  async confirmResetPassword(email: string, code: string, newPassword: string) {
    try {
      const result = await confirmResetPassword({
        username: email,
        confirmationCode: code,
        newPassword: newPassword,
      })
      return result;
    } catch (error) {
      throw error;
    }
  }
};