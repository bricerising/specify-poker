# Feature Specification: Player Service

**Service**: `@specify-poker/player`
**Created**: 2026-01-12
**Status**: Planned

## Overview

The Player Service manages user profiles, social connections (friends), and
aggregate statistics. It serves as the identity layer for the poker application,
providing nicknames, avatars, and player data to other services. It is designed
with GDPR compliance in mind, with clear data ownership and deletion capabilities.

## User Scenarios & Testing

### User Story 1 - Profile Management (Priority: P1)

As a player, I can create and update my profile with a nickname and avatar
that are displayed to other players.

**Why this priority**: Profiles are essential for user identity; without them,
players are anonymous and the social experience suffers.

**Independent Test**: A user creates a profile, updates their nickname, and
sees the change reflected in the lobby and at tables.

**Acceptance Scenarios**:

1. **Given** a new user, **When** they first access the system, **Then** a
   default profile is created with a generated nickname.
2. **Given** a user with a profile, **When** they update their nickname,
   **Then** the new nickname is reflected in all contexts.
3. **Given** a user with a profile, **When** they update their avatar URL,
   **Then** the new avatar is displayed in the lobby and at tables.

---

### User Story 2 - Player Statistics (Priority: P2)

As a player, I can view my aggregate statistics including hands played and
wins to track my progress.

**Why this priority**: Statistics enhance engagement but are not required for
core gameplay.

**Independent Test**: A user plays several hands, then views their profile
to see updated statistics.

**Acceptance Scenarios**:

1. **Given** a player who has played hands, **When** they view their profile,
   **Then** they see accurate hands played and wins counts.
2. **Given** a player who wins a pot, **When** statistics are updated,
   **Then** their wins count increments.

---

### User Story 3 - Friends List (Priority: P3)

As a player, I can maintain a list of friends for social features.

**Why this priority**: Friends list is a social enhancement, not required for
gameplay.

**Independent Test**: A user adds another user as a friend, the friend appears
in their list, and they can remove them.

**Acceptance Scenarios**:

1. **Given** a user, **When** they add another user as a friend, **Then**
   that user appears in their friends list.
2. **Given** a user with friends, **When** they view their friends list,
   **Then** they see friend profiles with nicknames and avatars.
3. **Given** a user with a friend, **When** they remove the friend, **Then**
   that user no longer appears in their friends list.

---

### User Story 4 - Data Deletion (Priority: P2)

As a player, I can request deletion of my profile data in compliance with
privacy regulations.

**Why this priority**: GDPR compliance is a legal requirement for EU users.

**Independent Test**: A user requests profile deletion, their profile is
removed, and other services no longer return their data.

**Acceptance Scenarios**:

1. **Given** a user requesting deletion, **When** the request is processed,
   **Then** their profile data is permanently deleted.
2. **Given** a deleted user, **When** other services query their profile,
   **Then** a placeholder or "deleted user" response is returned.

---

### Edge Cases

- User sets nickname that conflicts with another user.
- User sets avatar URL to invalid or inaccessible image.
- Friend request to non-existent user.
- Statistics update fails mid-transaction.
- Profile requested for user who never created one.
- Concurrent profile updates from multiple devices.

## Constitution Requirements

- **Data Ownership**: All profile data MUST be owned by the user and deletable
  upon request.
- **Privacy Compliance**: Service MUST support GDPR right-to-deletion.
- **Nickname Uniqueness**: Nicknames SHOULD be unique but MAY allow duplicates
  with disambiguation (e.g., display user ID suffix).
- **Statistics Accuracy**: Statistics MUST be eventually consistent with
  actual gameplay events.

## Requirements

### Functional Requirements

- **FR-001**: System MUST create default profiles for new users on first access.
- **FR-002**: System MUST allow users to update their nickname.
- **FR-003**: System MUST allow users to update their avatar URL.
- **FR-004**: System MUST track hands played count per user.
- **FR-005**: System MUST track wins count per user.
- **FR-006**: System MUST support adding users to friends list.
- **FR-007**: System MUST support removing users from friends list.
- **FR-008**: System MUST return friend profiles with nicknames and avatars.
- **FR-009**: System MUST support permanent deletion of user profile data.
- **FR-010**: System MUST expose gRPC API for internal service communication.
- **FR-011**: System MUST cache profiles for performance.
- **FR-012**: System MUST handle profile requests for deleted/non-existent users.
- **FR-013**: System MUST track daily logins and trigger daily bonus events.
- **FR-014**: System MUST track referrals and trigger referral reward events.

### Non-Functional Requirements

- **NFR-001**: Profile retrieval MUST complete within 50ms (cached).
- **NFR-002**: Profile updates MUST complete within 200ms.
- **NFR-003**: Service MUST support 10,000 profile lookups per second.
- **NFR-004**: System MUST maintain at least 80% unit test coverage across all core logic.
- **NFR-005**: Unit tests MUST reflect realistic consumer behavior and edge cases.

### Key Entities

- **Profile**: User identity with nickname, avatar, and preferences.
- **Statistics**: Aggregate gameplay statistics per user.
- **FriendsList**: User's list of friend user IDs.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of profile lookups return within 100ms.
- **SC-002**: 100% of deletion requests complete within 24 hours.
- **SC-003**: Statistics accuracy within 1% of actual events.
- **SC-004**: Cache hit rate above 90% for profile lookups.

## Assumptions

- User IDs are provided by external identity provider (Keycloak).
- Default nicknames are generated as "Player" + random suffix.
- Avatar URLs are validated but images are not hosted by this service.
- Friends list is one-directional (A friends B doesn't mean B friends A).
- Statistics are updated asynchronously from Event Service.
