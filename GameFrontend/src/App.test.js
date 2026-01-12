import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders home screen title", () => {
  render(<App />);
  const title = screen.getByText(/fruit ninja online/i);
  expect(title).toBeInTheDocument();
});
