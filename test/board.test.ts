import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Registration } from "../src/registry.ts";
import { Board, rowLines } from "../src/board.ts";
import { transition } from "../src/state.ts";
import type { Row } from "../src/registry.ts";

const row: Row = {
  version: 1, registrationId: "current", sessionId: "session", name: "Fix auth", cwd: "/api",
  status: "working", statusSince: 1000, heartbeatAt: 2000, startedAt: 1000,
};

test("rows show current identity, project, activity and status age", () => {
  assert.deepEqual(rowLines(row, "current", 121000), ["  Fix auth [current] · 2m", "  /api · Generating"]);
  assert.match(rowLines({ ...row, status: "unknown" }, undefined, 22000)[0], /last seen 20s ago/);
});

test("scrolling reaches the last detail line within the overlay height", async () => {
  const root = await mkdtemp(join(tmpdir(), "board-scroll-"));
  let board: Board | undefined;
  try {
    for (let i = 0; i < 30; i++) {
      await new Registration(root, () => Date.now() + i).publish({
        sessionId: String(i), name: `session-${i}`, cwd: `/project-${i}`,
        status: "idle", statusSince: Date.now(),
      });
    }
    let refreshed!: () => void;
    const ready = new Promise<void>(resolve => { refreshed = resolve; });
    board = new Board(root, undefined, { fg: (_color, text) => text }, refreshed, () => 50, () => {});
    await ready;
    board.render(80);
    for (let i = 0; i < 100; i++) board.handleInput("\x1b[B");
    const lines = board.render(80);
    assert.ok(lines.length <= 45);
    assert.ok(lines.some(line => line.includes("/project-29")));
    assert.match(lines.at(-1)!, /Esc close/);
  } finally { board?.dispose(); await rm(root, { recursive: true, force: true }); }
});

test("heartbeats and repeated states do not reset elapsed time", () => {
  const state = { status: "idle" as const, statusSince: 1 };
  assert.equal(transition(state, "idle", 5), state);
  assert.deepEqual(transition(state, "working", 5), { status: "working", statusSince: 5 });
});

test("board consumes escape and disposes its refresh timer", () => {
  let closed = false;
  const board = new Board("/nonexistent-board-test", undefined, { fg: (_color, text) => text }, () => {}, () => 24, () => { closed = true; });
  try {
    assert.match(board.render(80).join("\n"), /Session Board/);
    board.handleInput("\x1b");
    assert.equal(closed, true);
  } finally { board.dispose(); }
});
