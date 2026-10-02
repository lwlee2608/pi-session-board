import type { Theme } from "@earendil-works/pi-coding-agent";
import { basename } from "node:path";
import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { readRows, type Row } from "./registry.ts";
import { safeText } from "./state.ts";

const groups = [
  ["needs-input", "Needs input", "warning", "✱"],
  ["failed", "Failed", "error", "!"],
  ["working", "Working", "accent", "·"],
  ["idle", "Idle", "dim", "·"],
  ["unknown", "Unknown", "warning", "?"],
] as const;

function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m`
    : seconds < 86400 ? `${Math.floor(seconds / 3600)}h` : `${Math.floor(seconds / 86400)}d`;
}

function fit(text: string, width: number): string {
  if (width <= 0) return "";
  const clipped = truncateToWidth(text, width);
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
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

export function rowLine(row: Row, current: string | undefined, now: number, width: number): string {
  const project = basename(safeText(row.cwd, 4096)) || "/";
  const name = safeText(row.name) || row.registrationId.slice(-8);
  const identity = (space: number): string => {
    if (space < 12) return fit(name, space);
    const nameSpace = Math.min(visibleWidth(name), Math.max(8, Math.floor(space * 0.6)));
    const projectSpace = Math.min(visibleWidth(project), Math.max(1, space - nameSpace - 3));
    return `${fit(project, projectSpace)} / ${fit(name, space - projectSpace - 3)}`;
  };
  const marker = row.registrationId === current ? "›" : groups.find(g => g[0] === row.status)![3];
  const badge = row.waitingUnavailable ? "?" : " ";
  const age = `${row.status === "unknown" ? "seen " : ""}${elapsed(now - (row.status === "unknown" ? row.heartbeatAt : row.statusSince))}`;
  if (width < 36) return fit(`${marker}${badge} ${identity(Math.max(0, width - 3))}`, width);
  const ageWidth = Math.max(5, age.length);
  const nameWidth = Math.min(40, Math.floor((width - 3) * 0.4));
  const activityWidth = Math.max(0, width - nameWidth - ageWidth - 7);
  return `${marker}${badge} ${identity(nameWidth)}  ${fit(activityLabel(row), activityWidth)}  ${age.padStart(ageWidth)}`;
}

export class Board {
  focused = false;
  private rows: Row[] = [];
  private error = false;
  private offset = 0;
  private capacity = 1;
  private anchor: string | undefined;
  private anchorOffset = 0;
  private userScrolled = false;
  private timer: ReturnType<typeof setInterval>;
  private disposed = false;
  private reading = false;
  private root: string;
  private current: string | undefined;
  private theme: Pick<Theme, "fg">;
  private requestRender: () => void;
  private height: () => number;
  private done: () => void;
  private visible: () => boolean;

  constructor(
    root: string, current: string | undefined, theme: Pick<Theme, "fg">,
    requestRender: () => void, height: () => number, done: () => void, visible = () => true,
  ) {
    this.root = root;
    this.current = current;
    this.theme = theme;
    this.requestRender = requestRender;
    this.height = height;
    this.done = done;
    this.visible = visible;
    this.timer = setInterval(() => void this.refresh(), 1000);
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    if (this.disposed || this.reading) return;
    this.reading = true;
    try { this.rows = await readRows(this.root); this.error = false; }
    catch { this.error = true; this.rows = []; }
    finally { this.reading = false; }
    if (!this.disposed) this.requestRender();
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape")) { this.done(); return; }
    if (matchesKey(data, "up")) this.offset--;
    if (matchesKey(data, "down")) this.offset++;
    if (matchesKey(data, "pageUp")) this.offset -= this.capacity;
    if (matchesKey(data, "pageDown")) this.offset += this.capacity;
    this.userScrolled = true;
    this.requestRender();
  }

  render(width: number): string[] {
    if (!this.visible()) return [];
    width = Math.max(1, width);
    const height = Math.max(1, this.height());
    if (height < 7) return Array.from({ length: height }, (_, i) => fit(i === 0 ? "Session Board · Esc return" : "", width));
    const inner = Math.max(1, width - 2);
    const content: string[] = [];
    const keys: string[] = [];
    const counts: string[] = [];
    for (const [status, label, color] of groups) {
      const rows = this.rows.filter(row => row.status === status);
      if (!rows.length) continue;
      counts.push(`${rows.length} ${label.toLowerCase()}`);
      if (content.length) { content.push(""); keys.push(`group:${status}:gap`); }
      content.push(this.theme.fg("dim", label));
      keys.push(`group:${status}`);
      for (const row of rows) {
        content.push(this.theme.fg(row.registrationId === this.current ? "text" : color,
          rowLine(row, this.current, Date.now(), inner)));
        keys.push(row.registrationId);
      }
    }
    if (!content.length) content.push(this.error ? "Cannot read session registry; retrying…" : "No reporting sessions.");
    this.capacity = height - 6;
    if (!this.userScrolled && this.anchor && this.offset > 0) {
      const position = keys.indexOf(this.anchor);
      if (position >= 0) this.offset = position - this.anchorOffset;
    }
    this.offset = Math.max(0, Math.min(this.offset, Math.max(0, content.length - this.capacity)));
    const anchorIndex = keys.findIndex((key, i) => i >= this.offset && !key.startsWith("group:"));
    this.anchor = keys[anchorIndex];
    this.anchorOffset = anchorIndex - this.offset;
    this.userScrolled = false;
    const body = content.slice(this.offset, this.offset + this.capacity);
    while (body.length < this.capacity) body.push("");
    const limited = this.rows.some(row => row.waitingUnavailable);
    const range = content.length > this.capacity ? ` · ${this.offset + 1}–${Math.min(content.length, this.offset + this.capacity)}/${content.length}` : "";
    const lines = [
      this.theme.fg("text", "Session Board"),
      this.theme.fg("dim", counts.join(" · ") || "0 sessions"),
      "", ...body,
      this.theme.fg("dim", "─".repeat(inner)),
      this.theme.fg("dim", limited ? "? waiting detection unavailable · › current session" : "› current session · elapsed time in status"),
      this.theme.fg("dim", `↑↓ / PgUp / PgDn scroll · Esc return${range}`),
    ];
    // Fill every cell so the host transcript cannot show through the surface.
    return lines.map(line => fit(` ${fit(line, inner)}`, width));
  }

  invalidate(): void {}
  dispose(): void { this.disposed = true; clearInterval(this.timer); }
}
