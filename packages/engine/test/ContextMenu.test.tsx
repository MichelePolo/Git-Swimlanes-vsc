// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ContextMenu, type MenuItem } from "../src/ui/ContextMenu.js";

afterEach(cleanup);

const items: MenuItem[] = [
  { label: "Crea branch qui", onSelect: () => {} },
  { label: 'Elimina tag "v1"', onSelect: () => {}, danger: true },
];

describe("ContextMenu", () => {
  it("renders each item label", () => {
    render(<ContextMenu x={10} y={20} items={items} onClose={() => {}} />);
    expect(screen.getByText("Crea branch qui")).toBeInTheDocument();
    expect(screen.getByText('Elimina tag "v1"')).toBeInTheDocument();
  });

  it("marks danger items with the danger class", () => {
    const { container } = render(<ContextMenu x={0} y={0} items={items} onClose={() => {}} />);
    expect(container.querySelector(".ctx-item.danger")).not.toBeNull();
  });

  it("invokes onSelect and onClose when an item is clicked", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} items={[{ label: "Go", onSelect }]} onClose={onClose} />);
    fireEvent.click(screen.getByText("Go"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} items={items} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on an outside click", () => {
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} items={items} onClose={onClose} />);
    fireEvent.click(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
