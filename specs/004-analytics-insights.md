# Specification: Data Analytics & Insights

## Overview

This document defines the strategy for capturing, analyzing, and acting upon 
system and user data to derive business insights. It establishes the pipeline
for transforming raw events into actionable information that informs subsequent
development efforts.

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
- **DAU/MAU**: Daily/Monthly Active Users.
- **Retention**: Percentage of users returning after 1, 7, and 30 days.
- **Session Duration**: Average time spent per WebSocket connection.
- **Onboarding Funnel**: Conversion rate from registration to first hand played.

### 2. Economy & Balance (via Balance)
- **Total Supply**: Sum of all user balances + active pots.
- **Velocity of Chips**: Frequency of chip transfers/bets.
- **Sink/Source Analysis**: Tracking how chips enter (Daily Bonus, Referral Rewards, Admin Deposits) and 
  leave (Rake, Table Fees) the system.
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

1. **Review**: Bi-weekly "Insight Reviews" where stakeholders examine Grafana 
   business dashboards.
2. **Hypothesize**: Identify areas of friction (e.g., "70% of users drop off at
   the buy-in screen").
3. **Tasking**: Convert hypotheses into actionable tasks in the relevant 
   `spec/tasks.md` or new feature specs.
4. **Measure**: Use A/B testing or period-over-period analysis to verify if the 
   change improved the target metric.

## Success Criteria

- **Insight Latency**: Key business metrics are updated with no more than 24-hour 
  delay.
- **Actionability**: At least 20% of the development backlog is directly 
  linked to data-driven insights.
- **Accessibility**: Product stakeholders have self-service access to 
  pre-defined Grafana dashboards.
