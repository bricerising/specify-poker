# Feature Specification: UI Application

**Application**: `@specify-poker/ui`
**Created**: 2026-01-12
**Status**: In Development

## Overview

The UI Application is a React-based single-page application that provides the
player-facing interface for the poker platform. It connects to the Gateway
Service via WebSocket for real-time gameplay updates and HTTP for REST
operations. The application handles authentication via Keycloak OIDC, provides
an immersive poker table experience, and integrates with web push notifications.

## User Scenarios & Testing

### User Story 1 - Authentication Flow (Priority: P1)

As a player, I can securely log in using Keycloak OIDC and maintain my session
while using the application.

**Why this priority**: Authentication is the entry point for all functionality;
without it, users cannot access any features.

**Independent Test**: A user visits the app, clicks login, is redirected to
Keycloak, authenticates, and returns to the app with a valid session.

**Acceptance Scenarios**:

1. **Given** an unauthenticated user, **When** they visit the app, **Then**
   they see a login prompt with clear branding.
2. **Given** a user clicking login, **When** they complete Keycloak auth,
   **Then** they are redirected back and automatically signed in.
3. **Given** an authenticated user, **When** their token expires, **Then**
   they are prompted to re-authenticate gracefully.
4. **Given** an authenticated user, **When** they click sign out, **Then**
   their local session is cleared and they return to the login screen.

---

### User Story 2 - Lobby Experience (Priority: P1)

As a player, I can view available tables in the lobby and see real-time updates
as tables are created or seats fill.

**Why this priority**: The lobby is the primary navigation point for finding
and joining games.

**Independent Test**: A user views the lobby, sees a list of tables with
occupancy info, and the list updates in real-time as other users join.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** they view the lobby, **Then**
   they see a list of all available tables with name, blinds, and seat count.
2. **Given** a user in the lobby, **When** another user joins a table,
   **Then** the seat count updates in real-time without page refresh.
3. **Given** a user, **When** they want to create a table, **Then** they
   can fill out a form with table name and configuration options.
4. **Given** a user viewing a table, **When** they click to join, **Then**
   they are presented with available seat options.

---

### User Story 2b - Spectator Mode (Priority: P1)

As a spectator, I can watch a table without taking a seat, receiving public
game state updates without private information.

**Why this priority**: Spectating supports social engagement and allows users
to observe before committing to a seat.

**Independent Test**: A user subscribes to watch a table, sees community cards
and player stacks, but never receives hole cards.

**Acceptance Scenarios**:

1. **Given** a user in the lobby, **When** they choose to spectate a table,
   **Then** they receive the current table state with public information only.
2. **Given** a spectator, **When** a hand progresses, **Then** they see
   community cards, pot sizes, and player actions but no hole cards.
3. **Given** a spectator, **When** they decide to join, **Then** they can
   transition from spectator to seated player.
4. **Given** a spectator, **When** they leave the table view, **Then** they
   cleanly unsubscribe from updates.

---

### User Story 3 - Table Gameplay (Priority: P1)

As a seated player, I can participate in poker hands with intuitive controls
for betting, folding, and viewing the game state.

**Why this priority**: Core gameplay is the primary product value.

**Independent Test**: A user joins a table, sees their hole cards, uses action
controls to bet/fold, and sees the hand progress through all streets.

**Acceptance Scenarios**:

1. **Given** a seated player, **When** a hand starts, **Then** they see their
   private hole cards and the table state updates.
2. **Given** a player whose turn it is, **When** they look at controls, **Then**
   they see only legal actions (fold, check, call, raise) with correct amounts.
3. **Given** a player making a raise, **When** they use the slider, **Then**
   they can select any legal amount between min raise and all-in.
4. **Given** a player, **When** the hand reaches showdown, **Then** they see
   revealed cards and pot distribution.
5. **Given** a player, **When** they leave the table, **Then** their stack is
   cashed out and they return to the lobby.

---

### User Story 4 - Turn Timer Display (Priority: P1)

As a player, I can see a visual countdown when it's my turn or another player's
turn to act.

**Why this priority**: Turn timers are essential for game flow and fairness.

**Independent Test**: When it becomes a player's turn, a countdown timer appears
and updates in real-time until action is taken or time expires.

**Acceptance Scenarios**:

1. **Given** a player at a table, **When** it becomes their turn, **Then**
   they see a prominent countdown timer.
2. **Given** a player watching others, **When** it's another player's turn,
   **Then** they see that player's timer.
3. **Given** an approaching deadline, **When** time is low, **Then** the
   timer displays urgency (e.g., color change).
4. **Given** a player who times out, **When** auto-action occurs, **Then**
   the UI reflects the forced fold/check.

---

### User Story 5 - Chat Interaction (Priority: P2)

As a seated player, I can send and receive chat messages with other players
at my table.

**Why this priority**: Chat enhances social experience but is not required for
core gameplay.

**Independent Test**: A user sends a chat message, it appears in the chat panel,
and other players see it in real-time.

**Acceptance Scenarios**:

1. **Given** a seated player, **When** they type and send a message, **Then**
   the message appears in the table chat.
2. **Given** a table with chat activity, **When** messages arrive, **Then**
   they display with sender name and timestamp.
3. **Given** a muted player, **When** they attempt to send a message, **Then**
   they see an error indicating they are muted.
4. **Given** a user joining a table, **When** chat history exists, **Then**
   they see recent messages from before they joined.

---

### User Story 6 - Profile Management (Priority: P2)

As a player, I can view and update my profile including nickname and avatar.

**Why this priority**: Profiles personalize the experience but are not required
for gameplay.

