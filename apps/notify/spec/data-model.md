# Data Model: Notify Service

## Entities

### PushSubscription

Stores the Web Push subscription details for a user's device.

```typescript
interface PushSubscription {
  userId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  createdAt: string; // ISO8601
}
```

- **Persistence**: Redis Hash (Key: `notify:push:{userId}`)
- **TTL**: None (Managed by unregister/error logic)

### NotificationPayload

The structure of the message sent to the client via Web Push.

```typescript
interface NotificationPayload {
  title: string;
  body: string;
  url: string;      // Action URL (e.g., to the table)
  icon?: string;     // Optional avatar/icon
  tag?: string;      // For grouping notifications
  data?: {
    tableId?: string;
    type: 'turn_alert' | 'game_invite' | 'system';
  };
}
```

## Internal Storage Schema

### Redis Keys

| Key | Type | Description |
|-----|------|-------------|
| `notify:push:{userId}` | Set/List | JSON strings of PushSubscription objects |
| `notify:stats` | Hash | Counters for success/failure/cleanup |
