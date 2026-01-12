import { render, screen } from "@testing-library/react";
import App from "./App";
import { segmentIntersectsCircle } from "./game/slicing";

test("renders home screen title", () => {
  render(<App />);
  const title = screen.getByText(/fruit ninja online/i);
  expect(title).toBeInTheDocument();
});

test("segmentIntersectsCircle detects intersection", () => {
  // Horizontal line through origin intersects radius 10 circle.
  expect(
    segmentIntersectsCircle(
      { x: -20, y: 0 },
      { x: 20, y: 0 },
      { x: 0, y: 0 },
      10
    )
  ).toBe(true);
});

test("segmentIntersectsCircle detects non-intersection", () => {
  // Segment far above circle does not intersect.
  expect(
    segmentIntersectsCircle(
      { x: -20, y: 50 },
      { x: 20, y: 50 },
      { x: 0, y: 0 },
      10
    )
  ).toBe(false);
});

test("segmentIntersectsCircle treats endpoint inside circle as intersection", () => {
  expect(
    segmentIntersectsCircle(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 0 },
      10
    )
  ).toBe(true);
});
