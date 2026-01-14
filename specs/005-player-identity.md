# Specification: Player Identity & Social Features

## Overview

This document defines the requirements for user profiles, identity management, aggregate statistics, and social connections (friends) within a **private poker instance** (see `specs/009-private-games-and-product-scope.md`).

## Identity Management

### Authentication
- **Provider**: Keycloak (OpenID Connect).
- **Social Login**: Support for Google OAuth.
- **Session Management**: JWT-based sessions that can be revoked per user or per device.

### User Profiles
Every user has a profile containing:
- **Nickname**: User-defined display name (2-20 characters).
- **Avatar**: URL to a player-selected image.
- **Auto-provisioning**: New users are automatically assigned a default profile upon first login.

## Player Statistics

The system tracks aggregate gameplay data to provide players with a sense of progress:
- **Hands Played**: Incremented every time a player is dealt into a hand.
- **Wins**: Incremented when a player wins any portion of a pot (main or side).
- **Consistency**: Statistics are updated asynchronously via events to minimize impact on gameplay latency.

## Social Features

### Friends List
- **Functionality**: Players can maintain a list of other users.
- **Privacy**: Friends list is one-directional in the MVP (A follows B).
- **Scale**: The list can be empty without affecting core gameplay.

### Moderation
- **Kick**: Table owners can remove disruptive players.
- **Mute**: Table owners can silence players in chat.

## Data Privacy

- **Data Ownership**: Users SHOULD be able to delete their profile and stats (privacy-minded default; exact obligations depend on deployment context).
- **Anonymization**: When a user is deleted, their historical hand participation may be anonymized to preserve the integrity of the `Event Service` audit logs.

## Performance Requirements

- **Profile Retrieval**: P99 latency MUST be under 50ms (cached).
- **Updates**: Profile changes MUST be reflected globally within 1 second.
