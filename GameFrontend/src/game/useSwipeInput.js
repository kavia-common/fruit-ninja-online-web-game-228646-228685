import { useCallback, useEffect, useRef, useState } from "react";

function getRelativePos(evt, element) {
  const rect = element.getBoundingClientRect();

  // Touch events: use first touch
  if (evt.touches && evt.touches[0]) {
    return {
      x: evt.touches[0].clientX - rect.left,
      y: evt.touches[0].clientY - rect.top
    };
  }

  // Mouse / pointer-like
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top
  };
}

// PUBLIC_INTERFACE
export function useSwipeInput(targetRef, options = {}) {
  /**
   * Tracks swipe points (x,y,t) on a given element ref.
   * Keeps only recent points (by age and max length) for slicing logic.
   */
  const maxPoints = typeof options.maxPoints === "number" ? options.maxPoints : 24;
  const maxAgeMs = typeof options.maxAgeMs === "number" ? options.maxAgeMs : 140;

  const [isSwiping, setIsSwiping] = useState(false);
  const pointsRef = useRef([]);
  const [, setTick] = useState(0);

  const prune = useCallback((now) => {
    const pts = pointsRef.current;
    const pruned = pts.filter((p) => now - p.t <= maxAgeMs).slice(-maxPoints);
    pointsRef.current = pruned;
  }, [maxAgeMs, maxPoints]);

  const addPoint = useCallback(
    (evt) => {
      const el = targetRef.current;
      if (!el) return;

      const now = performance.now();
      const pos = getRelativePos(evt, el);

      pointsRef.current = [...pointsRef.current, { ...pos, t: now }].slice(-maxPoints);
      prune(now);

      // nudge rerender for overlays/debug
      setTick((x) => (x + 1) % 1000000);
    },
    [prune, maxPoints, targetRef]
  );

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    const onMouseDown = (e) => {
      setIsSwiping(true);
      pointsRef.current = [];
      addPoint(e);
    };
    const onMouseMove = (e) => {
      if (!isSwiping) return;
      addPoint(e);
    };
    const onMouseUp = () => setIsSwiping(false);

    // Touch
    const onTouchStart = (e) => {
      setIsSwiping(true);
      pointsRef.current = [];
      addPoint(e);
    };
    const onTouchMove = (e) => {
      if (!isSwiping) return;
      // Prevent scroll while playing
      e.preventDefault();
      addPoint(e);
    };
    const onTouchEnd = () => setIsSwiping(false);
    const onTouchCancel = () => setIsSwiping(false);

    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchCancel);

    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);

      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [addPoint, isSwiping, targetRef]);

  const clearPoints = useCallback(() => {
    pointsRef.current = [];
    setTick((x) => (x + 1) % 1000000);
  }, []);

  // PUBLIC_INTERFACE
  const getPoints = useCallback(() => {
    /** Returns current swipe points. */
    return pointsRef.current;
  }, []);

  return {
    isSwiping,
    getPoints,
    clearPoints
  };
}
