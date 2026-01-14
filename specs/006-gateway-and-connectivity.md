# Specification: Gateway & Connectivity

## Overview

This document defines the requirements for the Gateway Service, which acts as the single entry point for all client traffic, handling authentication, WebSocket management, and request routing.

In this repo’s intended usage, the Gateway fronts a **private instance** used by a known group (see `specs/009-private-games-and-product-scope.md`).

## Authentication & Security

### Entry Boundary
- **JWT Validation**: All incoming requests (HTTP and WebSocket) MUST be authenticated at the Gateway.
- **Service Trust**: Backend microservices trust the identity headers injected by the Gateway.
- **Rate Limiting**: The Gateway enforces per-user and per-IP rate limits to protect backend services from abuse and DDoS attacks.

## Connectivity

### WebSocket Management
- **Persistent Connections**: The Gateway maintains long-lived WebSocket connections for real-time gameplay updates.
- **Heartbeats**: Bi-directional pings ensure stale connections are detected and cleaned up within 30 seconds.
- **Multi-Instance Synchronization**: Gateway instances synchronize via Redis Pub/Sub to ensure that a broadcast to a "Table" reaches all connected clients regardless of which Gateway instance they are connected to.

### Request Routing
- **HTTP Proxying**: The Gateway routes RESTful requests to the appropriate backend service (e.g., `/api/profile` -> Player Service).
- **gRPC Coordination**: The Gateway translates certain client actions into internal gRPC calls to domain services (e.g., submitting a poker action).

## Real-Time Messaging

### Table Synchronization
- **Snapshots**: Upon joining a table, the client receives a full state snapshot.
- **Patches**: Subsequent updates are delivered as patches to minimize bandwidth.
- **Version Tracking**: Every message includes a sequence number to ensure the client remains in sync.
- **Spectator Support**: Spectators are first-class users who may subscribe to table state without occupying a seat.

### Access Control (Private Games)
- **Instance Scope**: The “lobby” is the table index within a private instance, not public discovery.
- **Table Scope**: The Gateway SHOULD enforce that users can only subscribe to tables they are allowed to access (at minimum: authenticated users in the instance; optionally: table-level privacy/invites).

### Chat & Presence
- **Participation**: Chat participation (sending and receiving) MUST be restricted to seated players and active spectators.
- **Moderation**: Messages from muted players MUST be blocked at the Gateway level.
- **Retention**: Table-specific chat history is persisted for 24 hours to support synchronization for users who join a table mid-session.
- **Online Status**: The Gateway tracks and broadcasts user presence (online/away/offline).
- **Rate Limiting**: Chat messages MUST be subject to specific rate limits (distinct from API limits) to prevent spam.
- **Spectator Permissions**: Spectators MUST NOT receive hole cards or submit actions, but they MAY receive table state, community cards, and chat updates.

## Performance Requirements

- **Connection Time**: WebSocket handshake MUST complete within 500ms.
- **Message Latency**: P95 message delivery latency MUST be under 100ms.
- **Throughput**: Each Gateway instance MUST support 10,000 concurrent WebSocket connections.
