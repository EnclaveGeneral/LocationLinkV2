// src/services/amplifyConfig.ts
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import outputs from '../../amplify_outputs.json';
import type { Schema } from '../../amplify/data/resource';

// Configure Amplify
Amplify.configure(outputs);

// Create and export the typed client
export const client = generateClient<Schema>();

// For backward compatibility if needed
export const getClient = () => client;