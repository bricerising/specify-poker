# Tasks: UI Application

## Phase 1: Core Infrastructure

### T001: Initialize UI application package
- **File**: `package.json`
- **Acceptance**: `npm install` succeeds, TypeScript compiles
- **Dependencies**: react, react-dom, typescript, vite

### T002: Configure TypeScript
- **File**: `tsconfig.json`
- **Acceptance**: Strict mode enabled, JSX configured for React

### T003: Create application entry point
- **File**: `src/main.tsx`
- **Acceptance**: React app renders root component

### T004: Create static file server
- **File**: `server.mjs`
- **Acceptance**: Serves static files, handles SPA routing

### T005: Create Dockerfile
- **File**: `Dockerfile`
- **Acceptance**: `docker build` succeeds, container serves app

### T006: Create base HTML template
- **File**: `public/index.html`
- **Acceptance**: Contains root element, meta tags, and styles link

---

## Phase 2: Authentication

### T007: Implement Keycloak configuration
- **File**: `src/services/auth.ts`
- **Functions**: getAuthUrl, startLogin, hydrateTokenFromCallback
- **Acceptance**: Redirects to Keycloak, handles callback

### T008: Implement token management
- **File**: `src/services/auth.ts`
- **Functions**: getToken, isAuthenticated, clearToken
- **Acceptance**: Tokens stored in memory, available for API calls

### T009: Create authenticated API client
- **File**: `src/services/apiClient.ts`
- **Functions**: apiFetch, getApiBaseUrl
- **Acceptance**: Attaches auth headers, handles 401 responses

### T010: Implement auth UI flow
- **File**: `src/main.tsx`
- **Acceptance**: Shows login for anon, app for authed, loading during check

---

## Phase 3: Lobby Experience

### T011: Create lobby page component
- **File**: `src/pages/LobbyPage.tsx`
- **Acceptance**: Displays list of tables with occupancy

### T012: Implement table fetching
- **File**: `src/services/lobbyApi.ts`
- **Functions**: fetchTables
- **Acceptance**: Returns array of TableSummary objects

### T013: Create table creation form
- **File**: `src/components/CreateTableForm.tsx`
- **Acceptance**: Form for name, blinds, max players, starting stack

### T014: Implement table creation API
- **File**: `src/services/lobbyApi.ts`
- **Functions**: createTable
- **Acceptance**: Creates table, returns new TableSummary

### T015: Implement lobby WebSocket subscription
- **File**: `src/state/tableStore.ts`
- **Functions**: subscribeLobby
- **Acceptance**: Real-time updates to table list

### T016: Implement seat selection and join
- **File**: `src/state/tableStore.ts`
- **Functions**: joinSeat
- **Acceptance**: Reserves seat, transitions to table view

---

## Phase 4: WebSocket Client

### T017: Implement WebSocket connection manager
- **File**: `src/state/tableStore.ts`
- **Functions**: connect
- **Acceptance**: Establishes connection with token auth

### T018: Implement message handlers
- **File**: `src/state/tableStore.ts`
- **Acceptance**: Handles TableSnapshot, TablePatch, HoleCards, ChatMessage

### T019: Implement version tracking
- **File**: `src/services/wsClient.ts`
- **Functions**: isStaleVersion, shouldResync, requestResync
- **Acceptance**: Rejects stale, requests resync on gaps

### T020: Implement table subscription
- **File**: `src/state/tableStore.ts`
- **Functions**: subscribeTable
- **Acceptance**: Subscribes to table:{id} channel

---

## Phase 5: Table Interface

### T021: Create table page component
- **File**: `src/pages/TablePage.tsx`
- **Acceptance**: Displays table layout, seats, and game state

### T022: Create seat display component
- **File**: `src/components/SeatDisplay.tsx`
- **Acceptance**: Shows player name, stack, status, and cards

### T023: Create table layout component
- **File**: `src/components/TableLayout.tsx`
- **Acceptance**: Positions seats around virtual table

### T024: Implement hole card rendering
- **File**: `src/components/SeatDisplay.tsx`
- **Acceptance**: Shows private cards for owner, backs for others

### T025: Create community cards display
- **File**: `src/pages/TablePage.tsx`
- **Acceptance**: Shows community cards by street

