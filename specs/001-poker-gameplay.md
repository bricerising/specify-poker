# Specification: Poker Gameplay & Engine

## Overview

This document defines the core Texas Hold'em gameplay rules, the deterministic state machine, and the hand evaluation logic used across the poker application.

## Game Rules (Texas Hold'em)

### Betting Rounds
1. **Pre-flop**: Each player is dealt two private cards (hole cards). Blinds are posted.
2. **Flop**: Three community cards are dealt face up.
3. **Turn**: A fourth community card is dealt face up.
4. **River**: A fifth community card is dealt face up.
5. **Showdown**: Players reveal cards to determine the winner using the best 5-card hand.

### Action Rules
- **Minimum Players**: A hand MUST NOT start with fewer than 2 active players.
- **Minimum Raise**: Must equal the size of the previous bet or raise in the current round.
- **Raise Capping**: If an all-in raise is below the minimum required raise, it does not re-open the betting round for players who have already acted. Subsequent players who have not yet acted may still raise.
- **Side Pots**: Created when one or more players are all-in and others continue betting. Pots are calculated by contribution level to ensure players only win chips from opponents they have covered.
- **Odd Chips**: In split pots, odd chips are distributed to the first player(s) in clockwise order from the dealer button.

### Table & Seat Lifecycle
- **Provisioning**: The system SHOULD start with zero tables; table owners create tables as needed. For local development, the stack MAY provision a default table for convenience.
- **Seat Statuses**:
  - `EMPTY`: No player is assigned to the seat.
  - `RESERVED`: A player has requested the seat, and a balance reservation is pending.
  - `SEATED` / `ACTIVE`: Player is seated and ready to receive cards or is currently in a hand.
  - `FOLDED`: Player has folded their cards in the current hand.
  - `ALL_IN`: Player has committed their entire stack to the pot.
  - `SITTING_OUT`: Player is at the table but not participating in hands.
  - `DISCONNECTED`: Player has lost connection but remains in their seat until the timeout.
- **Buy-in Reservations**: To prevent double-spending, chips are reserved in the Balance Service before a player is seated. The reservation is committed when the player successfully joins the table.
- **Antes**: The system supports ante configuration, although it may be hidden in some client interfaces.

### Timers & Timeouts
- **Turn Timer**: Each player has a configurable amount of time to act (default: 20 seconds).
- **Auto-Action**: If the timer expires, the system automatically folds the player (or checks if legal).
- **Disconnection**: Disconnected players are auto-folded on their turn if the timer expires.

## User Interface & Experience

### Action Controls
- **Slider**: Players can select bet/raise amounts using a granular chip slider.
- **Presets**: Shortcut buttons for common bet sizes (e.g., ½ Pot, 3/4 Pot, Pot, All-In) MUST be available.

## Deterministic State Machine

The game engine is implemented as a pure, deterministic state machine. Given the same initial state and sequence of actions, it MUST produce identical transitions.

### Key Transitions
- `HandStarted`: Blinds posted, cards dealt.
- `ActionTaken`: Fold, Check, Call, or Bet/Raise.
- `StreetAdvanced`: Moving from Flop to Turn, etc.
- `Showdown`: Comparing hands and determining winners.
- `HandEnded`: Pot distribution and cleanup.

## Hand Evaluation

Hands are evaluated using standard Texas Hold’em rankings (no wild cards; suits are equal):
1. **Straight Flush** (includes Royal Flush)
2. **Four of a Kind**
3. **Full House**
4. **Flush**
5. **Straight**
6. **Three of a Kind**
7. **Two Pair**
8. **One Pair**
9. **High Card**
- **Split Pots**: If two or more players have the same hand rank, the pot is divided equally (with remainders handled per house rules).
- **Kickers**: Used to break ties between hands of the same rank (e.g., Two Pair).

## Client Synchronization

- **Server Authority**: All game state is computed server-side.
- **Redaction**: Private hole cards are redacted from the global `TableState` and sent only to the owning player.
- **Versioned Updates**: Every state change increments a version number, allowing clients to detect and recover from out-of-order updates.

## Technical Requirements

- **Latency**: Action processing MUST complete within 50ms.
- **Evaluation**: Hand evaluation MUST complete within 10ms.
- **Auditability**: Every action is recorded in a per-hand event log for debugging and replay.
