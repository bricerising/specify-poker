import React, { useMemo, useState } from "react";
import { trace } from "@opentelemetry/api";

import { ActionType, LegalAction } from "../state/deriveLegalActions";

interface ActionBarProps {
  actions: LegalAction[];
  pot: number;
  onAction: (action: { type: ActionType; amount?: number }) => void;
}

export function ActionBar({ actions, pot, onAction }: ActionBarProps) {
  const [amount, setAmount] = useState("0");

  const actionable = useMemo(() => actions.map((action) => action.type), [actions]);
  const constraints = useMemo(() => {
    const map = new Map<ActionType, { min?: number; max?: number }>();
    for (const action of actions) {
      map.set(action.type, { min: action.minAmount, max: action.maxAmount });
    }
    return map;
  }, [actions]);

  const betLimits = constraints.get("Raise") ?? constraints.get("Bet");
  const rangeMin = betLimits?.min ?? 0;
  const rangeMax = betLimits?.max ?? 0;

  const clampAmount = (value: number) => {
    let resolved = Number.isNaN(value) ? 0 : value;
    if (betLimits?.min !== undefined) {
      resolved = Math.max(resolved, betLimits.min);
    }
    if (betLimits?.max !== undefined) {
      resolved = Math.min(resolved, betLimits.max);
    }
    return Math.max(0, Math.floor(resolved));
  };

  React.useEffect(() => {
    const raise = actions.find((action) => action.type === "Raise");
    const bet = actions.find((action) => action.type === "Bet");
    const preferred = raise?.minAmount ?? bet?.minAmount;
    if (preferred !== undefined) {
      setAmount(String(preferred));
    }
  }, [actions]);

  const handleAction = (type: ActionType) => {
    const tracer = trace.getTracer("ui");
    const span = tracer.startSpan("ui.action.submit", {
      attributes: {
        "poker.action": type,
      },
    });
    span.end();

    const value = Number(amount);
    const limits = constraints.get(type);
    let resolved = Number.isNaN(value) ? undefined : value;
    if ((type === "Bet" || type === "Raise") && limits?.min !== undefined) {
      if (resolved === undefined || resolved < limits.min) {
        resolved = limits.min;
      }
    }
    if ((type === "Bet" || type === "Raise") && limits?.max !== undefined && resolved !== undefined) {
      resolved = Math.min(resolved, limits.max);
    }
    onAction({ type, amount: resolved });
  };

  if (actions.length === 0) {
    return <div className="card card-subtle">No actions available</div>;
  }

  const actionClass = (action: ActionType) => {
    if (action === "Raise" || action === "Bet") {
      return "btn btn-primary";
    }
    if (action === "Fold") {
      return "btn btn-quiet";
    }
    return "btn";
  };

  return (
    <div className="card action-bar">
      <h3>Action</h3>
      <label className="field">
        <span className="field-label">Amount</span>
        <input
          type="number"
          min={0}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      {betLimits ? (
        <>
          <label className="field">
            <span className="field-label">Bet sizing</span>
            <input
              type="range"
              min={rangeMin}
              max={rangeMax}
              step={1}
              value={clampAmount(Number(amount))}
              onChange={(event) => setAmount(String(clampAmount(Number(event.target.value))))}
            />
          </label>
          <div className="action-buttons">
            <button type="button" className="btn btn-ghost" onClick={() => setAmount(String(clampAmount(pot / 2)))}>
              1/2 Pot
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setAmount(String(clampAmount(pot)))}>
              Pot
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setAmount(String(clampAmount(betLimits.max ?? 0)))}
            >
              All-in
            </button>
          </div>
        </>
      ) : null}
      <div className="action-buttons">
        {actionable.map((action) => (
          <button
            key={action}
            type="button"
            className={actionClass(action)}
            onClick={() => handleAction(action)}
          >
            {action}
          </button>
        ))}
      </div>
    </div>
  );
}
