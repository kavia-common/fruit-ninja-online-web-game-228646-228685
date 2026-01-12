/* eslint-disable no-console */

/**
 * E2E smoke checks (frontend perspective, but runnable from Node):
 * 1) REST health: GET `${REACT_APP_API_BASE}${REACT_APP_HEALTHCHECK_PATH}` expects 200 JSON
 * 2) Score flow: POST `${REACT_APP_API_BASE}/scores` then GET `${REACT_APP_API_BASE}/scores/top` and confirm presence
 * 3) WebSocket flow: connect to `${REACT_APP_WS_URL}` then send `{event:'queue:join', data:{...}}`
 *    and verify receipt of `queue:joined` and `match:found` messages using {event,data} protocol.
 *
 * Usage:
 *   node utils/e2e-smoke.js
 *
 * Env:
 *   REACT_APP_API_BASE=http://localhost:3010
 *   REACT_APP_HEALTHCHECK_PATH=/health
 *   REACT_APP_WS_URL=ws://localhost:3010/ws
 */

const API_BASE = (process.env.REACT_APP_API_BASE || "").replace(/\/+$/, "");
const HEALTH_PATH = process.env.REACT_APP_HEALTHCHECK_PATH || "/health";
const WS_URL = process.env.REACT_APP_WS_URL || "";

function requireEnv(name, val) {
  if (!val) {
    throw new Error(`Missing required env ${name}`);
  }
}

async function httpJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      "content-type": "application/json",
      ...(opts.headers || {})
    }
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }
  return { res, text, json };
}

async function healthCheck() {
  requireEnv("REACT_APP_API_BASE", API_BASE);

  const url = `${API_BASE}${HEALTH_PATH.startsWith("/") ? "" : "/"}${HEALTH_PATH}`;
  const { res, text, json } = await httpJson(url, { method: "GET" });

  console.log("[health] url:", url);
  console.log("[health] status:", res.status);
  console.log("[health] body:", json ?? text);

  if (res.status !== 200) throw new Error(`Health check failed: ${res.status}`);
  if (json && typeof json !== "object") throw new Error("Health check did not return JSON object");
}

async function scoreFlow() {
  requireEnv("REACT_APP_API_BASE", API_BASE);

  const playerName = `smoke-${Date.now()}`;
  const scoreValue = Math.floor(100 + Math.random() * 900);

  const postUrl = `${API_BASE}/scores`;
  const postPayload = { name: playerName, score: scoreValue };

  const post = await httpJson(postUrl, { method: "POST", body: JSON.stringify(postPayload) });
  console.log("[score] POST /scores status:", post.res.status);
  console.log("[score] POST /scores body:", post.json ?? post.text);
  if (post.res.status !== 200 && post.res.status !== 201) {
    throw new Error(`Score submit failed: ${post.res.status}`);
  }

  const getUrl = `${API_BASE}/scores/top`;
  const get = await httpJson(getUrl, { method: "GET" });
  console.log("[score] GET /scores/top status:", get.res.status);
  console.log("[score] GET /scores/top body:", get.json ?? get.text);
  if (get.res.status !== 200) throw new Error(`Leaderboard fetch failed: ${get.res.status}`);

  const entries = Array.isArray(get.json) ? get.json : get.json?.scores || [];
  const found = entries.some((e) => e && (e.name === playerName || e.player === playerName) && Number(e.score) === scoreValue);
  if (!found) {
    throw new Error(`Submitted score not found on leaderboard: ${playerName}=${scoreValue}`);
  }

  console.log("[score] OK: score found on leaderboard");
}

async function wsFlow() {
  requireEnv("REACT_APP_WS_URL", WS_URL);

  // Use the 'ws' package if available (it should be as a transitive dep in many setups),
  // otherwise fail with a clear message.
  let WebSocketImpl;
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies, global-require
    WebSocketImpl = require("ws");
  } catch (e) {
    throw new Error(
      "WS smoke requires 'ws' npm package. Install with: npm i -D ws (or add it as a dependency). Original error: " +
        String(e && e.message ? e.message : e)
    );
  }

  console.log("[ws] connecting:", WS_URL);

  const ws = new WebSocketImpl(WS_URL);

  const waitForEvent = (eventName, timeoutMs = 6000) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`Timed out waiting for WS event '${eventName}'`)), timeoutMs);

      function onMessage(raw) {
        let msg = raw;
        try {
          msg = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(raw.toString("utf8"));
        } catch {
          return;
        }
        if (msg && msg.event === eventName) {
          clearTimeout(t);
          ws.off("message", onMessage);
          resolve(msg);
        }
      }

      ws.on("message", onMessage);
    });

  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });

  // Send queue join (protocol: {event,data})
  const joinMsg = { event: "queue:join", data: { mode: "casual" } };
  ws.send(JSON.stringify(joinMsg));

  const joined = await waitForEvent("queue:joined", 6000);
  console.log("[ws] received queue:joined:", joined);

  const found = await waitForEvent("match:found", 10000);
  console.log("[ws] received match:found:", found);

  ws.close();
  console.log("[ws] OK: queue:joined and match:found received");
}

async function main() {
  console.log("E2E smoke starting with env:", {
    REACT_APP_API_BASE: process.env.REACT_APP_API_BASE,
    REACT_APP_HEALTHCHECK_PATH: process.env.REACT_APP_HEALTHCHECK_PATH,
    REACT_APP_WS_URL: process.env.REACT_APP_WS_URL
  });

  await healthCheck();
  await scoreFlow();
  await wsFlow();

  console.log("E2E smoke: SUCCESS");
}

main().catch((e) => {
  console.error("E2E smoke: FAILED");
  console.error(e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
