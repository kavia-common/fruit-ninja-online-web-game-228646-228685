# E2E Smoke Checks (REST + Scores + WebSocket)

This repo includes a small Node-based smoke script that verifies frontend↔backend integration using the configured `REACT_APP_*` env vars.

## Prerequisites

From `GameFrontend/`:

```bash
npm install
```

If WebSocket smoke fails with missing `ws`, install:

```bash
npm i -D ws
```

## Configure env

Typical local env:

```bash
export REACT_APP_API_BASE="http://localhost:3010"
export REACT_APP_HEALTHCHECK_PATH="/health"
export REACT_APP_WS_URL="ws://localhost:3010/ws"
```

## Run smoke

```bash
node utils/e2e-smoke.js
```

Success criteria:
- Health endpoint returns HTTP 200 with JSON.
- Score POST succeeds (200/201) and the score appears in `/scores/top`.
- WS receives `queue:joined` then `match:found` using `{event,data}` messages.

## Note about preview connectivity

During automated execution in the runner, the configured preview backend URL:

- `https://vscode-internal-31776-beta.beta01.cloud.kavia.ai:8000`

returned **connection refused** (curl error 7). This indicates the backend service is not listening on `:8000` at that host from the runner network.

If you expect preview-to-preview communication, ensure the backend is actually running/exposed on that port and reachable from where the smoke script is executed.
