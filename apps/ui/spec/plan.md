# Implementation Plan: UI Application

## Overview

This document outlines the implementation plan for the UI application. The
application is a React-based SPA that provides the player-facing interface for
the poker platform, connecting to backend services via the Gateway.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Browser                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         React Application                                ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ ││
│  │  │   Pages     │  │ Components  │  │   State     │  │    Services     │ ││
│  │  │  - Lobby    │  │ - ActionBar │  │ - TableStore│  │ - wsClient      │ ││
│  │  │  - Table    │  │ - ChatPanel │  │             │  │ - apiClient     │ ││
│  │  │  - Profile  │  │ - Seats     │  │             │  │ - auth          │ ││
│  │  │  - Friends  │  │ - Timer     │  │             │  │ - pushManager   │ ││
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘ ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────┬───────────────────────────────────┬───────────────┘
                          │ HTTP/REST                         │ WebSocket
                          ▼                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Gateway Service (Port 4000)                         │
│                     - Authentication validation                              │
│                     - Request routing                                        │
│                     - WebSocket management                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┬────────────────┐
         ▼                ▼                ▼                ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│    Game     │   │   Player    │   │   Balance   │   │    Event    │
│   Service   │   │   Service   │   │   Service   │   │   Service   │
└─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘
```

## Directory Structure

```
apps/ui/
├── Dockerfile
├── package.json
├── tsconfig.json
├── server.mjs                    # Static file server
├── spec/                         # This specification folder
│   ├── spec.md
│   ├── plan.md
│   ├── tasks.md
│   ├── data-model.md
│   └── quickstart.md
├── public/
│   ├── index.html
│   ├── styles.css
│   └── favicon.ico
├── src/
│   ├── main.tsx                  # Application entry point
│   ├── components/
│   │   ├── ActionBar.tsx         # Betting controls
│   │   ├── ChatPanel.tsx         # Chat interface
│   │   ├── CreateTableForm.tsx   # Table creation dialog
│   │   ├── ModerationMenu.tsx    # Kick/mute controls
│   │   ├── PokerArt.tsx          # Decorative SVG art
│   │   ├── ProfileForm.tsx       # Profile edit form
│   │   ├── SeatDisplay.tsx       # Individual seat rendering
│   │   ├── TableLayout.tsx       # Table visual layout
│   │   └── Timer.tsx             # Turn countdown timer
│   ├── pages/
│   │   ├── LobbyPage.tsx         # Table listing and creation
│   │   ├── TablePage.tsx         # Game interface
│   │   ├── ProfilePage.tsx       # Profile management
│   │   └── FriendsPage.tsx       # Friends list
│   ├── services/
│   │   ├── apiClient.ts          # HTTP API wrapper
│   │   ├── auth.ts               # Keycloak OIDC integration
│   │   ├── wsClient.ts           # WebSocket client utilities
│   │   ├── profileApi.ts         # Profile API calls
│   │   ├── friendsApi.ts         # Friends API calls
│   │   ├── lobbyApi.ts           # Table listing API calls
│   │   ├── pushClient.ts         # Push notification API
│   │   └── pushManager.ts        # Push subscription manager
│   ├── state/
│   │   ├── tableStore.ts         # Table state management
│   │   └── deriveLegalActions.ts # Action validation logic
│   ├── observability/
│   │   └── otel.ts               # OpenTelemetry setup
│   ├── hooks/
│   │   ├── useTimer.ts           # Countdown timer hook
│   │   ├── useWebSocket.ts       # WebSocket connection hook
│   │   └── useLocalStorage.ts    # Persistent state hook
│   └── utils/
│       ├── cardRenderer.ts       # Card display utilities
│       ├── chipFormatter.ts      # Chip amount formatting
│       └── soundManager.ts       # Audio feedback
└── tests/
    ├── unit/
    │   ├── tableStore.test.ts
    │   ├── deriveLegalActions.test.ts
    │   └── auth.test.ts
    └── e2e/
        ├── login.spec.ts
        ├── lobby.spec.ts
        └── gameplay.spec.ts
```

## Implementation Phases

### Phase 1: Core Infrastructure
- Set up React application with TypeScript.
- Implement Keycloak OIDC authentication flow.
- Create base HTTP API client with auth headers.
- Implement WebSocket connection management.

### Phase 2: Lobby Experience
- Build table listing page with real-time updates.
- Implement table creation form.
- Add seat selection and join flow.
- Display table occupancy and game status.

### Phase 3: Table Interface
- Build table layout with seat positions.
- Implement hole card display (private).
- Add community card rendering.
- Display pot information and contributions.

### Phase 4: Action Controls
- Build action bar with fold/check/call/raise buttons.
- Implement bet slider with min/max constraints.
- Add preset bet buttons (1/2 pot, 3/4 pot, pot, all-in).
- Show legal actions based on game state.

### Phase 5: Turn Management
- Implement turn timer display.
- Add visual indicators for current turn.
- Handle timer updates from WebSocket.
- Show urgency states as time runs low.

### Phase 6: Chat & Social
- Build chat panel component.
- Implement message sending and receiving.
- Handle muted user errors.
- Add profile and friends pages.

### Phase 7: Push Notifications
- Implement push subscription registration.
- Handle notification permission prompts.
- Add notification click handling.

### Phase 8: Observability
- Set up OpenTelemetry for browser.
- Track key user interactions.
- Log errors to backend.
- Implement navigation tracking.

### Phase 9: Polish & Accessibility
- Add keyboard navigation.
- Implement responsive design breakpoints.
- Add loading states and error handling.
- Optimize bundle size.

## Key Design Decisions

### State Management

The application uses a custom store pattern (`tableStore`) for table state:

- **Single source of truth**: All table state flows through the store.
- **Immutable updates**: State changes create new objects for React rendering.
- **Subscription model**: Components subscribe to state changes.
- **Version tracking**: Server state versions prevent stale updates.

```typescript
interface TableStoreState {
  tables: TableSummary[];           // Lobby table list
  tableState: TableState | null;    // Current table (if joined)
  seatId: number | null;            // User's seat (if seated)
  status: "idle" | "connecting" | "connected" | "error";
  chatMessages: ChatMessage[];
  privateHoleCards: string[] | null;
  privateHandId: string | null;
}
```

### WebSocket Strategy

- **Connection lifecycle**: Connect on lobby view, maintain through gameplay.
- **Subscription model**: Subscribe to channels (lobby, table:{id}, chat:{id}).
- **Version tracking**: Detect and handle out-of-order messages.
- **Reconnection**: Auto-reconnect with exponential backoff.
- **Resync**: Request full state on version gaps.

### Authentication Flow

```
1. User clicks "Login"
2. Redirect to Keycloak login page
3. User authenticates with Keycloak
4. Keycloak redirects back with auth code
5. App exchanges code for tokens
6. Token stored in memory (not localStorage)
7. Token attached to API requests
8. Token refresh before expiry
```

### Privacy & Security

- **Token storage**: Access tokens in memory only.
- **Hole cards**: Never stored in shared state; delivered via private message.
- **Chat sanitization**: HTML escaped before rendering.
- **CORS**: API calls restricted to gateway origin.

## Success Metrics

- Time to interactive < 3 seconds
- WebSocket message latency < 100ms client-side
- 0 exposed tokens in browser history/logs
- 60fps animations and transitions
- Bundle size < 500KB gzipped
