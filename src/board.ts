import type { Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { readRows, type Row } from "./registry.ts";
import { safeText } from "./state.ts";

function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : `${Math.floor(seconds / 3600)}h`;
}

export function rowLines(row: Row, current: string | undefined, now: number): string[] {
  const age = row.status === "unknown" ? `last seen ${elapsed(now - row.heartbeatAt)} ago` : elapsed(now - row.statusSince);
  return [
    `  ${safeText(row.name || row.sessionId.slice(0, 8))}${row.registrationId === current ? " [current]" : ""} · ${age}`,
    `  ${safeText(row.cwd, 4096)} · ${row.status === "working" ? "Generating" : row.status === "idle" ? "Ready" : "No heartbeat"}`,
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
    for (const status of ["working", "idle", "unknown"] as const) {
      const rows = this.rows.filter(row => row.status === status);
      if (!rows.length) continue;
      content.push(this.theme.fg("accent", `${status.toUpperCase()} (${rows.length})`));
      for (const row of rows) content.push(...rowLines(row, this.current, Date.now()));
    }
    if (!content.length) content.push("No reporting sessions.");
    this.capacity = Math.max(1, this.height() - 6);
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
