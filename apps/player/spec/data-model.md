# Data Model: Player Service

## Entities

### Profile

- **Fields**: userId, nickname, avatarUrl, preferences, createdAt, updatedAt
- **Validation**: nickname 1-30 chars, avatarUrl valid URL or null
- **Relationships**: 1:1 with Statistics, 1:1 with FriendsList

```typescript
interface Profile {
  userId: string;           // From identity provider (Keycloak)
  nickname: string;         // Display name, 1-30 chars
  avatarUrl: string | null; // URL to avatar image
  preferences: UserPreferences;
  createdAt: string;        // ISO timestamp
  updatedAt: string;        // ISO timestamp
}

interface UserPreferences {
  soundEnabled: boolean;
  chatEnabled: boolean;
  showHandStrength: boolean;
  theme: "light" | "dark" | "auto";
}
```

### Statistics

- **Fields**: userId, handsPlayed, wins, vpip, pfr, lastUpdated
- **Validation**: All counts >= 0
- **Notes**: Updated asynchronously from Event Service

```typescript
interface Statistics {
  userId: string;
  handsPlayed: number;      // Total hands participated
  wins: number;             // Hands where user won any pot
  vpip: number;             // Voluntarily put in pot % (0-100)
  pfr: number;              // Pre-flop raise % (0-100)
  allInCount: number;       // Times gone all-in
  biggestPot: number;       // Largest pot won
  lastUpdated: string;      // ISO timestamp
}
```

### FriendsList

- **Fields**: userId, friendIds, updatedAt
- **Validation**: friendIds are valid user IDs
- **Notes**: One-directional friendship

```typescript
interface FriendsList {
  userId: string;
  friendIds: string[];      // Array of friend user IDs
  updatedAt: string;
}
```

### ProfileSummary

- **Fields**: Projection for display in other contexts
- **Notes**: Read-only, cached aggressively

```typescript
interface ProfileSummary {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
}
```

### FriendProfile

- **Fields**: Friend with profile info
- **Notes**: Join of FriendsList and Profile

```typescript
interface FriendProfile {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  status?: "online" | "offline";  // From Gateway presence
}
```

## Storage Notes

- **Profiles**: PostgreSQL for durability, Redis cache for reads.
- **Statistics**: PostgreSQL, updated in batches from Event Service.
- **FriendsLists**: PostgreSQL with array type, cached in Redis.
- **Deleted users**: Soft delete with anonymization, then hard delete after 30 days.

## PostgreSQL Schema

```sql
CREATE TABLE profiles (
  user_id VARCHAR(255) PRIMARY KEY,
  nickname VARCHAR(30) NOT NULL,
  avatar_url TEXT,
  preferences JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_profiles_nickname ON profiles(nickname);
CREATE INDEX idx_profiles_deleted ON profiles(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE statistics (
  user_id VARCHAR(255) PRIMARY KEY REFERENCES profiles(user_id) ON DELETE CASCADE,
  hands_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  vpip DECIMAL(5,2) NOT NULL DEFAULT 0,
  pfr DECIMAL(5,2) NOT NULL DEFAULT 0,
  all_in_count INTEGER NOT NULL DEFAULT 0,
  biggest_pot INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE friends (
  user_id VARCHAR(255) NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  friend_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, friend_id)
);

CREATE INDEX idx_friends_user ON friends(user_id);
```

## Redis Key Namespace

```
player:profiles:{userId}              # Profile JSON (TTL: 5min)
player:profiles:by-nickname:{nick}    # userId (for lookup)

player:stats:{userId}                 # Statistics JSON (TTL: 1min)

player:friends:{userId}               # Set of friend userIds (TTL: 5min)

player:deleted:{userId}               # Marker for deleted users (TTL: 30d)
```

## gRPC Service Definition

```protobuf
service PlayerService {
  // Profile management
  rpc GetProfile(GetProfileRequest) returns (Profile);
  rpc GetProfiles(GetProfilesRequest) returns (GetProfilesResponse);
  rpc UpdateProfile(UpdateProfileRequest) returns (Profile);
  rpc DeleteProfile(DeleteProfileRequest) returns (Empty);

  // Statistics
  rpc GetStatistics(GetStatisticsRequest) returns (Statistics);
  rpc IncrementStatistic(IncrementStatisticRequest) returns (Statistics);

  // Friends
  rpc GetFriends(GetFriendsRequest) returns (GetFriendsResponse);
  rpc AddFriend(AddFriendRequest) returns (Empty);
  rpc RemoveFriend(RemoveFriendRequest) returns (Empty);

  // Batch operations
  rpc GetNicknames(GetNicknamesRequest) returns (GetNicknamesResponse);
}
```

## Relationships

- **Profile** 1:1 **Statistics**
- **Profile** 1:1 **FriendsList**
- **Profile** N:M **Profile** (via FriendsList)

## State Transitions

### Profile Lifecycle

```
(none) -> ACTIVE (first access, auto-create)
ACTIVE -> ACTIVE (updates)
ACTIVE -> DELETED (deletion request)
DELETED -> (purged) (30-day hard delete)
```

## Consistency Guarantees

- **Profiles**: Strong consistency for writes, eventual for reads (cache).
- **Statistics**: Eventually consistent, updated in batches.
- **Friends**: Strong consistency for mutations.
- **Deletion**: Soft delete immediate, hard delete after 30 days.

## Privacy & GDPR

### Data Subject Rights

1. **Right to Access**: GetProfile returns all user data.
2. **Right to Rectification**: UpdateProfile allows corrections.
3. **Right to Erasure**: DeleteProfile removes all personal data.
4. **Right to Portability**: GetProfile returns exportable format.

### Deletion Process

1. Profile marked as deleted (soft delete).
2. Nickname changed to "Deleted User".
3. Avatar URL cleared.
4. Statistics retained but anonymized.
5. Friends lists updated to remove deleted user.
6. After 30 days, hard delete from database.

### Data Retention

- Active profiles: Indefinite while account active.
- Statistics: Retained for analytics after anonymization.
- Deleted profiles: Purged after 30-day grace period.
