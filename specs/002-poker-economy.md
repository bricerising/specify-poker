# Specification: Poker Economy & Balance Management

## Overview

This document defines the architecture and requirements for managing player balances, table buy-ins, and pot settlements. It ensures financial integrity through a distributed ledger and two-phase commit patterns.

## Core Concepts

### 1. User Accounts
Every player has a dedicated account tracking their chip balance. Chips are "play-money" but treated with the rigor of real currency. 
- **Initial Balance**: New accounts start with a balance of 0; chips must be acquired via deposits or rewards.
- **Economic Sinks (Planned)**:
  - **Rake**: 5% of pots over 20 chips, capped at 5 chips per hand. Rake is deducted before pot distribution.
  - **Table Fees**: Entry fees for tournaments or special game modes.
- **Economic Sources (Planned)**:
  - **Daily Login Bonus**: 1,000 chips credited on the first login of each day.
  - **Friend Referral**: 5,000 chips credited to both the referrer and the referee after the referee plays 100 hands.
  - **Ad Rewards**: Small chip rewards for viewing optional partner content.

### 2. Two-Phase Buy-In
To prevent race conditions and double-spending, joining a table uses a reservation pattern:
1. **Reserve**: The Gateway/Game service requests a reservation of chips.
2. **Commit**: Once the player successfully joins a seat, the reservation is converted into a debit.
3. **Release**: If the join fails or the player leaves before the hand starts, the reservation is released.
- **Timeout**: Uncommitted reservations MUST automatically expire after 30 seconds to prevent funds from being permanently locked.

### 3. Pot Management
- **Contributions**: As players bet, their chips are moved from their table stack to the active pot.
- **Settlement**: At the end of a hand, the `Balance Service` distributes the pot(s) to the winner(s) based on the `Game Service` instructions.
- **Atomic Operations**: Pot settlements must be atomic; either all winners are credited or none.

## Ledger & Integrity

### 1. Transaction Ledger
Every balance change (deposit, buy-in, win, rake) is recorded as a line item in an append-only ledger.

### 2. Checksum Chain
The ledger uses a checksum chain where each entry includes a SHA-256 hash of (Current Entry + Previous Entry Hash). This ensures that any tampering or missing entries are immediately detectable.

### 3. Idempotency
All mutating economic operations MUST accept an idempotency key (format: `{operation}:{tableId}:{userId}:{timestamp}`). This allows the system to safely retry failed gRPC calls without duplicating transactions.

## Economic Health Metrics

The system monitors the overall health of the play-money economy via:
- **Total Supply**: Aggregate sum of all user balances and active pots.
- **Velocity**: Rate at which chips are being bet and moved.
- **Sinks & Sources**: Tracking chips entering (e.g., daily rewards) and leaving (e.g., rake) the system.

## Performance Requirements

- **Latency**: P99 latency for gRPC balance calls MUST be under 50ms.
- **Integrity**: 100% ledger integrity, verified by continuous background jobs.