### T026: Create pot display
- **File**: `src/pages/TablePage.tsx`
- **Acceptance**: Shows main pot and side pots with amounts

---

## Phase 6: Action Controls

### T027: Create action bar component
- **File**: `src/components/ActionBar.tsx`
- **Acceptance**: Shows action buttons based on legal actions

### T028: Implement legal action derivation
- **File**: `src/state/deriveLegalActions.ts`
- **Functions**: deriveLegalActions
- **Acceptance**: Returns correct legal actions based on state

### T029: Implement bet slider
- **File**: `src/components/ActionBar.tsx`
- **Acceptance**: Slider with min raise to all-in range

### T030: Implement preset bet buttons
- **File**: `src/components/ActionBar.tsx`
- **Acceptance**: 1/2 Pot, 3/4 Pot, Pot, All-In buttons

### T031: Implement action submission
- **File**: `src/state/tableStore.ts`
- **Functions**: sendAction
- **Acceptance**: Sends action to WebSocket, handles response

---

## Phase 7: Turn Timer

### T032: Create timer component
- **File**: `src/components/Timer.tsx`
- **Acceptance**: Displays countdown with visual progress

### T033: Implement timer hook
- **File**: `src/hooks/useTimer.ts`
- **Functions**: useTimer
- **Acceptance**: Countdown updates every second, handles deadline

### T034: Handle timer updates
- **File**: `src/state/tableStore.ts`
- **Acceptance**: Updates timer from TimerUpdate WebSocket messages

### T035: Implement urgency states
- **File**: `src/components/Timer.tsx`
- **Acceptance**: Visual changes as time runs low (<10s, <5s)

---

## Phase 8: Chat

### T036: Create chat panel component
- **File**: `src/components/ChatPanel.tsx`
- **Acceptance**: Displays messages with sender and timestamp

### T037: Implement chat subscription
- **File**: `src/state/tableStore.ts`
- **Functions**: subscribeChat
- **Acceptance**: Subscribes to chat:{tableId} channel

### T038: Implement chat sending
- **File**: `src/state/tableStore.ts`
- **Functions**: sendChat
- **Acceptance**: Sends message via WebSocket

### T039: Handle chat errors
- **File**: `src/components/ChatPanel.tsx`
- **Acceptance**: Displays muted error, clears on success

---

## Phase 9: Profile & Social

### T040: Create profile page component
- **File**: `src/pages/ProfilePage.tsx`
- **Acceptance**: Displays profile with stats

### T041: Create profile form component
- **File**: `src/components/ProfileForm.tsx`
- **Acceptance**: Form for nickname and avatar URL

### T042: Implement profile API
- **File**: `src/services/profileApi.ts`
- **Functions**: fetchProfile, updateProfile
- **Acceptance**: CRUD operations for profile

### T043: Create friends page component
- **File**: `src/pages/FriendsPage.tsx`
- **Acceptance**: Displays friends list with add/remove

### T044: Implement friends API
- **File**: `src/services/friendsApi.ts`
- **Functions**: fetchFriends, updateFriends
- **Acceptance**: CRUD operations for friends list

---

## Phase 10: Moderation

### T045: Create moderation menu component
- **File**: `src/components/ModerationMenu.tsx`
- **Acceptance**: Kick and mute buttons for table owner

### T046: Implement moderation API calls
- **File**: `src/services/lobbyApi.ts`
- **Functions**: kickPlayer, mutePlayer
- **Acceptance**: API calls to moderation endpoints

---

## Phase 11: Push Notifications

### T047: Implement VAPID key fetching
- **File**: `src/services/pushClient.ts`
- **Functions**: fetchVapidKey
- **Acceptance**: Retrieves public key from server

### T048: Implement push subscription
- **File**: `src/services/pushManager.ts`
- **Functions**: ensurePushSubscription
- **Acceptance**: Requests permission, subscribes, sends to server

### T049: Handle notification permission
- **File**: `src/services/pushManager.ts`
- **Acceptance**: Graceful handling of denied permission

---

## Phase 12: Observability

### T050: Implement OpenTelemetry setup
- **File**: `src/observability/otel.ts`
- **Functions**: initUiTelemetry
- **Acceptance**: Tracer configured for browser

### T051: Implement navigation tracking
- **File**: `src/observability/otel.ts`
- **Functions**: recordNavigation
- **Acceptance**: Page views tracked as spans

