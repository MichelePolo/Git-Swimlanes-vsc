// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { DiffRequest } from "@michelepolo/git-swimlanes-contract";
import { DiffModal } from "../src/ui/DiffModal.js";

afterEach(cleanup);

const req: DiffRequest = { hash: "abc1234", path: "src/app.ts" };

const UNIFIED = ["diff --git a/src/app.ts b/src/app.ts", "@@ -1 +1 @@", "-old", "+new"].join("\n");

describe("DiffModal (spec §5.3)", () => {
  it("shows the file path in the header", () => {
    render(<DiffModal req={req} state={{ status: "loading" }} onClose={() => {}} />);
    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
  });

  it("shows a loading indicator while the diff is being fetched", () => {
    render(<DiffModal req={req} state={{ status: "loading" }} onClose={() => {}} />);
    expect(screen.getByText(/caricamento/i)).toBeInTheDocument();
  });

  it("shows the message on error", () => {
    render(<DiffModal req={req} state={{ status: "error", message: "Binary files differ" }} onClose={() => {}} />);
    expect(screen.getByText(/Binary files differ/)).toBeInTheDocument();
  });

  it("classifies each diff line for coloring", () => {
    const { container } = render(
      <DiffModal req={req} state={{ status: "result", unified: UNIFIED }} onClose={() => {}} />,
    );
    expect(container.querySelector(".dline.meta")!.textContent).toBe("diff --git a/src/app.ts b/src/app.ts");
    expect(container.querySelector(".dline.hunk")!.textContent).toBe("@@ -1 +1 @@");
    expect(container.querySelector(".dline.del")!.textContent).toBe("-old");
    expect(container.querySelector(".dline.add")!.textContent).toBe("+new");
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<DiffModal req={req} state={{ status: "loading" }} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /chiudi/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<DiffModal req={req} state={{ status: "loading" }} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows an 'open file' button that calls onOpenFile when provided", () => {
    const onOpenFile = vi.fn();
    render(<DiffModal req={req} state={{ status: "loading" }} onClose={() => {}} onOpenFile={onOpenFile} />);
    fireEvent.click(screen.getByRole("button", { name: /apri.*editor/i }));
    expect(onOpenFile).toHaveBeenCalledTimes(1);
  });

  it("omits the open-file button when onOpenFile is not provided", () => {
    render(<DiffModal req={req} state={{ status: "loading" }} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /apri.*editor/i })).toBeNull();
  });
});
