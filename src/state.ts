export type Status = "working" | "idle";

export interface Activity {
  status: Status;
  statusSince: number;
}

export function transition(state: Activity, status: Status, now: number): Activity {
  return state.status === status ? state : { status, statusSince: now };
}

export function safeText(text: string, limit = 512): string {
  return text.replace(/[\x00-\x1f\x7f-\x9f]/g, "").slice(0, limit);
}
