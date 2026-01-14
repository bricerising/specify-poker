# Specification: Data Analytics & Insights

## Overview

This document defines the strategy for capturing, analyzing, and acting upon
system and gameplay data for a **private friends-only poker instance** (see `specs/009-private-games-and-product-scope.md`).

The primary goal is **reliability and gameplay quality** (debuggability, fairness verification, and operational health), not growth marketing or monetization analytics.

## Analytics Strategy

Our approach focuses on three core pillars:
1. **Product Analytics**: Understanding user behavior, engagement, and retention.
2. **Economy Health**: Monitoring the virtual chip economy to ensure stability.
3. **Gameplay Integrity**: Analyzing hand histories to detect anomalies or bots.

## Data Pipeline

```
┌─────────────────┐      Events (gRPC)      ┌─────────────────────────┐
│  Microservices  │────────────────────────►│      Event Service      │
│  (Gateway, Game,│                         │   (Primary Collector)   │
│   Balance...)   │                         └────────────┬────────────┘
└─────────────────┘                                      │
                                                         ▼
┌─────────────────┐      Scrape / Export      ┌─────────────────────────┐
│     Grafana     │◄──────────────────────────┤     Cold Storage        │
│  (Dashboards)   │                           │ (Postgres / Data Lake)  │
└────────┬────────┘                           └─────────────────────────┘
         │
         ▼
┌─────────────────┐
│  Product Team   │ (Feedback Loop)
│  & Developers   │
└─────────────────┘
```

## Key Metrics & Insights

### 1. User Behavior (via Gateway & Player)
- **Active Players**: Count of distinct players connected / in-hand.
- **Session Duration**: Average time spent per WebSocket connection.
- **Join Success Rate**: Seat-join success vs. failure reasons (insufficient chips, seat taken, auth).
- **Timeout Rate**: Frequency of auto-actions due to turn timer expiry.

### 2. Economy & Balance (via Balance)
- **Total Supply**: Sum of all user balances + active pots.
- **Velocity of Chips**: Frequency of chip transfers/bets.
- **Sink/Source Analysis**: Tracking how chips enter (admin credits, deposits) and leave (optional rake) the system.
- **Reservation Conversion**: Success rate of balance reservations converting to seated buy-ins.
- **Wealth Distribution**: Gini coefficient or percentile distribution of chip balances across the user base.

### 3. Gameplay Trends (via Game & Event)
- **Table Popularity**: Most active blind levels and table configurations.
- **Turn Timings**: Identifying streets or situations where players take the 
  most time (potential UI/UX friction).
- **Hand Distributions**: Verifying RNG fairness and detecting potential 
  collusion patterns.

## The Feedback Loop

Insights are useless unless they drive change. We implement the following loop:

1. **Review**: Periodic review of operational and gameplay dashboards.
2. **Hypothesize**: Identify areas of friction (e.g., "70% of users drop off at
   the buy-in screen").
3. **Tasking**: Convert findings into actionable tasks in the relevant `spec/tasks.md` or new feature specs.
4. **Measure**: Use A/B testing or period-over-period analysis to verify if the 
   change improved the target metric.

## Success Criteria

- **Insight Latency**: Key business metrics are updated with no more than 24-hour 
  delay.
- **Actionability**: At least 20% of the development backlog is directly 
  linked to data-driven insights.
- **Accessibility**: Product stakeholders have self-service access to 
  pre-defined Grafana dashboards.
