import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { Board } from "./board.ts";
import { HEARTBEAT_MS, Registration, type Metadata } from "./registry.ts";
import { transition } from "./state.ts";

export default function (pi: ExtensionAPI): void {
  const root = join(getAgentDir(), "pi-session-board");
  let registration: Registration | undefined;
  let metadata: Metadata | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let warned = false;
  let boardOpen = false;

  function warn(ctx: ExtensionContext): void {
    if (!warned) ctx.ui.notify("Session Board cannot update its registry; retrying.", "warning");
    warned = true;
  }
  async function publish(ctx: ExtensionContext): Promise<void> {
    if (!registration || !metadata) return;
    try { await registration.publish(metadata); warned = false; }
    catch { warn(ctx); }
  }
  async function stop(ctx: ExtensionContext): Promise<void> {
    clearInterval(timer);
    timer = undefined;
    const old = registration;
    registration = undefined;
    metadata = undefined;
    try { await old?.close(); } catch { warn(ctx); }
  }

  pi.on("session_start", async (_event, ctx) => {
    await stop(ctx);
    if (ctx.mode !== "tui") return;
    registration = new Registration(root);
    metadata = {
      sessionId: ctx.sessionManager.getSessionId(), name: ctx.sessionManager.getSessionName() ?? "",
      cwd: ctx.cwd, status: ctx.isIdle() ? "idle" : "working", statusSince: Date.now(),
    };
    await publish(ctx);
    timer = setInterval(() => void publish(ctx), HEARTBEAT_MS);
  });
  pi.on("session_shutdown", async (_event, ctx) => { await stop(ctx); });
  pi.on("session_info_changed", async (event, ctx) => {
    if (metadata) { metadata.name = event.name ?? ""; await publish(ctx); }
  });
  pi.on("agent_start", async (_event, ctx) => {
    if (metadata) { metadata = { ...metadata, ...transition(metadata, "working", Date.now()) }; await publish(ctx); }
  });
  pi.on("agent_settled", async (_event, ctx) => {
    if (metadata) { metadata = { ...metadata, ...transition(metadata, "idle", Date.now()) }; await publish(ctx); }
  });
  pi.registerCommand("sessions", {
    description: "Observe running Pi terminal sessions",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui" || boardOpen) return;
      boardOpen = true;
      try {
        await ctx.ui.custom<void>((tui, theme, _keys, done) =>
          new Board(root, registration?.id, theme, () => tui.requestRender(), () => tui.terminal.rows, () => done()),
        { overlay: true, overlayOptions: { width: "90%", maxHeight: "90%" } });
      } finally { boardOpen = false; }
    },
  });
}