**Independent Test**: A user navigates to profile, updates their nickname, and
sees the change reflected in the header and at tables.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** they view their profile, **Then**
   they see their current nickname, avatar, and statistics.
2. **Given** a user editing profile, **When** they change their nickname,
   **Then** the change is saved and reflected throughout the app.
3. **Given** a user, **When** they update their avatar URL, **Then** the new
   avatar displays in the header and at tables.

---

### User Story 7 - Friends List (Priority: P3)

As a player, I can manage a list of friends to track other players.

**Why this priority**: Friends list is a social enhancement, not required for
gameplay.

**Independent Test**: A user adds another player as a friend, sees them in their
friends list, and can remove them.

**Acceptance Scenarios**:

1. **Given** a user, **When** they view their friends list, **Then** they see
   friend profiles with nicknames and avatars.
2. **Given** a user, **When** they add a friend by user ID, **Then** that
   player appears in their friends list.
3. **Given** a user with friends, **When** they remove a friend, **Then**
   that player is removed from the list.

---

### User Story 8 - Push Notifications (Priority: P2)

As a player, I can receive push notifications when it's my turn to act, even
when the app is in the background.

**Why this priority**: Push notifications improve engagement and reduce missed
turns.

**Independent Test**: A user enables push notifications, minimizes the app,
and receives a notification when it's their turn.

**Acceptance Scenarios**:

1. **Given** a user with a modern browser, **When** they first authenticate,
   **Then** they are prompted to enable push notifications.
2. **Given** a user with push enabled, **When** it becomes their turn and the
   app is backgrounded, **Then** they receive a push notification.
3. **Given** a user, **When** they click a push notification, **Then** they
   are taken directly to the relevant table.

---

### Edge Cases

- WebSocket connection drops mid-hand (reconnect and resync).
- User opens app in multiple browser tabs.
- User's JWT expires during active gameplay.
- Network latency causes state desync (version tracking).
- User attempts action after hand has ended.
- Browser does not support push notifications.
- Mobile viewport constraints on table layout.
- User navigates away and back during hand.
- Chat panel scrolls while new messages arrive.
- Slider precision for small bet amounts.

## Constitution Requirements

- **Responsive Design**: UI MUST be usable on desktop, tablet, and mobile viewports.
- **Accessibility**: UI SHOULD follow WCAG 2.1 AA guidelines for color contrast
  and keyboard navigation.
- **State Synchronization**: Client state MUST stay synchronized with server via
  version tracking; stale updates MUST be rejected.
- **Security**: Tokens MUST be stored securely and never exposed in URLs beyond
  initial auth callback.
- **Performance**: UI MUST render updates within 100ms of receiving WebSocket
  messages.
- **Observability**: UI MUST send telemetry to the observability stack for
  error tracking and user journey analysis.

## Requirements

### Functional Requirements

- **FR-001**: Application MUST authenticate users via Keycloak OIDC.
- **FR-002**: Application MUST display lobby with real-time table updates.
- **FR-003**: Application MUST allow users to create tables with custom config.
- **FR-004**: Application MUST allow users to join available seats.
- **FR-005**: Application MUST display private hole cards only to card owner.
- **FR-006**: Application MUST provide action controls (fold, check, call, raise).
- **FR-007**: Application MUST display pot sizes and community cards.
- **FR-008**: Application MUST show turn timer with countdown.
- **FR-009**: Application MUST support chat messaging at tables.
- **FR-010**: Application MUST support profile viewing and editing.
- **FR-011**: Application MUST support friends list management.
- **FR-012**: Application MUST handle WebSocket reconnection automatically.
- **FR-013**: Application MUST track state versions and request resync on gaps.
- **FR-014**: Application MUST request push notification permissions.
- **FR-015**: Application MUST send telemetry for key user actions.
- **FR-016**: Application MUST support spectator mode for watching tables.
- **FR-017**: Application MUST display spectator count on tables.
- **FR-018**: Application MUST allow spectators to transition to seated players.

### Non-Functional Requirements

- **NFR-001**: Initial page load MUST complete within 3 seconds on 3G connection.
- **NFR-002**: WebSocket message handling MUST complete within 50ms.
- **NFR-003**: UI MUST maintain 60fps during animations and transitions.
- **NFR-004**: Bundle size MUST be under 500KB gzipped.
- **NFR-005**: Application MUST work in Chrome, Firefox, Safari, and Edge (latest 2 versions).
- **NFR-006**: Application MUST be usable without JavaScript for initial content.
- **NFR-007**: Application MUST maintain at least 80% unit test coverage for state logic.

### Key Components

- **AppRoot**: Authentication wrapper and routing.
- **LobbyPage**: Table list and creation form.
- **TablePage**: Game interface with seats, pot, and controls.
- **ActionBar**: Betting controls with slider and action buttons.
- **ChatPanel**: Real-time chat interface.
- **ProfilePage**: Profile viewing and editing form.
- **FriendsPage**: Friends list management.
- **TableStore**: Centralized state management for table data.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 95% of users complete authentication flow without error.
- **SC-002**: 99% of table updates render within 100ms of WebSocket receipt.
- **SC-003**: 90% of push notification prompts are accepted by users.
- **SC-004**: Chat message round-trip time under 500ms.
- **SC-005**: WebSocket reconnection succeeds within 5 seconds in 95% of cases.

## Assumptions

- Users have modern browsers with WebSocket support.
- Keycloak is configured with correct realm and client settings.
- Gateway service is available and handling WebSocket connections.
- VAPID keys are configured for push notification support.
- Users have reasonable network connectivity (3G or better).
