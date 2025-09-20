import { Amplify } from 'aws-amplify';
import outputs from '../../amplify_outputs.json';

Amplify.configure(outputs);

// Create a generic client that we'll use with proper typing
export const getClient = () => {
  const { generateClient } = require('aws-amplify/data');
  return generateClient();
};
