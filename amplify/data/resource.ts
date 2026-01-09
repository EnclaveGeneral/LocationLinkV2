// amplify/data/resource.ts
import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { acceptFriendRequestFunction } from '../functions/accept-friend-request/resource';
import { removeFriendFunction } from '../functions/remove-friend/resource';
import { getMessagesFunction } from '../functions/get-messages/resource';
import { updateMessageStatusFunction } from '../functions/update-message-status/resource';
import { deleteConversationFunction } from '../functions/delete-conversation/resource';

const schema = a.schema({
  User: a
    .model({
      username: a.string().required(),
      email: a.string().required(),
      phoneNumber: a.string(),
      avatarKey: a.string(),
      latitude: a.float(),
      longitude: a.float(),
      locationUpdatedAt: a.datetime(),
      isLocationSharing: a.boolean().default(true),
      isOnline: a.boolean().default(false),
      lastSeenAt: a.datetime(),
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

  ChatConversation: a
    .model({
      conversationId: a.id().required(),
      participant1Id: a.id().required(),
      participant2Id: a.id().required(),

      lastMessageText: a.string(),
      lastMessageTimestamp: a.datetime(),
      lastMessageSenderId: a.id(),

      unreadCountUser1: a.integer(),
      unreadCountUser2: a.integer(),
    })
    .authorization((allow) => [
      allow.ownerDefinedIn('participant1Id'),
      allow.ownerDefinedIn('participant2Id'),
    ])
    .identifier(['conversationId'])
    .secondaryIndexes((index) => [
      index('participant1Id'),
      index('participant2Id'),
    ]),

  ChatMessage: a
    .model({
      messageId: a.id().required(),
      conversationId: a.id().required(),
      senderId: a.id().required(),
      receiverId: a.id().required(),
      content: a.string().required(),
      timestamp: a.datetime().required(),
      status: a.enum(['sent', 'delivered']),
    })
    .authorization((allow) => [
      allow.authenticated().to(['read', 'create']),
    ])
    .identifier(['messageId'])
    .secondaryIndexes((index) => [
      index('conversationId'),
    ]),



  WebSocketConnection: a
    .model({
      connectionId: a.string().required(),
      userId: a.id().required(),
      connectedAt: a.datetime().required(),
      lastPingAt: a.datetime(),
    })
    .authorization((allow) => [
      allow.authenticated()
    ])
    .secondaryIndexes((index) => [
      index('userId')
        .name('webSocketConnectionsByUserId')
    ]),

  // Keep your Lambda mutations
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

  getMessagesQuery: a
    .query()
    .arguments({
      conversationId: a.string().required(),
      limit: a.integer(),
    })
    .returns(a.ref('ChatMessage').array())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(getMessagesFunction)),

  updateMessageStatus: a
    .mutation()
    .arguments({
      messageIds: a.string().array().required(),
      status: a.enum(['sent', 'delivered']),
    })
    .returns(
      a.customType({
        success: a.boolean().required(),
        message: a.string(),
      })
    )
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(updateMessageStatusFunction)),

  deleteConversation: a
    .mutation()
    .arguments({
      conversationId: a.string().required(),
    })
    .returns(
      a.customType({
        success: a.boolean().required(),
        message: a.string(),
      })
    )
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(deleteConversationFunction))
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});