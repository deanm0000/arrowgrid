import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { DataEditor, type DrawHeaderCallback, type HeaderClickedEventArgs, type Theme, type Item, type Rectangle, useTheme } from "@glideapps/glide-data-grid";
import type { UseArqueroGridProps, SortSpec, RowData } from "../types";
import { useArqueroGrid } from "./useArqueroGrid";

const TRISIZE = 10;
const TRI_HPADDING = 8;
const TRI_VPADDING = 2;
const TRI_HEIGHT = Math.sqrt(0.75 * TRISIZE ** 2);
const MENU_BUTTON_WIDTH = 28;
const SORT_ICON_SHIFT_RIGHT = 10;
const HEADER_BUTTON_SIZE = 14;
const HEADER_BUTTON_SPACING = 6;

export function ArqueroGrid(props: UseArqueroGridProps) {
  const theme = useTheme();
  const [sortBy, setSortBy] = useState<SortSpec[]>([]);
  const [groupBy, setGroupBy] = useState<string[]>([]);
  const [aggregates, setAggregates] = useState<Record<string, string[]>>({});
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [menuState, setMenuState] = useState<{
    colIndex: number;
    bounds: { x: number; y: number; width: number; height: number } | null;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const grid = useArqueroGrid({
    ...props,
    sortBy,
    groupBy,
    aggregates,
  });

  const NUMERIC_AGGS = ["sum","avg","min","max","count","distinct","mode"];
  const NON_NUMERIC_AGGS = ["count","distinct","mode"];

  const columnTypeMap = useMemo(() => {
    const map: Record<string, "number" | "string" | "other"> = {};
    const first = props.data.object(0) as RowData | undefined;
    if (!first) return map;
    for (const key of Object.keys(first)) {
      const v = first[key];
      if (typeof v === "number") map[key] = "number";
      else if (typeof v === "string") map[key] = "string";
      else map[key] = "other";
    }
    return map;
  }, [props.data]);

  useEffect(() => {
    if (groupBy.length === 0) setAggregates({});
  }, [groupBy.length]);

  // Preserve original column order
  const originalOrderRef = useRef<string[] | null>(null);
  if (!originalOrderRef.current) {
    originalOrderRef.current = grid.columns
      .map(c => c.id)
      .filter((id): id is string => Boolean(id));
  }

  const orderedColumns = useMemo(() => {
    const groupedSet = new Set(groupBy);
    const groupedCols = grid.columns.filter(c => c.id && groupedSet.has(c.id));
    const otherCols = grid.columns.filter(c => !c.id || !groupedSet.has(c.id));
    return [...groupedCols, ...otherCols];
  }, [grid.columns, groupBy]);


  // Map visual column index -> underlying column index
  const columnIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    grid.columns.forEach((c, i) => {
      if (c.id) map.set(c.id, i);
    });
    return map;
  }, [grid.columns]);

  type HeaderButtonConfig = {
    offset: number;
    size: number;
    yOffset?: number;
    draw: (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, theme: Theme) => void;
    onClick: () => void;
  };

  const createButton = (
    config: HeaderButtonConfig
  ): (rect: Rectangle, ctx: CanvasRenderingContext2D, theme: Theme) => { drawFn: () => void; clickFn: () => void } => {
    return (rect, ctx, theme) => {
      const x = rect.x + rect.width - config.offset - config.size;
      const y = rect.y + (rect.height - config.size) / 2 + (config.yOffset ?? 0);

      return {
        drawFn: () => config.draw(ctx, x, y, config.size, theme),
        clickFn: config.onClick,
      };
    };
  };

  const makeButtonCallbacks = (
    orderedColumns: typeof grid.columns,
    groupBy: string[],
    sortBy: SortSpec[],
    columnTypeMap: Record<string, "number" | "string" | "other">,
    setGroupBy: React.Dispatch<React.SetStateAction<string[]>>,
    setAggregates: React.Dispatch<React.SetStateAction<Record<string, string[]>>>,
    setSortBy: React.Dispatch<React.SetStateAction<SortSpec[]>>,
    theme: Theme
  ) => {
    const toggleGrouping = (colName: string) => {
      const base = colName.includes("___") ? colName.split("___")[0] : colName;
      setGroupBy(prev => {
        if (prev.includes(base)) {
          setAggregates(a => {
            const copy = { ...a };
            delete copy[base];
            return copy;
          });
          return prev.filter(c => c !== base);
        }

        setSortBy(existing =>
          existing.filter(s => s.column === base)
        );

        setAggregates(prevAgg => {
          if (prevAgg[base]) return prevAgg;
          const type = columnTypeMap[base];
          const def = type === "number" ? "sum" : "distinct";
          return { ...prevAgg, [base]: [def] };
        });

        return [...prev, base];
      });
    };

    const makeAscButton = (colId: string) => createButton({
      offset: 8,
      size: TRISIZE,
      yOffset: -(TRISIZE / 2 + TRI_VPADDING) / 2,
      draw: (ctx, x, y, size, theme) => {
        const existing = sortBy.find(s => s.column === colId);
        const isAsc = existing && !existing.desc;

        const cy = y + size / 2;
        ctx.beginPath();
        ctx.moveTo(x, cy);
        ctx.lineTo(x + size / 2, cy - TRI_HEIGHT);
        ctx.lineTo(x + size, cy);
        ctx.closePath();
        if (isAsc) {
          ctx.fillStyle = theme.textHeader;
          ctx.fill();
        } else {
          ctx.strokeStyle = theme.textHeader;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      },
      onClick: () => {
        setSortBy(prev => {
          const current = prev.find(s => s.column === colId);
          if (current && !current.desc) return [];
          return [{ column: colId, desc: false }];
        });
      },
    });

    const makeDescButton = (colId: string) => createButton({
      offset: 8,
      size: TRISIZE,
      yOffset: (TRISIZE / 2 + TRI_VPADDING) / 2,
      draw: (ctx, x, y, size, theme) => {
        const existing = sortBy.find(s => s.column === colId);
        const isDesc = existing && existing.desc;

        const cy = y + size / 2;
        ctx.beginPath();
        ctx.moveTo(x, cy);
        ctx.lineTo(x + size / 2, cy + TRI_HEIGHT);
        ctx.lineTo(x + size, cy);
        ctx.closePath();
        if (isDesc) {
          ctx.fillStyle = theme.textHeader;
          ctx.fill();
        } else {
          ctx.strokeStyle = theme.textHeader;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      },
      onClick: () => {
        setSortBy(prev => {
          const current = prev.find(s => s.column === colId);
          if (current && current.desc) return [];
          return [{ column: colId, desc: true }];
        });
      },
    });

    const makeMenuButton = (colId: string, colIndex: number) => createButton({
      offset: 8 + TRISIZE + HEADER_BUTTON_SPACING,
      size: HEADER_BUTTON_SIZE,
      draw: (ctx, x, y, size, theme) => {
        const dotRadius = 1.5;
        const cx = x + size / 2;
        const gap = (size - dotRadius * 6) / 2;

        ctx.fillStyle = theme.textHeader;
        for (let i = 0; i < 3; i++) {
          const cy = y + dotRadius + i * (dotRadius * 2 + gap);
          ctx.beginPath();
          ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      },
      onClick: () => {
        setMenuState(prev =>
          prev?.colIndex === colIndex ? null : { colIndex, bounds: null }
        );
      },
    });

    const makeAllButtons = (rect: Rectangle, ctx: CanvasRenderingContext2D, theme: Theme, colId: string, colIndex: number) => [
      makeAscButton(colId)(rect, ctx, theme),
      makeDescButton(colId)(rect, ctx, theme),
      makeMenuButton(colId, colIndex)(rect, ctx, theme),
    ];

    const drawHeader: DrawHeaderCallback = (args) => {
      const { ctx, rect, columnIndex, theme } = args;
      if (columnIndex < 0) return;

      const col = orderedColumns[columnIndex];
      if (!col?.id) return;

      const colId = col.id;
      const isGroupedMode = groupBy.length > 0;
      const isAggregate = colId.includes("___");
      const base = isAggregate ? colId.split("___")[0] : colId;
      const fn = isAggregate ? colId.split("___")[1] : null;

      ctx.save();

      ctx.fillStyle = theme.bgHeader;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

      ctx.fillStyle = theme.textHeader;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.font = theme.headerFontStyle ?? "13px sans-serif";

      const padding = 8;
      let label = col.title;
      if (isGroupedMode) {
        label = isAggregate ? fn ?? "" : base;
      }
      ctx.fillText(label, rect.x + padding, rect.y + rect.height / 2);

      const buttons = makeAllButtons(rect, ctx, theme, colId, columnIndex);
      buttons.forEach(b => b.drawFn());

      ctx.restore();

      return true;
    };

    const onHeaderClicked = (colIndex: number, event: HeaderClickedEventArgs) => {
      setMenuState(null);

      const rect = event.bounds;
      const col = orderedColumns[colIndex];
      if (!col?.id) return;

      const colId = col.id;
      const clickX = event.localEventX;
      const clickY = event.localEventY;

      const sortBtnX = rect.width - 8 - TRISIZE;
      const ascYOffset = -(TRISIZE / 2 + TRI_VPADDING) / 2;
      const descYOffset = (TRISIZE / 2 + TRI_VPADDING) / 2;

      const ascY = (rect.height - TRISIZE) / 2 + ascYOffset;
      const descY = (rect.height - TRISIZE) / 2 + descYOffset;

      if (clickX >= sortBtnX && clickX <= sortBtnX + TRISIZE &&
          clickY >= ascY && clickY <= ascY + TRISIZE) {
        setSortBy(prev => {
          const current = prev.find(s => s.column === colId);
          if (current && !current.desc) return [];
          return [{ column: colId, desc: false }];
        });
        return;
      }

      if (clickX >= sortBtnX && clickX <= sortBtnX + TRISIZE &&
          clickY >= descY && clickY <= descY + TRISIZE) {
        setSortBy(prev => {
          const current = prev.find(s => s.column === colId);
          if (current && current.desc) return [];
          return [{ column: colId, desc: true }];
        });
        return;
      }

      const menuOffset = 8 + TRISIZE + HEADER_BUTTON_SPACING;
      const menuBtnX = rect.width - menuOffset - HEADER_BUTTON_SIZE;
      const menuBtnY = (rect.height - HEADER_BUTTON_SIZE) / 2;
      if (clickX >= menuBtnX && clickX <= menuBtnX + HEADER_BUTTON_SIZE &&
          clickY >= menuBtnY && clickY <= menuBtnY + HEADER_BUTTON_SIZE) {
        setMenuState(prev =>
          prev?.colIndex === colIndex ? null : {
            colIndex,
            bounds: {
              x: rect.x + menuBtnX,
              y: rect.y,
              width: HEADER_BUTTON_SIZE,
              height: rect.height,
            },
          }
        );
        return;
      }
    };

    return { drawHeader, onHeaderClicked };
  };

  const { drawHeader, onHeaderClicked } = useMemo(
    () => makeButtonCallbacks(
      orderedColumns,
      groupBy,
      sortBy,
      columnTypeMap,
      setGroupBy,
      setAggregates,
      setSortBy,
      theme
    ),
    [orderedColumns, groupBy, sortBy, columnTypeMap, setGroupBy, setAggregates, setSortBy, theme]
  );

  const getCellContent = useCallback(
    (cell: Item) => {
      const [visualCol, row] = cell;

      const col = orderedColumns[visualCol];
      if (!col?.id) return grid.getCellContent(cell as Item);

      const underlyingIndex = columnIndexMap.get(col.id);
      if (underlyingIndex == null)
        return grid.getCellContent(cell as Item);

      return grid.getCellContent([underlyingIndex, row] as Item);
    },
    [orderedColumns, columnIndexMap, grid]
  );
  const toggleGrouping = useCallback(
    (colName: string) => {
      const base = colName.includes("___") ? colName.split("___")[0] : colName;
      setGroupBy(prev => {
        if (prev.includes(base)) {
          setAggregates(a => {
            const copy = { ...a };
            delete copy[base];
            return copy;
          });
          return prev.filter(c => c !== base);
        }

        // Clear sorts unless sorting same column
        setSortBy(existing =>
          existing.filter(s => s.column === base)
        );

        setAggregates(prevAgg => {
          if (prevAgg[base]) return prevAgg;
          const type = columnTypeMap[base];
          const def = type === "number" ? "sum" : "distinct";
          return { ...prevAgg, [base]: [def] };
        });

        return [...prev, base];
      });
    },
    [columnTypeMap]
  );

  useEffect(() => {
    if (!menuState) return;

    const handleClickOutside = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuState(null);
    };

    window.addEventListener("pointerdown", handleClickOutside, true);
    return () => {
      window.removeEventListener("pointerdown", handleClickOutside, true);
    };
  }, [menuState]);

  return (
    <div style={{ position: "relative" }}>
      <DataEditor
        {...grid}
        getCellContent={getCellContent}
        columns={orderedColumns.map(col => {
          const isGrouped = col.id ? groupBy.includes(col.id) : false;
          const width = col.id
            ? columnWidths[col.id] ?? 100
            : 100;

          const colIdForGroup = col.id;
          const isAgg =
            typeof colIdForGroup === "string" &&
            colIdForGroup.includes("___");
          const base = isAgg
            ? colIdForGroup.split("___")[0]
            : undefined;

          return {
            ...col,
            width,
            group: groupBy.length > 0
              ? (isAgg ? base : "")
              : undefined,
            themeOverride: isAgg
              ? {
                  // smaller, grey aggregate function headers
                  baseFontStyle: "12px sans-serif",
                  textDark: "#666",
                }
              : isGrouped
              ? {
                  baseFontStyle: "600 13px sans-serif",
                }
              : undefined,
          };
        })}
        onColumnResize={(column, newSize) => {
          if (!column.id) return;

          setColumnWidths(prev => ({
            ...prev,
            [column.id as string]: newSize,
          }));
        }}
        drawHeader={drawHeader}
        onHeaderClicked={onHeaderClicked}
        onCellClicked={() => setMenuState(null)}

      />

      {menuState && (() => {
        const col = orderedColumns[menuState.colIndex];
        if (!col?.id) return null;

        const colId = col.id;
        const baseColId = colId.includes("___")
          ? colId.split("___")[0]
          : colId;

        const isGrouped = groupBy.includes(baseColId);

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
                toggleGrouping(colId);
                setMenuState(null);
              }}
            >
              {isGrouped ? "Ungroup column" : "Group by column"}
            </div>

            {groupBy.length > 0 && (() => {

              if (groupBy.includes(baseColId)) {
                return null;
              }

              return (
                <>
                  <div style={{ height: "1px", background: "#eee", margin: "4px 0" }} />

                  <div style={{ padding: "6px 12px", fontWeight: 600 }}>
                    Add aggregate
                  </div>

                  {(columnTypeMap[baseColId] === "number"
                    ? NUMERIC_AGGS
                    : NON_NUMERIC_AGGS
                  ).map(fn => {
                    const existing = aggregates[baseColId] ?? [columnTypeMap[baseColId] === "number" ? "sum" : "distinct"];
                    const active = existing.includes(fn);

                    return (
                      <div
                        key={fn}
                        style={{
                          padding: "6px 12px",
                          cursor: "pointer",
                          background: active
                            ? "rgba(0,0,0,0.05)"
                            : undefined,
                        }}
                        onClick={() => {
                          setAggregates(prev => {
                            const current = prev[baseColId] ?? [columnTypeMap[baseColId] === "number" ? "sum" : "distinct"];
                            const next = current.includes(fn)
                              ? (current.length > 1 ? current.filter(f => f !== fn) : current)
                              : [...current, fn];

                            const order =
                              columnTypeMap[baseColId] === "number"
                                ? NUMERIC_AGGS
                                : NON_NUMERIC_AGGS;

                            const sorted = order.filter(f =>
                              next.includes(f)
                            );

                            const updated = { ...prev };
                            if (sorted.length === 0) delete updated[baseColId];
                            else updated[baseColId] = sorted;

                            return updated;
                          });
                        }}
                      >
                        {active ? "✓ " : ""}
                        {fn}
                      </div>
                    );
                  })}
                </>
              );
            })()}

          </div>
        );
      })()}
    </div>
  );
}
