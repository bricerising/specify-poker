import { apiFetchDecoded } from './apiClient';
import { asRecord, readStringArray } from '../utils/unknown';

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

export async function fetchFriends() {
  return apiFetchDecoded('/api/friends', decodeFriendsResponse);
}

export async function updateFriends(friends: string[]) {
  return apiFetchDecoded('/api/friends', decodeFriendsResponse, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ friends }),
  });
}
