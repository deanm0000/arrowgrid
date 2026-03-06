import React, { useState, useCallback, useRef, useEffect } from "react";
import { DataEditor, type DrawHeaderCallback, type HeaderClickedEventArgs } from "@glideapps/glide-data-grid";
import type { UseArqueroGridProps, SortSpec } from "../types";
import { useArqueroGrid } from "./useArqueroGrid";

const TRISIZE = 10;
const TRI_HPADDING = 8;
const TRI_VPADDING = 2;
const TRI_HEIGHT = Math.sqrt(0.75 * TRISIZE ** 2);
const MENU_BUTTON_WIDTH = 28;

export function ArqueroGrid(props: UseArqueroGridProps) {
  const [sortBy, setSortBy] = useState<SortSpec[]>([]);
  const [groupBy, setGroupBy] = useState<string[]>([]);
  const [menuState, setMenuState] = useState<{
    colIndex: number;
    bounds: { x: number; y: number; width: number; height: number } | null;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const grid = useArqueroGrid({
    ...props,
    sortBy,
    groupBy,
  });

  const drawHeader = useCallback<DrawHeaderCallback>(
    (args, draw) => {
      const { ctx, rect, columnIndex } = args;
      if (columnIndex < 0) return;

      draw();

      const colName = grid.columns[columnIndex]?.id;
      if (!colName) return;

      const existing = sortBy.find(s => s.column === colName);
      const isAsc = existing && !existing.desc;
      const isDesc = existing && existing.desc;

      const x0 = rect.x + rect.width - TRI_HPADDING - TRISIZE - MENU_BUTTON_WIDTH;
      const yMid = rect.y + rect.height / 2;
      const yDown = yMid + TRI_VPADDING;
      const yUp = yMid - TRI_VPADDING;

      ctx.save();
      ctx.strokeStyle = "black";

      // Down triangle (desc)
      ctx.beginPath();
      ctx.moveTo(x0, yDown);
      ctx.lineTo(x0 + TRISIZE / 2, yDown + TRI_HEIGHT);
      ctx.lineTo(x0 + TRISIZE, yDown);
      ctx.closePath();
      if (isDesc) {
        ctx.fillStyle = "black";
        ctx.fill();
      } else {
        ctx.stroke();
      }

      // Up triangle (asc)
      ctx.beginPath();
      ctx.moveTo(x0, yUp);
      ctx.lineTo(x0 + TRISIZE / 2, yUp - TRI_HEIGHT);
      ctx.lineTo(x0 + TRISIZE, yUp);
      ctx.closePath();
      if (isAsc) {
        ctx.fillStyle = "black";
        ctx.fill();
      } else {
        ctx.stroke();
      }

      ctx.restore();
    },
    [grid.columns, sortBy]
  );

  const onHeaderClicked = useCallback(
    (colIndex: number, event: HeaderClickedEventArgs) => {
      const rect = event.bounds;
      const colName = grid.columns[colIndex]?.id;
      if (!colName) return;

      const x0 = rect.x + rect.width - TRI_HPADDING - TRISIZE - MENU_BUTTON_WIDTH;
      const absX = event.localEventX + rect.x;
      const absY = event.localEventY + rect.y;

      if (absX < x0 || absX > x0 + TRISIZE) return;

      const yMid = rect.y + rect.height / 2;
      const yDown = yMid + TRI_VPADDING;
      const yUp = yMid - TRI_VPADDING;

      let sortAsc: boolean | null = null;

      // Bottom triangle = descending
      if (absY >= yDown && absY <= yDown + TRI_HEIGHT) {
        sortAsc = false; // descending
      }
      // Top triangle = ascending
      else if (absY >= yUp - TRI_HEIGHT && absY <= yUp) {
        sortAsc = true; // ascending
      }

      if (sortAsc === null) return;

      setSortBy(prev => {
        const existing = prev.find(s => s.column === colName);

        // desc = true means descending
        const desc = !sortAsc; // top = asc (desc false), bottom = desc (desc true)

        if (!existing) {
          return [{ column: colName, desc }];
        }

        if (existing.desc === desc) {
          return [];
        }

        return [{ column: colName, desc }];
      });
    },
    [grid.columns]
  );

  const toggleGrouping = useCallback(
    (colName: string) => {
      setGroupBy(prev => {
        if (prev.includes(colName)) {
          return [];
        }

        // Clear sorts unless sorting same column
        setSortBy(existing =>
          existing.filter(s => s.column === colName)
        );

        return [colName];
      });
    },
    []
  );

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuState) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuState(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuState]);

  return (
    <div style={{ position: "relative" }}>
      <DataEditor
        {...grid}
        columns={grid.columns.map(col => ({
          ...col,
          hasMenu: true,
          menuIcon: "dots"
        }))}
        drawHeader={drawHeader}
        onHeaderClicked={onHeaderClicked}
        onHeaderMenuClick={(colIndex: number, bounds?: any) => {
          setMenuState({ colIndex, bounds: bounds ?? null });
        }}
      />

      {menuState && (() => {
        const col = grid.columns[menuState.colIndex];
        if (!col?.id) return null;
        const isGrouped = groupBy.includes(col.id);

        const top = menuState.bounds
          ? menuState.bounds.y + menuState.bounds.height
          : 40;
        const left = menuState.bounds ? menuState.bounds.x : 40;

        return (
          <div
            ref={menuRef}
            style={{
              position: "absolute",
              top,
              left,
              background: "white",
              border: "1px solid #ccc",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              padding: "4px 0",
              zIndex: 1000,
              minWidth: 160,
            }}
          >
            <div
              style={{ padding: "6px 12px", cursor: "pointer" }}
              onClick={() => {
                toggleGrouping(col.id as string);
                setMenuState(null);
              }}
            >
              {isGrouped ? "Ungroup column" : "Group by column"}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
