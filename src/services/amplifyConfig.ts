// src/services/amplifyConfig.ts
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

// Create the typed client for data operations
export const client = generateClient<Schema>();

// For backward compatibility
export const getClient = () => client;