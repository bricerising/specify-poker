# Quickstart: UI Application

## Local Requirements

- Docker Desktop or Docker Engine with Compose
- Node.js 20 LTS
- Modern browser (Chrome, Firefox, Safari, or Edge)

## Start the Application

### With Docker Compose (Full Stack)

From the repo root:
```bash
docker compose up
```

The UI will be available at http://localhost:3000

### Standalone Development

1. Ensure the Gateway service is running:
   ```bash
   cd apps/gateway
   npm run dev
   ```

2. Install dependencies:
   ```bash
   cd apps/ui
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

The UI will be available at http://localhost:5173 (Vite default)

## Default Local URLs

- **UI (Production)**: http://localhost:3000
- **UI (Development)**: http://localhost:5173
- **Gateway API**: http://localhost:4000/api
- **Gateway WebSocket**: ws://localhost:4000/ws
- **Keycloak**: http://localhost:8080

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `/api` | Base URL for API calls |
| `VITE_WS_URL` | `/ws` | WebSocket endpoint |
| `VITE_KEYCLOAK_URL` | (none) | Keycloak server URL |
| `VITE_KEYCLOAK_REALM` | `poker-local` | Keycloak realm name |
| `VITE_KEYCLOAK_CLIENT_ID` | `poker-ui` | Keycloak client ID |
| `VITE_OTEL_ENDPOINT` | (none) | OpenTelemetry collector endpoint |

## First-Time Setup

### 1. Keycloak Configuration

Before using the UI, ensure Keycloak is configured:

1. Access Keycloak admin at http://localhost:8080
2. Import the realm config from `infra/keycloak/`
3. Verify the `poker-ui` client exists with correct redirect URIs:
   - `http://localhost:3000/*`
   - `http://localhost:5173/*`

### 2. Google OAuth (Optional)

To enable Google login:

1. Create a Google OAuth client in Google Cloud Console
2. Add Keycloak Identity Provider in the realm
3. Configure redirect URI: `http://localhost:8080/realms/poker-local/broker/google/endpoint`

### 3. Push Notifications (Optional)

To enable push notifications:

1. Generate VAPID keys:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Set environment variables in the notify service:
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT`

## Application Structure

```
apps/ui/
├── public/
│   ├── index.html          # HTML template
│   └── styles.css          # Global styles
├── src/
│   ├── main.tsx            # Application entry point
│   ├── components/         # Reusable UI components
│   ├── pages/              # Page components
│   ├── services/           # API and WebSocket clients
│   ├── state/              # State management
│   └── observability/      # Telemetry setup
└── tests/                  # Test files
```

## Key Features

### Authentication
- Keycloak OIDC integration
- Automatic token refresh
- Session persistence (memory-only for security)

### Real-Time Updates
- WebSocket connection for live table updates
- Version tracking for state synchronization
- Automatic reconnection on disconnect

### Gameplay
- Full Texas Hold'em support
- Action controls with bet slider
- Turn timer display
- Chat messaging

### Profile & Social
- Nickname and avatar customization
- Friends list management
- Player statistics display

## Running Tests

### Unit Tests
```bash
cd apps/ui
npm test
```

### E2E Tests (with Playwright)
```bash
cd apps/ui
npm run test:e2e
```

## Building for Production

```bash
cd apps/ui
npm run build
```

Output will be in `dist/` directory.

## Smoke Test

1. Navigate to http://localhost:3000
2. Click "Login" and authenticate with Keycloak
3. View the lobby with table listings
4. Create a new table or join an existing one
5. Take a seat and wait for other players
6. Play a hand and verify real-time updates
7. Send a chat message and verify delivery
8. View your profile and update your nickname

## Troubleshooting

### "Invalid redirect URI" on login
- Verify Keycloak client has correct redirect URIs configured
- Check that `VITE_KEYCLOAK_URL` matches Keycloak configuration

### WebSocket connection fails
- Ensure Gateway service is running on port 4000
- Check browser console for CORS errors
- Verify JWT token is valid

### Table state not updating
- Check WebSocket connection status in browser dev tools
- Look for version mismatch errors in console
- Try refreshing to trigger resync

### Push notifications not working
- Ensure browser supports Push API
- Check notification permissions in browser settings
- Verify VAPID keys are configured in notify service

## Development Tips

### Hot Module Replacement
Vite provides HMR for fast development:
- Component changes update without full reload
- State is preserved during updates

### React DevTools
Install the React DevTools browser extension for:
- Component tree inspection
- State and props debugging
- Performance profiling

### Network Debugging
Use browser DevTools Network tab to:
- Monitor WebSocket frames
- Track API requests
- Debug authentication flow

### State Debugging
Add this to browser console for state inspection:
```javascript
window.__TABLE_STORE__ = tableStore;
// Then access state with:
__TABLE_STORE__.getState()
```
