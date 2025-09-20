// amplify/data/resource.ts
import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  User: a
    .model({
      username: a.string().required(),
      email: a.string().required(),
      latitude: a.float(),
      longitude: a.float(),
      locationUpdatedAt: a.datetime(), // Fixed: Added this missing field
      isLocationSharing: a.boolean().default(true),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read']),
    ]),

  Friend: a
    .model({
      userId: a.id().required(),
      friendId: a.id().required(),
    })
    .authorization((allow) => [
      allow.authenticated(),
    ]),

  FriendRequest: a
    .model({
      senderId: a.id().required(),
      receiverId: a.id().required(),
      status: a.enum(['PENDING', 'ACCEPTED', 'REJECTED']),
      senderUsername: a.string(),
      receiverUsername: a.string(),
    })
    .authorization((allow) => [
      allow.authenticated(),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});