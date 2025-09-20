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
      // Don't explicitly define viewers - it will be created implicitly
    })
    .authorization((allow) => [
      allow.owner(),
      allow.ownerDefinedIn('viewers').to(['read']),
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
      // Don't explicitly define owners - it will be created implicitly
    })
    .authorization((allow) => [
      allow.ownerDefinedIn('owners'),
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
      // Don't explicitly define owners - it will be created implicitly
    })
    .authorization((allow) => [
      allow.ownerDefinedIn('owners'),
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