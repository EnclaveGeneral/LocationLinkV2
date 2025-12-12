import { defineStorage } from "@aws-amplify/backend";

export const storage = defineStorage({
  name: 'profilePicStorage',
  access: (allow) => ({
    'profile-pictures/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete']),
      allow.authenticated.to(['read'])
    ],
  })
});

