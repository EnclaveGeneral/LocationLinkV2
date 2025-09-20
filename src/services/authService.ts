import { Amplify } from 'aws-amplify';

export const authService = {
  async signUp(email: string, password: string, username: string) {
    try {
      const { signUp } = await import('aws-amplify/auth');
      const result = await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
            preferred_username: username,
          },
        },
      });
      return result;
    } catch (error) {
      throw error;
    }
  },

  async confirmSignUp(email: string, code: string) {
    try {
      const { confirmSignUp } = await import('aws-amplify/auth');
      await confirmSignUp({
        username: email,
        confirmationCode: code,
      });
      return true;
    } catch (error) {
      throw error;
    }
  },

  async signIn(email: string, password: string) {
    try {
      const { signIn } = await import('aws-amplify/auth');
      await signIn({
        username: email,
        password,
      });
      return true;
    } catch (error) {
      throw error;
    }
  },

  async signOut() {
    try {
      const { signOut } = await import('aws-amplify/auth');
      await signOut();
    } catch (error) {
      throw error;
    }
  },

  async getCurrentUser() {
    try {
      const { getCurrentUser } = await import('aws-amplify/auth');
      const user = await getCurrentUser();
      return user;
    } catch {
      return null;
    }
  },

  async fetchUserAttributes() {
    try {
      const { fetchUserAttributes } = await import('aws-amplify/auth');
      const attributes = await fetchUserAttributes();
      return attributes;
    } catch {
      return null;
    }
  }
};
