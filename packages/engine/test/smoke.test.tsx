// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { GitSwimlanes } from "../src/ui/GitSwimlanes.js";

afterEach(cleanup);

describe("jsdom + Testing Library smoke", () => {
  it("renders the GitSwimlanes component into the DOM", () => {
    render(<GitSwimlanes />);
    expect(screen.getByText(/Git Swimlanes/i)).toBeInTheDocument();
  });
});
