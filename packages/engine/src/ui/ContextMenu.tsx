import { useEffect, Fragment } from "react";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  /** Render a divider above this item (groups menu sections). */
  separator?: boolean;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

/**
 * A small positioned popup menu for ref actions. Closes on Escape or any outside click.
 * `x`/`y` are viewport coordinates (the menu is `position: fixed`). Clicks inside the menu
 * are stopped so they don't trigger the outside-click close before the item handler runs.
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    const onDocClick = (): void => onClose();
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onDocClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onDocClick);
    };
  }, [onClose]);

  return (
    <div className="ctx-menu" style={{ left: x, top: y }} role="menu" onClick={(e) => e.stopPropagation()}>
      {items.map((it, i) => (
        <Fragment key={i}>
          {it.separator && <div className="ctx-sep" role="separator" />}
          <button
            type="button"
            role="menuitem"
            className={`ctx-item${it.danger ? " danger" : ""}`}
            onClick={() => {
              it.onSelect();
              onClose();
            }}
          >
            {it.label}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
