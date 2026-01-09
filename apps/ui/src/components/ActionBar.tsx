import React, { useMemo, useState } from "react";
import { trace } from "@opentelemetry/api";

import { ActionType, LegalAction } from "../state/deriveLegalActions";

interface ActionBarProps {
  actions: LegalAction[];
  onAction: (action: { type: ActionType; amount?: number }) => void;
}

export function ActionBar({ actions, onAction }: ActionBarProps) {
  const [amount, setAmount] = useState("0");

  const actionable = useMemo(() => actions.map((action) => action.type), [actions]);

  const handleAction = (type: ActionType) => {
    const tracer = trace.getTracer("ui");
    const span = tracer.startSpan("ui.action.submit", {
      attributes: {
        "poker.action": type,
      },
    });
    span.end();

    const value = Number(amount);
    onAction({ type, amount: Number.isNaN(value) ? undefined : value });
  };

  if (actions.length === 0) {
    return <div>No actions available</div>;
  }

  return (
    <div>
      <label>
        Amount
        <input
          type="number"
          min={0}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      <div>
        {actionable.map((action) => (
          <button key={action} type="button" onClick={() => handleAction(action)}>
            {action}
          </button>
        ))}
      </div>
    </div>
  );
}
