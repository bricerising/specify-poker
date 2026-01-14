# Specification: Private Games & Product Scope

## Intent

This repository is focused on enabling **friends to host private Texas Hold’em games**.
The default operating model is a **self-hosted/private deployment** (e.g., Docker Compose)
shared with a known group, not a public poker network.

## Core Product Goals

- **Private tables**: A player can create a table and run a game for a known group.
- **Social play**: Real-time table state, chat, spectator mode (optional), and turn alerts.
- **Trustworthy gameplay**: Server-authoritative rules, deterministic state transitions, and reproducible hand history.
- **Low-friction onboarding**: Lightweight identity (nickname/profile) appropriate for friends.

## Money & Chips

- The system models **chips** for table stakes and accurate pot settlement.
- The system is **play-money by default** and does **not** process real-money payments.
- If players choose to settle real money, that settlement is **out-of-band** and outside the scope of this repo.

## Non-Goals (Out of Scope)

- Public matchmaking, table discovery for strangers, or a “global” poker lobby.
- Monetization features (ads, chip purchases, referral growth loops).
- Regulatory compliance tooling for real-money gambling (e.g., KYC/AML).
- Guaranteed long-term retention of gameplay data for compliance (retention is configurable and privacy-minded).

## Terminology

- **Instance**: A single deployed stack (often one per friend group).
- **Table Host / Owner**: The player who creates a table and can moderate it.
- **Lobby**: The table index inside an instance (not public internet discovery).

