import {
  __setWebSocketImplForTests,
  connect,
  disconnect,
  getStatus,
  once,
  send,
  subscribe
} from "./wsClient";

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;

    // Handlers (set by wsClient)
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;

    // Track outbound frames for assertions
    this.sent = [];

    FakeWebSocket.instances.push(this);
  }

  send(data) {
    if (this.readyState !== FakeWebSocket.OPEN) throw new Error("not open");
    this.sent.push(data);
  }

  close(code = 1000, reason = "") {
    this.readyState = FakeWebSocket.CLOSED;
    if (typeof this.onclose === "function") {
      this.onclose({ code, reason, wasClean: true });
    }
  }

  // test helpers
  __open() {
    this.readyState = FakeWebSocket.OPEN;
    if (typeof this.onopen === "function") this.onopen();
  }

  __message(data) {
    if (typeof this.onmessage === "function") this.onmessage({ data });
  }

  __error(err) {
    if (typeof this.onerror === "function") this.onerror(err || new Error("ws error"));
  }
}
FakeWebSocket.instances = [];

function resetInstances() {
  FakeWebSocket.instances = [];
}

describe("wsClient", () => {
  beforeEach(() => {
    resetInstances();
    disconnect();

    // Ensure we don't accidentally use real env set by CI.
    delete process.env.REACT_APP_WS_URL;

    // Jest runs in jsdom; ensure global WebSocket exists for wsClient's readyState checks.
    global.WebSocket = FakeWebSocket;

    __setWebSocketImplForTests(FakeWebSocket);
  });

  afterEach(() => {
    disconnect();
  });

  test("connect() enters mock mode when REACT_APP_WS_URL is not set", async () => {
    connect({ path: "/ws" });

    // mock emits open asynchronously
    const payload = await once("open");
    expect(payload.isMock).toBe(true);

    const st = getStatus();
    expect(st.state).toBe("mock");
    expect(st.isMock).toBe(true);

    // Sending should not throw; it should echo via message event in mock mode.
    const msgPromise = once("message");
    send({ event: "hello", data: { a: 1 } });
    const msg = await msgPromise;
    expect(msg.isMock).toBe(true);
  });

  test("queues outbound messages until connection opens, then flushes", async () => {
    process.env.REACT_APP_WS_URL = "ws://example.test";

    connect({ path: "/ws", autoReconnect: false });

    // We should have constructed a FakeWebSocket but not yet opened it.
    expect(FakeWebSocket.instances.length).toBe(1);
    const inst = FakeWebSocket.instances[0];

    // Send before open -> should queue.
    send({ event: "queued", data: 123 });
    expect(getStatus().queued).toBe(1);
    expect(inst.sent.length).toBe(0);

    // Install listener before opening so we don't miss the event.
    const openPromise = once("open");
    inst.__open();
    await openPromise;

    expect(getStatus().queued).toBe(0);
    expect(inst.sent.length).toBe(1);

    const parsed = JSON.parse(inst.sent[0]);
    expect(parsed.event).toBe("queued");
    expect(parsed.data).toBe(123);
  });

  test('emits custom event for JSON message with shape { "event": "...", "data": ... }', async () => {
    process.env.REACT_APP_WS_URL = "ws://example.test";

    connect({ path: "/ws", autoReconnect: false });

    const inst = FakeWebSocket.instances[0];

    const openPromise = once("open");
    inst.__open();
    await openPromise;

    const received = [];
    const off = subscribe("roomJoined", (payload) => received.push(payload));

    inst.__message(JSON.stringify({ event: "roomJoined", data: { roomId: "abc" } }));

    // Give microtask time for handler
    await Promise.resolve();

    expect(received.length).toBe(1);
    expect(received[0].roomId).toBe("abc");

    off();
  });
});
