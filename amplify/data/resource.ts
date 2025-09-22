// amplify/data/resource.ts
import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  User: a
    .model({
      username: a.string().required(),
      email: a.string().required(),
      latitude: a.float(),
      longitude: a.float(),
      locationUpdatedAt: a.datetime(),
      isLocationSharing: a.boolean().default(true),
      friends: a.string().array(), // Keep for reference but NOT for authorization
    })
    .authorization((allow) => [
      allow.owner(),
      // Remove the ownerDefinedIn('friends') - it causes the sync issue!
      // Instead, we'll check friendship via the Friend model
    ]),

  PublicProfile: a
    .model({
      userId: a.id().required(),
      username: a.string().required(),
    })
    .authorization((allow) => [
      allow.authenticated().to(['read']),
      allow.owner(),
    ])
    .secondaryIndexes((index) => [
      index('username'),
    ]),

  Friend: a
    .model({
      userId: a.id().required(),
      friendId: a.id().required(),
      userUsername: a.string(),
      friendUsername: a.string(),
    })
    .authorization((allow) => [
      allow.ownerDefinedIn('userId'),
      allow.ownerDefinedIn('friendId'),
    ])
    .secondaryIndexes((index) => [
      index('userId'),
      index('friendId'),
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
      allow.ownerDefinedIn('senderId'),
      allow.ownerDefinedIn('receiverId'),
    ])
    .secondaryIndexes((index) => [
      index('senderId'),
      index('receiverId'),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});