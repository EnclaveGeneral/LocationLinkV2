import { defineAuth } from '@aws-amplify/backend';

export const auth = defineAuth({
  loginWith: {
    email: true,
    // phone: true // Currently WIP
  },
  userAttributes: {
    preferredUsername: {
      mutable: true,
      required: false,
    },
    phoneNumber: {
      mutable: true,
      required: false,
    }
  },

  accountRecovery: 'EMAIL_ONLY',

  multifactor: {
    mode: 'OFF',
  },
});
