import assert from "node:assert/strict";
import test from "node:test";
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
