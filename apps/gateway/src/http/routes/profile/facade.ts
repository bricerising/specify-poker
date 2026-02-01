import { grpc as defaultGrpc, type GatewayGrpc } from '../../../grpc/unaryClients';
import { isRecord } from '../../../utils/json';

export type PublicProfile = {
  userId: string;
  username: string;
  nickname: string;
  avatarUrl: string | null;
};

export type ProfileStats = {
  handsPlayed: number;
  wins: number;
};

export type UserProfile = PublicProfile & {
  stats: ProfileStats;
  friends: string[];
};

type PreferencesInput = {
  soundEnabled?: boolean;
  chatEnabled?: boolean;
  showHandStrength?: boolean;
  theme?: string;
};

export type UpdateProfileBody = {
  nickname?: string;
  avatarUrl?: string | null;
  preferences?: PreferencesInput;
};

export type ProfileFacade = {
  getMe(params: { userId: string; username?: string | null }): Promise<UserProfile>;
  updateMe(params: {
    userId: string;
    username?: string | null;
    body: unknown;
    idempotencyKey: string;
  }): Promise<UserProfile>;
  deleteMe(params: { userId: string; idempotencyKey: string }): Promise<{ success: boolean }>;
  getStatistics(params: { userId: string }): Promise<Record<string, unknown>>;
  getProfile(params: { userId: string }): Promise<PublicProfile>;
  getFriendIds(params: { userId: string }): Promise<string[]>;
  syncFriends(params: {
    userId: string;
    desiredFriendIds: unknown[];
    idempotencyKey: string;
  }): Promise<string[]>;
  addFriend(params: { userId: string; friendId: string; idempotencyKey: string }): Promise<void>;
  removeFriend(params: { userId: string; friendId: string; idempotencyKey: string }): Promise<void>;
  getNicknames(params: { userIds: unknown[] }): Promise<Array<Record<string, unknown>>>;
};

type ProfileFacadeDeps = {
  grpcPlayer: GatewayGrpc['player'];
};

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeProfile(profile: unknown, fallbackUserId: string): PublicProfile {
  const record = isRecord(profile) ? profile : {};
  const userId = readNonEmptyString(record.userId ?? record.user_id) ?? fallbackUserId;
  const username = readString(record.username);
  const nickname = readNonEmptyString(record.nickname) ?? 'Unknown';

  const avatarRaw = readNonEmptyString(record.avatarUrl ?? record.avatar_url);
  const avatarUrl = avatarRaw ?? null;

  return { userId, username, nickname, avatarUrl };
}

function normalizeStats(stats: unknown): ProfileStats {
  const record = isRecord(stats) ? stats : {};
  return {
    handsPlayed: readNumber(record.handsPlayed ?? record.hands_played, 0),
    wins: readNumber(record.wins, 0),
  };
}

function normalizeFriendIds(friends: unknown): string[] {
  if (!Array.isArray(friends)) {
    return [];
  }

  return friends
    .map((friend) => {
      if (!isRecord(friend)) {
        return null;
      }
      return readNonEmptyString(friend.userId ?? friend.user_id);
    })
    .filter((id): id is string => Boolean(id));
}

function normalizeUserProfile(params: {
  profile: unknown;
  stats: unknown;
  friends: unknown;
  fallbackUserId: string;
  usernameOverride?: string | null;
}): UserProfile {
  const profile = normalizeProfile(params.profile, params.fallbackUserId);
  const username =
    params.usernameOverride && profile.username.length === 0
      ? params.usernameOverride
      : profile.username;

  return {
    ...profile,
    ...(username ? { username } : {}),
    stats: normalizeStats(params.stats),
    friends: normalizeFriendIds(params.friends),
  };
}

type UpdateProfileRequest = Parameters<GatewayGrpc['player']['UpdateProfile']>[0];

function buildUpdateProfileRequest(
  userId: string,
  body: unknown,
  idempotencyKey: string,
): UpdateProfileRequest {
  const updateRequest: UpdateProfileRequest = { user_id: userId, idempotency_key: idempotencyKey };
  const record = isRecord(body) ? body : {};

  const nickname = record.nickname;
  if (typeof nickname === 'string') {
    updateRequest.nickname = nickname;
  }

  const avatarUrl = record.avatarUrl;
  if (avatarUrl === null) {
    updateRequest.avatar_url = '';
  } else if (typeof avatarUrl === 'string') {
    updateRequest.avatar_url = avatarUrl;
  }

  const preferences = record.preferences;
  if (isRecord(preferences)) {
    const pref = preferences as Record<string, unknown>;
    updateRequest.preferences = {
      ...(typeof pref.soundEnabled === 'boolean' ? { sound_enabled: pref.soundEnabled } : {}),
      ...(typeof pref.chatEnabled === 'boolean' ? { chat_enabled: pref.chatEnabled } : {}),
      ...(typeof pref.showHandStrength === 'boolean'
        ? { show_hand_strength: pref.showHandStrength }
        : {}),
      ...(typeof pref.theme === 'string' ? { theme: pref.theme } : {}),
    };
  }

  return updateRequest;
}

function normalizeDesiredFriendIds(userId: string, desired: unknown[]): string[] {
  return desired
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0 && entry !== userId);
}

