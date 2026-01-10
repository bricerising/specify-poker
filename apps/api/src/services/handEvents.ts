import { HandEvent } from "./eventStore";

export interface HandEventNotification {
  tableId: string;
  handId: string;
  event: HandEvent;
}

type HandEventListener = (notification: HandEventNotification) => void;

const listeners = new Set<HandEventListener>();

export function onHandEvent(listener: HandEventListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitHandEvent(notification: HandEventNotification) {
  for (const listener of listeners) {
    listener(notification);
  }
}
