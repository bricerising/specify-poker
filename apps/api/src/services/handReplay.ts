import { HandState } from "../engine/types";
import { HandEvent } from "./eventStore";

export function replayHand(events: HandEvent[]): HandState | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const snapshot = events[i].payload?.snapshot as HandState | undefined;
    if (snapshot) {
      return snapshot;
    }
  }
  return null;
}
