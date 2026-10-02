import type { Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { readRows, type Row } from "./registry.ts";
import { safeText } from "./state.ts";

export function boardHeight(terminalRows: number): number {
  return Math.max(5, Math.floor(terminalRows * 0.9));
}

function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : `${Math.floor(seconds / 3600)}h`;
}

export function activityLabel(row: Row): string {
  if (row.status === "unknown") return "No heartbeat";
  if (row.status === "needs-input") return "Waiting for input";
  if (row.status === "failed") return "Run failed";
  if (row.activity === "compacting") return "Compacting";
  if (row.activity === "aborted") return "Aborted";
  if (row.tools?.length) return `Tool: ${row.tools.map(name => safeText(name, 128)).join(", ")}`;
  return row.status === "working" ? "Generating" : "Ready";
}

export function rowLines(row: Row, current: string | undefined, now: number): string[] {
  const age = row.status === "unknown" ? `last seen ${elapsed(now - row.heartbeatAt)} ago` : elapsed(now - row.statusSince);
  return [
    `  ${safeText(row.name || row.sessionId.slice(0, 8))}${row.registrationId === current ? " [current]" : ""} · ${age}`,
    `  ${safeText(row.cwd, 4096)} · ${activityLabel(row)}${row.waitingUnavailable ? " · Waiting detection unavailable (board UI)" : ""}`,
  ];
}

export class Board {
  private rows: Row[] = [];
  private error = false;
  private offset = 0;
  private capacity = 1;
  private timer: ReturnType<typeof setInterval>;
  private disposed = false;
  private reading = false;

  private root: string;
  private current: string | undefined;
  private theme: Pick<Theme, "fg">;
  private requestRender: () => void;
  private height: () => number;
  private done: () => void;

  constructor(
    root: string, current: string | undefined, theme: Pick<Theme, "fg">,
    requestRender: () => void, height: () => number, done: () => void,
  ) {
    this.root = root;
    this.current = current;
    this.theme = theme;
    this.requestRender = requestRender;
    this.height = height;
    this.done = done;
    this.timer = setInterval(() => void this.refresh(), 1000);
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    if (this.disposed || this.reading) return;
    this.reading = true;
    try { this.rows = await readRows(this.root); this.error = false; }
    catch { this.error = true; }
    finally { this.reading = false; }
    if (!this.disposed) this.requestRender();
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape")) { this.done(); return; }
    if (matchesKey(data, "up")) this.offset--;
    if (matchesKey(data, "down")) this.offset++;
    if (matchesKey(data, "pageUp")) this.offset -= this.capacity;
    if (matchesKey(data, "pageDown")) this.offset += this.capacity;
    this.requestRender();
  }

  render(width: number): string[] {
    const content: string[] = [];
    for (const status of ["needs-input", "failed", "working", "idle", "unknown"] as const) {
      const rows = this.rows.filter(row => row.status === status);
      if (!rows.length) continue;
      content.push(this.theme.fg("accent", `${status.replace("-", " ").toUpperCase()} (${rows.length})`));
      for (const row of rows) content.push(...rowLines(row, this.current, Date.now()));
    }
    if (!content.length) content.push("No reporting sessions.");
    this.capacity = Math.max(1, boardHeight(this.height()) - 4);
    this.offset = Math.max(0, Math.min(this.offset, Math.max(0, content.length - this.capacity)));
    const lines = [
      this.theme.fg("accent", `Session Board · ${this.rows.length} sessions`),
      this.error ? "Cannot read session registry; retrying…" : "",
      ...content.slice(this.offset, this.offset + this.capacity),
      "", this.theme.fg("dim", "↑↓ / PgUp / PgDn scroll · Esc close"),
    ];
    return lines.map(line => truncateToWidth(line, Math.max(1, width)));
  }

  invalidate(): void {}
  dispose(): void { this.disposed = true; clearInterval(this.timer); }
}
