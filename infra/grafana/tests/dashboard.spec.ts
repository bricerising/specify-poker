import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('grafana dashboard', () => {
  it('includes poker metrics panels', () => {
    const dashboardPath = join(__dirname, '..', 'dashboards', 'poker-observability.json');
    const payload = JSON.parse(readFileSync(dashboardPath, 'utf8')) as {
      panels?: Array<{ targets?: Array<{ expr?: string }> }>;
    };

    const expressions = (payload.panels ?? [])
      .flatMap((panel) => panel.targets ?? [])
      .map((target) => target.expr ?? '');

    const allExpressions = expressions.join('\n');

    expect(allExpressions).toContain('game_actions_processed_total');
    expect(allExpressions).toContain('gateway_ws_active_connections');
    expect(allExpressions).toContain('process_resident_memory_bytes');
  });
});
