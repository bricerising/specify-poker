#!/usr/bin/env bash
set -euo pipefail

docker compose up --build -d

cat <<'EOF'

Stack URLs
- UI:          http://localhost:3000
- Gateway API: http://localhost:4000
- Keycloak:    http://localhost:8080
- Grafana:     http://localhost:3001
- Loki:        http://localhost:3100
- Tempo:       http://localhost:3200
- Prometheus:  http://localhost:9090

Next
- Run E2E: PLAYWRIGHT_EXTERNAL=1 npm --prefix apps/ui run test:e2e

EOF
