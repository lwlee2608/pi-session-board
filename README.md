# Session Board

A read-only native Pi overlay for independent interactive sessions across projects.
Run `/sessions` in any participating terminal. Each terminal must load the extension
and use the same Pi agent directory. No central launcher or server is needed.

Requires Node 22.19+; tested with Pi 1.0.0 on Linux. Older Pi releases are not supported.

## Try the checkout

```sh
npm ci --ignore-scripts
npm run check
npm test
pi -e /absolute/path/to/pi-session-board/src/index.ts
```

Start another Pi terminal with the same extension. `/sessions` shows session names,
project paths, activity, and elapsed time in the current status.
The current terminal is marked. The board refreshes each second; use arrows or
Page Up/Down to scroll and Esc to close. Closing it does not interrupt the agent.
Groups are Needs input, Failed, Working, Idle, and Unknown. A recovered tool error
is not a failed run. Idle means the run stopped, not that your task is complete.

## Local two-terminal verification

Use disposable directories, not your normal agent configuration:

```sh
ROOT=$(mktemp -d)
mkdir -p "$ROOT/agent" "$ROOT/A" "$ROOT/B"
export PI_CODING_AGENT_DIR="$ROOT/agent" PI_TELEMETRY=0
# In two terminals, use the same ROOT and extension path, but cd to A and B respectively:
cd "$ROOT/A"
pi --offline -ne -ns -np -nc -na -e /absolute/path/to/pi-session-board/src/index.ts --name A
```

In B use `--name B`. In A open `/sessions`: both paths appear and A is current.
In B run `/name renamed-B`: A updates within two seconds. Quit B with Ctrl+D at
an empty editor: its row disappears. Esc closes A's board; type an unsent marker
to confirm the editor still works, clear it, then quit. No model calls are needed.

## Local metadata

Records live in `<agent-dir>/pi-session-board/`, private to your Linux user.
Only session identity/name, project directory, status, tool names, generic activity,
waiting-detection availability, and timestamps are stored.
No prompts, arguments, outputs, or transcripts are copied. Heartbeats run every
5 seconds. A missing heartbeat becomes Unknown at 20 seconds and is hidden at
5 minutes; this is not proof that a process crashed. Clean exits remove their
own records. The board never removes another writer's record.

## Attention detection

Needs input means a native extension question during active work. Idle pickers,
external-terminal input, and questions written as assistant prose do not count.
Pi 1.0 reports only the outermost UI interaction. While the board is open, an
incoming question has no separate event. The row therefore says **Waiting detection
unavailable (board UI)**, not Needs input. This label persists until the entire
outer interaction ends, including a question that outlives the board. Questions
still receive keyboard input; answering lets work continue. Abort returns to Idle;
the Aborted activity label is shown only when Pi reports an aborted outcome.

### Offline attention-state verification

Use the disposable setup above and add these arguments in both terminals:

```sh
-e /absolute/path/to/pi-session-board/test/fixtures/offline.ts --model board-offline/fixture
```

The fixture is test-only, uses no network or credentials, and is excluded from
package distribution. Open `/sessions` in A. In B:

1. Send `question`: observe Working for eight seconds, then Needs input. Answer
   the native confirmation; observe Idle.
2. Send `work`, then `/sessions` during the eight-second tool. It stays Working,
   with the waiting-detection limitation label. Esc closes only the board.
3. Send `question`, then `/sessions` before the question arrives. The native
   question remains usable; press Enter to answer and observe Idle. Esc closes
   the board. This overlap is explicitly not classified as Needs input.
4. Send `fail`: observe Failed. Send `work`: it clears the previous failure.
   Press Esc during work: observe Idle, not Failed.

The fixture's private prompt/output/error markers must never appear in registry
JSON. It deliberately does not implement a general-purpose model service.

## Development

`npm run check` type-checks without building; `npm test` runs Node's test runner.
Pi loads the TypeScript source directly. Host packages are peers, not bundled
runtime dependencies. Tests use temporary registry directories.
