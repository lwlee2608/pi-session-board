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
project paths, basic Working/Idle activity, and elapsed time in the current status.
The current terminal is marked. The board refreshes each second; use arrows or
Page Up/Down to scroll and Esc to close. Closing it does not interrupt the agent.
Attention states and interruption hardening are planned in the remaining phases.

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
Only session identity/name, project directory, status, and timestamps are stored.
No prompts, arguments, outputs, or transcripts are copied. Heartbeats run every
5 seconds. A missing heartbeat becomes Unknown at 20 seconds and is hidden at
5 minutes; this is not proof that a process crashed. Clean exits remove their
own records. The board never removes another writer's record.

## Development

`npm run check` type-checks without building; `npm test` runs Node's test runner.
Pi loads the TypeScript source directly. Host packages are peers, not bundled
runtime dependencies. Tests use temporary registry directories.
