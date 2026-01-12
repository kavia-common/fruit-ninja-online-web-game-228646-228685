import { useEffect, useMemo, useState } from "react";
import { getStatus, subscribe } from "./wsClient";

/**
 * PUBLIC_INTERFACE
 * React hook to track websocket connection status from wsClient.
 *
 * Usage:
 *   const ws = useWebSocketStatus();
 *   return <div>{ws.state}</div>
 */
// PUBLIC_INTERFACE
export function useWebSocketStatus() {
  /** Hook: subscribes to wsClient "status" events and exposes a stable status object. */
  const initial = useMemo(() => getStatus(), []);
  const [status, setStatus] = useState(initial);

  useEffect(() => {
    const off = subscribe("status", () => {
      setStatus(getStatus());
    });

    // Also refresh once in case we missed a status change between render and subscription.
    setStatus(getStatus());

    return () => off();
  }, []);

  return status;
}
