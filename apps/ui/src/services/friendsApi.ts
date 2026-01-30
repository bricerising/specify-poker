import { api } from './apiClient';
import type { ApiClient } from './apiClient';
import { createJsonApiClient } from './jsonApiClient';
import { asRecord, readStringArray } from '../utils/unknown';

export type FriendsApi = {
  fetchFriends(): Promise<string[]>;
  updateFriends(friends: string[]): Promise<string[]>;
};

function decodeFriendsResponse(payload: unknown): string[] {
  const record = asRecord(payload);
  if (!record) {
    throw new Error('Invalid friends response');
  }
  if (!Array.isArray(record.friends)) {
    throw new Error('Invalid friends response');
  }
  return readStringArray(record.friends);
}

export function createFriendsApi(client: ApiClient): FriendsApi {
  const jsonClient = createJsonApiClient(client);

  const fetchFriends: FriendsApi['fetchFriends'] = () => {
    return jsonClient.requestDecoded('/api/friends', decodeFriendsResponse);
  };

  const updateFriends: FriendsApi['updateFriends'] = (friends) => {
    return jsonClient.requestDecoded('/api/friends', decodeFriendsResponse, {
      method: 'PUT',
      json: { friends },
    });
  };

  return { fetchFriends, updateFriends };
}

export const friendsApi = createFriendsApi(api);

export const fetchFriends: FriendsApi['fetchFriends'] = (...args) => friendsApi.fetchFriends(...args);
export const updateFriends: FriendsApi['updateFriends'] = (...args) =>
  friendsApi.updateFriends(...args);