### T052: Implement action tracking
- **File**: `src/observability/otel.ts`
- **Functions**: recordAction
- **Acceptance**: User actions tracked with context

### T053: Implement error reporting
- **File**: `src/observability/otel.ts`
- **Functions**: recordError
- **Acceptance**: Errors logged with stack traces

---

## Phase 13: Styling & Polish

### T054: Create base CSS styles
- **File**: `public/styles.css`
- **Acceptance**: Core layout, typography, colors

### T055: Implement responsive breakpoints
- **File**: `public/styles.css`
- **Acceptance**: Mobile, tablet, desktop layouts

### T056: Create poker art component
- **File**: `src/components/PokerArt.tsx`
- **Acceptance**: SVG illustrations for branding

### T057: Implement loading states
- **File**: Various components
- **Acceptance**: Skeleton loaders for async content

### T058: Implement error states
- **File**: Various components
- **Acceptance**: User-friendly error messages

---

## Phase 14: Testing

### T059: Unit tests for table store
- **File**: `tests/unit/tableStore.test.ts`
- **Coverage**: State transitions, subscriptions

### T060: Unit tests for action derivation
- **File**: `tests/unit/deriveLegalActions.test.ts`
- **Coverage**: All action types and edge cases

### T061: Unit tests for auth service
- **File**: `tests/unit/auth.test.ts`
- **Coverage**: Token management, auth flow

### T062: E2E tests for login flow
- **File**: `tests/e2e/login.spec.ts`
- **Coverage**: Full auth flow with Keycloak

### T063: E2E tests for lobby
- **File**: `tests/e2e/lobby.spec.ts`
- **Coverage**: Table listing, creation, joining

### T064: E2E tests for gameplay
- **File**: `tests/e2e/gameplay.spec.ts`
- **Coverage**: Actions, showdown, chat

---

## Task Dependencies

```
T001 -> T002 -> T003 -> T004 -> T005 -> T006
                  |
                  v
        T007 -> T008 -> T009 -> T010
                  |
                  v
        T011 -> T012 -> T013 -> T014 -> T015 -> T016
                  |
                  v
        T017 -> T018 -> T019 -> T020
                  |
                  v
        T021 -> T022 -> T023 -> T024 -> T025 -> T026
                  |
                  v
        T027 -> T028 -> T029 -> T030 -> T031
                  |
                  v
        T032 -> T033 -> T034 -> T035
                  |
                  v
        T036 -> T037 -> T038 -> T039
                  |
                  v
        T040 -> T041 -> T042 -> T043 -> T044
                  |
                  v
            T045 -> T046
                  |
                  v
        T047 -> T048 -> T049
                  |
                  v
        T050 -> T051 -> T052 -> T053
                  |
                  v
        T054 -> T055 -> T056 -> T057 -> T058
                  |
                  v
T059 -> T060 -> T061 -> T062 -> T063 -> T064
```

## Integration Points

### Gateway Service
- **HTTP API**: All REST calls route through `/api/*`
- **WebSocket**: Connect to `/ws` and immediately send `Authenticate { token }`
- **Supported messages**: See `apps/gateway/spec/contracts/ws-messages.md`

### Keycloak
- **Authorization endpoint**: `{KEYCLOAK_URL}/realms/{realm}/protocol/openid-connect/auth`
- **Token endpoint**: `{KEYCLOAK_URL}/realms/{realm}/protocol/openid-connect/token`
- **Client ID**: Configured in environment

### Push Notifications
- **VAPID endpoint**: `GET /api/push/vapid`
- **Subscribe endpoint**: `POST /api/push/subscribe`

## Migration Notes

### Current State

The UI application is partially implemented with:
- Basic authentication flow
- Lobby table listing
- Table join and gameplay
- Chat messaging
- Profile and friends pages
- Push notification setup
- OpenTelemetry integration

### Remaining Work

1. **Spectator mode**: Add spectator subscription and display.
2. **Enhanced timer**: Improve visual urgency states.
3. **Responsive design**: Complete mobile layout optimization.
4. **Accessibility**: Add keyboard navigation and ARIA labels.
5. **Error boundaries**: Add React error boundaries for resilience.
6. **E2E tests**: Complete end-to-end test coverage.
