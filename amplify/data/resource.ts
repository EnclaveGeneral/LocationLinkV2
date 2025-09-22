// amplify/data/resource.ts
import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { acceptFriendRequestFunction } from '../functions/accept-friend-request/resource';
import { removeFriendFunction } from '../functions/remove-friend/resource';

const schema = a.schema({
  // Keep your existing models exactly as they are
  User: a
    .model({
      username: a.string().required(),
      email: a.string().required(),
      latitude: a.float(),
      longitude: a.float(),
      locationUpdatedAt: a.datetime(),
      isLocationSharing: a.boolean().default(true),
      friends: a.string().array(),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.ownersDefinedIn('friends').to(['read']),
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

  // NEW: Custom mutations that will be handled by Lambda functions
  acceptFriendRequestLambda: a
    .mutation()
    .arguments({
      requestId: a.string().required(),
    })
    .returns(
      a.customType({
        success: a.boolean().required(),
        message: a.string(),
      })
    )
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(acceptFriendRequestFunction)),

  removeFriendLambda: a
    .mutation()
    .arguments({
      friendId: a.string().required(),
    })
    .returns(
      a.customType({
        success: a.boolean().required(),
        message: a.string(),
      })
    )
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(removeFriendFunction)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});