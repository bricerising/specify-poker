# Specification: Poker Economy & Balance Management

## Overview

This document defines the architecture and requirements for managing chip balances, table buy-ins, and pot settlements in a **private, play-money** poker environment (see `specs/009-private-games-and-product-scope.md`).

The goal is **integrity and correctness** (no negative balances, idempotent operations, correct settlements), not payments processing or monetization.

## Core Concepts

### 1. User Accounts
Every player has a dedicated account tracking their chip balance.
- **Play-Money**: Chips are for table stakes and settlement correctness; the system does not process real-money deposits/withdrawals.
- **Initial Balance**: New accounts SHOULD be provisioned with enough chips to join a typical table without external setup friction (amount is deployment-configurable).
- **Admin Credits/Debits**: In a private instance, an admin MAY credit/debit chips for setup, resets, or “home game bank” workflows.
- **Optional House Rules**: Features like rake or bonuses MAY exist as configurable knobs, but they are not core to the private-games product intent.

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
Every balance change (deposit/credit, buy-in, win, cash-out, optional rake) is recorded as a line item in an append-only ledger.

### 2. Checksum Chain
The ledger uses a checksum chain where each entry includes a SHA-256 hash of (Current Entry + Previous Entry Hash). This ensures that any tampering or missing entries are immediately detectable.

### 3. Idempotency
All mutating economic operations MUST accept an idempotency key (format: `{operation}:{tableId}:{userId}:{timestamp}`). This allows the system to safely retry failed gRPC calls without duplicating transactions.

## Economic Health Metrics

These metrics are optional in a private instance, but can help detect bugs or unintended inflation:
- **Total Supply**: Aggregate sum of all user balances and active pots.
- **Velocity**: Rate at which chips are being bet and moved.
- **Sinks & Sources**: Tracking chips entering (e.g., admin credits) and leaving (e.g., optional rake) the system.

## Performance Requirements

- **Latency**: P99 latency for gRPC balance calls MUST be under 50ms.
- **Integrity**: 100% ledger integrity, verified by continuous background jobs.
