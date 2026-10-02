import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { HIDE_MS, Registration, readRows, UNKNOWN_MS, type Metadata } from "../src/registry.ts";

const metadata: Metadata = { sessionId: "s1", name: "first", cwd: "/project", status: "idle", statusSince: 1000 };

test("independent writers atomically replace private records and remove only their own", async () => {
  const root = await mkdtemp(join(tmpdir(), "board-test-"));
  try {
    const a = new Registration(root, () => 1000);
    const b = new Registration(root, () => 1000);
    await Promise.all([a.publish(metadata), b.publish({ ...metadata, sessionId: "s2" })]);
    assert.equal((await stat(root)).mode & 0o777, 0o700);
    for (const file of await readdir(root)) assert.equal((await stat(join(root, file))).mode & 0o777, 0o600);
    const writes = Array.from({ length: 12 }, (_, i) => a.publish({ ...metadata, name: `name-${i}` }));
    for (let i = 0; i < 12; i++) assert.equal((await readRows(root, 1000)).length, 2);
    await Promise.all(writes);
    assert.equal((await readRows(root, 1000)).find(r => r.registrationId === a.id)?.name, "name-11");
    assert.equal((await readdir(root)).length, 2);
    await a.close(); await a.close();
    assert.deepEqual((await readRows(root, 1000)).map(r => r.registrationId), [b.id]);
    await b.close();
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("heartbeat boundaries use the supplied clock and never delete expired records", async () => {
  const root = await mkdtemp(join(tmpdir(), "board-test-"));
  let now = 1000;
  try {
    const writer = new Registration(root, () => now);
    await writer.publish(metadata);
    assert.equal((await readRows(root, now + UNKNOWN_MS - 1))[0].status, "idle");
    assert.equal((await readRows(root, now + UNKNOWN_MS))[0].status, "unknown");
    assert.equal((await readRows(root, now + HIDE_MS - 1)).length, 1);
    assert.equal((await readRows(root, now + HIDE_MS)).length, 0);
    assert.equal((await readdir(root)).length, 1);
    now += HIDE_MS;
    await writer.publish(metadata);
    const [row] = await readRows(root, now);
    assert.equal(row.status, "idle");
    assert.equal(row.statusSince, 1000);
    await writer.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});