function normalizeUserIds(userIds: unknown[]): string[] {
  return userIds
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
}

export function createProfileFacade(overrides: Partial<ProfileFacadeDeps> = {}): ProfileFacade {
  const deps: ProfileFacadeDeps = {
    grpcPlayer: overrides.grpcPlayer ?? defaultGrpc.player,
  };

  async function getMe(params: { userId: string; username?: string | null }): Promise<UserProfile> {
    const username = params.username ?? undefined;

    const [profileResponse, statsResponse, friendsResponse] = await Promise.all([
      deps.grpcPlayer.GetProfile({ user_id: params.userId, ...(username ? { username } : {}) }),
      deps.grpcPlayer.GetStatistics({ user_id: params.userId }),
      deps.grpcPlayer.GetFriends({ user_id: params.userId }),
    ]);

    return normalizeUserProfile({
      profile: profileResponse.profile,
      stats: statsResponse.statistics,
      friends: (friendsResponse as { friends?: unknown }).friends,
      fallbackUserId: params.userId,
      usernameOverride: params.username,
    });
  }

  async function updateMe(params: {
    userId: string;
    username?: string | null;
    body: unknown;
    idempotencyKey: string;
  }): Promise<UserProfile> {
    const username = params.username ?? undefined;
    const updateRequest = buildUpdateProfileRequest(
      params.userId,
      params.body,
      params.idempotencyKey,
    );

    const updateResponse = await deps.grpcPlayer.UpdateProfile(updateRequest);

    const [statsResponse, friendsResponse] = await Promise.all([
      deps.grpcPlayer.GetStatistics({ user_id: params.userId }),
      deps.grpcPlayer.GetFriends({ user_id: params.userId }),
    ]);

    return normalizeUserProfile({
      profile: updateResponse.profile,
      stats: statsResponse.statistics,
      friends: (friendsResponse as { friends?: unknown }).friends,
      fallbackUserId: params.userId,
      usernameOverride: username ?? null,
    });
  }

  async function deleteMe(params: {
    userId: string;
    idempotencyKey: string;
  }): Promise<{ success: boolean }> {
    return deps.grpcPlayer.DeleteProfile({
      user_id: params.userId,
      idempotency_key: params.idempotencyKey,
    });
  }

  async function getStatistics(params: { userId: string }): Promise<Record<string, unknown>> {
    const response = await deps.grpcPlayer.GetStatistics({ user_id: params.userId });
    return response.statistics as Record<string, unknown>;
  }

  async function getProfile(params: { userId: string }): Promise<PublicProfile> {
    const response = await deps.grpcPlayer.GetProfile({ user_id: params.userId });
    return normalizeProfile(response.profile, params.userId);
  }

  async function getFriendIds(params: { userId: string }): Promise<string[]> {
    const response = await deps.grpcPlayer.GetFriends({ user_id: params.userId });
    return normalizeFriendIds((response as { friends?: unknown }).friends);
  }

  async function syncFriends(params: {
    userId: string;
    desiredFriendIds: unknown[];
    idempotencyKey: string;
  }): Promise<string[]> {
    const desiredIds = normalizeDesiredFriendIds(params.userId, params.desiredFriendIds);
    const desiredSet = new Set(desiredIds);

    const currentResponse = await deps.grpcPlayer.GetFriends({ user_id: params.userId });
    const currentIds = new Set(
      normalizeFriendIds((currentResponse as { friends?: unknown }).friends),
    );

    for (const friendId of desiredSet) {
      if (currentIds.has(friendId)) {
        continue;
      }
      await deps.grpcPlayer.AddFriend({
        user_id: params.userId,
        friend_id: friendId,
        idempotency_key: `${params.idempotencyKey}:add:${friendId}`,
      });
    }

    for (const friendId of currentIds) {
      if (desiredSet.has(friendId)) {
        continue;
      }
      await deps.grpcPlayer.RemoveFriend({
        user_id: params.userId,
        friend_id: friendId,
        idempotency_key: `${params.idempotencyKey}:remove:${friendId}`,
      });
    }

    return Array.from(desiredSet.values());
  }

  async function addFriend(params: {
    userId: string;
    friendId: string;
    idempotencyKey: string;
  }): Promise<void> {
    await deps.grpcPlayer.AddFriend({
      user_id: params.userId,
      friend_id: params.friendId,
      idempotency_key: params.idempotencyKey,
    });
  }

  async function removeFriend(params: {
    userId: string;
    friendId: string;
    idempotencyKey: string;
  }): Promise<void> {
    await deps.grpcPlayer.RemoveFriend({
      user_id: params.userId,
      friend_id: params.friendId,
      idempotency_key: params.idempotencyKey,
    });
  }

  async function getNicknames(params: {
    userIds: unknown[];
  }): Promise<Array<Record<string, unknown>>> {
    const response = await deps.grpcPlayer.GetNicknames({
      user_ids: normalizeUserIds(params.userIds),
    });
    return (response.nicknames ?? []) as Array<Record<string, unknown>>;
  }

  return {
    getMe,
    updateMe,
    deleteMe,
    getStatistics,
    getProfile,
    getFriendIds,
    syncFriends,
    addFriend,
    removeFriend,
    getNicknames,
  };
}
