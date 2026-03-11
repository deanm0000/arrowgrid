import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { DataEditor, GridCellKind, useRowGrouping, type DrawHeaderCallback, type DrawCellCallback, type GridCell, type HeaderClickedEventArgs, type Theme, type Item, type Rectangle, type RowGroup, type DataEditorRef, type TextCell, useTheme } from "@glideapps/glide-data-grid";
import { AGG_DELIMITER, type UseArqueroGridProps, type SortSpec, type RowData, type FilterSpec, type ColumnFormat } from "../types";
import { useArqueroGrid } from "./useArqueroGrid";
import { ColumnFilterMenu } from "./components/ColumnFilterMenu";
import { ValueFormatMenu } from "./components/ValueFormatMenu";


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
  const testCopyMode = useMemo(() => new URLSearchParams(window.location.search).has("testcopy"), []);
  const [sortBy, setSortBy] = useState<SortSpec[]>([]);
  const [groupBy, setGroupBy] = useState<string[]>([]);
  const [aggregates, setAggregates] = useState<Record<string, string[]>>({});
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [menuState, setMenuState] = useState<{
    colIndex: number;
    bounds: { x: number; y: number; width: number; height: number } | null;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const subMenuRef = useRef<HTMLDivElement | null>(null);
  const wavgItemRef = useRef<HTMLDivElement | null>(null);
  const [weightColPicker, setWeightColPicker] = useState<string | null>(null);
  const [filterSubMenuOpen, setFilterSubMenuOpen] = useState<string | null>(null);
  const filterItemRef = useRef<HTMLDivElement | null>(null);
  const filterSubMenuRef = useRef<HTMLDivElement | null>(null);
  const [formatSubMenuOpen, setFormatSubMenuOpen] = useState<string | null>(null);
  const formatItemRef = useRef<HTMLDivElement | null>(null);
  const formatSubMenuRef = useRef<HTMLDivElement | null>(null);
  const [columnFormats, setColumnFormats] = useState<Record<string, ColumnFormat>>(() => {
    const initial: Record<string, ColumnFormat> = { ...(props.columnFormats ?? {}) };
    const first = props.data.object(0) as RowData | undefined;
    if (first) {
      for (const [key, val] of Object.entries(first)) {
        if (val instanceof Date && !initial[key]) {
          initial[key] = { kind: "date", format: "mm-dd-yyyy-hh-mm" };
        }
      }
    }
    return initial;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const groupHeaderScrollRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<DataEditorRef>(null);

  const grid = useArqueroGrid({
    ...props,
    sortBy,
    groupBy,
    aggregates,
    columnFormats,
    testCopyMode,
  });

  const NUMERIC_AGGS = ["sum", "avg", "min", "max", "count", "distinct", "mode", "wavg"];
  const NON_NUMERIC_AGGS = ["count", "distinct", "mode"];

  const columnTypeMap = useMemo(() => {
    const map: Record<string, "number" | "string" | "date" | "boolean" | "other"> = {};
    const first = props.data.object(0) as RowData | undefined;
    if (!first) return map;
    for (const key of Object.keys(first)) {
      const v = first[key];
      if (typeof v === "number") map[key] = "number";
      else if (typeof v === "boolean") map[key] = "boolean";
      else if (v instanceof Date) map[key] = "date";
      else if (typeof v === "string") map[key] = "string";
      else map[key] = "other";
    }
    return map;
  }, [props.data]);

  const distinctValueThreshold = props.distinctValueThreshold ?? 30;

  const allDistinctValues = useMemo(() => {
    const map: Record<string, (string | number | boolean | null)[]> = {};
    for (const col of props.data.columnNames()) {
      const vals: (string | number | boolean | null)[] = [];
      const n = props.data.numRows();
      for (let i = 0; i < n; i++) {
        const v = props.data.get(col, i) as string | number | boolean | null;
        vals.push(v);
      }
      const unique = [...new Set(vals)].sort((a, b) => String(a ?? "").localeCompare(String(b ?? "")));
      map[col] = unique;
    }
    return map;
  }, [props.data]);

  const visibleDistinctValues = useMemo(() => {
    const map: Record<string, (string | number | boolean | null)[]> = {};
    for (const col of props.data.columnNames()) {
      const otherFilters = grid.filters.filter(f => f.column !== col && f.op !== "in");
      if (otherFilters.length === 0) {
        map[col] = allDistinctValues[col] ?? [];
        continue;
      }
      const vals: (string | number | boolean | null)[] = [];
      const n = props.data.numRows();
      for (let i = 0; i < n; i++) {
        const row = props.data.object(i) as Record<string, string | number | boolean | null>;
        const passes = otherFilters.every(f => {
          if (!f.column || !f.op) return true;
          const v = row[f.column];
          switch (f.op) {
            case ">": return typeof v === "number" && typeof f.value === "number" && v > f.value;
            case ">=": return typeof v === "number" && typeof f.value === "number" && v >= f.value;
            case "<": return typeof v === "number" && typeof f.value === "number" && v < f.value;
            case "<=": return typeof v === "number" && typeof f.value === "number" && v <= f.value;
            case "==": return v === f.value;
            case "!=": return v !== f.value;
            case "between": return typeof v === "number" && typeof f.value === "number" && typeof f.value2 === "number" && v >= f.value && v <= f.value2;
            case "isNull": return v == null;
            case "isNotNull": return v != null;
            case "contains": return typeof f.value === "string" && String(v ?? "").toLowerCase().includes(f.value.toLowerCase());
            case "notContains": return typeof f.value === "string" && !String(v ?? "").toLowerCase().includes(f.value.toLowerCase());
            case "startsWith": return typeof f.value === "string" && String(v ?? "").toLowerCase().startsWith(f.value.toLowerCase());
            case "endsWith": return typeof f.value === "string" && String(v ?? "").toLowerCase().endsWith(f.value.toLowerCase());
            case "regex": {
              try { return typeof f.value === "string" && new RegExp(f.value, "i").test(String(v ?? "")); } catch { return true; }
            }
            default: return true;
          }
        });
        if (passes) vals.push(row[col]);
      }
      map[col] = [...new Set(vals)].sort((a, b) => String(a ?? "").localeCompare(String(b ?? "")));
    }
    return map;
  }, [props.data, grid.filters, allDistinctValues]);

  useEffect(() => {
    if (groupBy.length === 0) setAggregates({});
  }, [groupBy.length]);

  const [columnOrder, setColumnOrder] = useState<string[]>([]);

  const defaultOrderedColumns = useMemo(() => {
    const groupedSet = new Set(groupBy);
    const groupedCols = grid.columns.filter(c => c.id && groupedSet.has(c.id));
    const otherCols = grid.columns.filter(c => !c.id || !groupedSet.has(c.id));
    return [...groupedCols, ...otherCols];
  }, [grid.columns, groupBy]);

  const defaultColumnKey = useMemo(
    () => defaultOrderedColumns.map(c => c.id).join(","),
    [defaultOrderedColumns]
  );

  useEffect(() => {
    setColumnOrder(
      defaultOrderedColumns
        .map(c => c.id)
        .filter((id): id is string => Boolean(id))
    );
  }, [defaultColumnKey]);

  const orderedColumns = useMemo(() => {
    if (columnOrder.length === 0) return defaultOrderedColumns;
    return columnOrder
      .map(id => grid.columns.find(c => c.id === id))
      .filter((c): c is typeof grid.columns[0] => Boolean(c));
  }, [columnOrder, grid.columns, defaultOrderedColumns]);


  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.key.toLowerCase() === 'd' && e.ctrlKey && e.shiftKey && e.altKey)) return;
      const editor = editorRef.current;
      if (!editor) return;

      const numCols = orderedColumns.length;
      const numRows = grid.rows;

      const columns: Record<string, {
        centerX: number;
        header: { centerY: number; menuX: number; menuY: number; ascX: number; ascY: number; descX: number; descY: number };
      }> = {};

      for (let c = 0; c < numCols; c++) {
        const colId = orderedColumns[c]?.id ?? String(c);
        const headerBounds = editor.getBounds(c, -1);
        if (!headerBounds) continue;

        const colCenterX = headerBounds.x + headerBounds.width / 2;
        const menuX = headerBounds.x + headerBounds.width - (8 + TRISIZE + HEADER_BUTTON_SPACING) - HEADER_BUTTON_SIZE / 2;
        const menuY = headerBounds.y + headerBounds.height / 2;
        const sortX = headerBounds.x + headerBounds.width - 8 - TRISIZE / 2;
        const ascY = headerBounds.y + (headerBounds.height - TRISIZE) / 2 + (-(TRISIZE / 2 + TRI_VPADDING) / 2) + TRISIZE / 2;
        const descY = headerBounds.y + (headerBounds.height - TRISIZE) / 2 + ((TRISIZE / 2 + TRI_VPADDING) / 2) + TRISIZE / 2;

        columns[colId] = {
          centerX: colCenterX,
          header: { centerY: menuY, menuX, menuY, ascX: sortX, ascY, descX: sortX, descY },
        };
      }

      const rows: { centerY: number }[] = [];
      for (let r = 0; r < numRows; r++) {
        const bounds = editor.getBounds(0, r);
        if (!bounds) continue;
        rows.push({ centerY: bounds.y + bounds.height / 2 });
      }

      console.log('__ARROWGRID_LAYOUT__', JSON.stringify({ columns, rows }));
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [orderedColumns, grid.rows]);

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
    columnTypeMap: Record<string, "number" | "string" | "date" | "boolean" | "other">,
    setGroupBy: React.Dispatch<React.SetStateAction<string[]>>,
    setAggregates: React.Dispatch<React.SetStateAction<Record<string, string[]>>>,
    setSortBy: React.Dispatch<React.SetStateAction<SortSpec[]>>,
    theme: Theme
  ) => {
    const toggleGrouping = (colName: string) => {
      const base = colName.includes(AGG_DELIMITER) ? colName.split(AGG_DELIMITER)[0] : colName;
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
        console.log(colId)
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
      const isAggregate = colId.includes(AGG_DELIMITER);
      const base = isAggregate ? colId.split(AGG_DELIMITER)[0] : colId;
      const fn = isAggregate ? colId.split(AGG_DELIMITER)[1] : null;

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

  const headerRowSet = useMemo(
    () => new Set(grid.rowGroups.map(g => g.headerIndex)),
    [grid.rowGroups]
  );

  const aggColSpans = useMemo(() => {
    if (groupBy.length === 0) return new Map<number, [number, number]>();
    const spans = new Map<number, [number, number]>();
    const baseGroups = new Map<string, number[]>();
    orderedColumns.forEach((col, idx) => {
      if (!col.id?.includes(AGG_DELIMITER)) return;
      const base = col.id.split(AGG_DELIMITER)[0];
      if (!baseGroups.has(base)) baseGroups.set(base, []);
      baseGroups.get(base)!.push(idx);
    });
    for (const indices of baseGroups.values()) {
      if (indices.length <= 1) continue;
      spans.set(indices[0], [indices[0], indices[indices.length - 1]]);
      for (let k = 1; k < indices.length; k++) {
        spans.set(indices[k], [-1, -1]);
      }
    }
    return spans;
  }, [orderedColumns, groupBy]);

  const rowGroupingOptions = useMemo(() => {
    if (groupBy.length === 0 || grid.rowGroups.length === 0) return undefined;
    return {
      groups: grid.rowGroups as RowGroup[],
      height: 34,
      navigationBehavior: "skip" as const,
    };
  }, [grid.rowGroups, groupBy]);

  const { mapper } = useRowGrouping(rowGroupingOptions, grid.rows);

  const expandToggleColIndex = useMemo(() => {
    if (groupBy.length === 0) return -1;
    const lastGroupCol = groupBy[groupBy.length - 1];
    return orderedColumns.findIndex(c => c.id === lastGroupCol);
  }, [groupBy, orderedColumns]);

  const collapsedRowSet = useMemo(() => {
    const set = new Set<number>();
    for (const g of grid.rowGroups) {
      if (g.isCollapsed) set.add(g.headerIndex);
    }
    return set;
  }, [grid.rowGroups]);

  const drawCell = useCallback<DrawCellCallback>(
    (args, drawContent) => {
      const isHeaderRow = groupBy.length > 0 && headerRowSet.has(args.row);

      if (!isHeaderRow) {
        const col = orderedColumns[args.col];
        const baseColId = col?.id
          ? (col.id.includes(AGG_DELIMITER) ? col.id.split(AGG_DELIMITER)[0] : col.id)
          : null;
        const fmt = baseColId ? columnFormats[baseColId] : undefined;
        const isAccounting = fmt?.kind === "number" && fmt.format.type === "accounting";
        if (isAccounting) {
          drawContent();
          const cellData = "displayData" in args.cell ? args.cell.displayData : ("data" in args.cell ? String(args.cell.data) : "");
          const numStr = typeof cellData === "string" ? cellData : "";
          const isNeg = numStr.startsWith("(");
          const { ctx, rect, theme } = args;
          const padding = 8;
          ctx.save();
          ctx.fillStyle = theme.bgCell;
          ctx.fillRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
          if (args.highlighted) {
            ctx.fillStyle = theme.accentLight;
            ctx.fillRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
          }
          ctx.fillStyle = isNeg ? "#c00" : theme.textDark;
          ctx.font = theme.baseFontStyle ?? "13px sans-serif";
          ctx.textBaseline = "middle";
          ctx.textAlign = "left";
          ctx.fillText("$", rect.x + padding, rect.y + rect.height / 2);
          ctx.textAlign = "right";
          ctx.fillText(numStr, rect.x + rect.width - padding, rect.y + rect.height / 2);
          ctx.restore();
          return;
        }
        drawContent();
        return;
      }

      const { ctx, rect, theme, cell } = args;
      const padding = 8;

      const hCol = orderedColumns[args.col];
      const hBaseColId = hCol?.id
        ? (hCol.id.includes(AGG_DELIMITER) ? hCol.id.split(AGG_DELIMITER)[0] : hCol.id)
        : null;
      const hFmt = hBaseColId ? columnFormats[hBaseColId] : undefined;
      const hIsAccounting = hFmt?.kind === "number" && hFmt.format.type === "accounting";

      const displayText = ("displayData" in cell ? cell.displayData : null) ?? ("data" in cell ? String(cell.data) : "") ?? "";

      ctx.save();
      ctx.fillStyle = theme.bgCell;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

      ctx.fillStyle = theme.textDark;
      ctx.font = `bold 13px ${theme.fontFamily}`;
      ctx.textBaseline = "middle";

      if (hIsAccounting) {
        const numStr = String(displayText);
        const isNeg = numStr.startsWith("(");
        ctx.fillStyle = isNeg ? "#c00" : theme.textDark;
        ctx.textAlign = "left";
        ctx.fillText("$", rect.x + padding, rect.y + rect.height / 2);
        ctx.textAlign = "right";
        ctx.fillText(numStr, rect.x + rect.width - padding, rect.y + rect.height / 2);
      } else {
        ctx.textAlign = "left";
        ctx.fillText(String(displayText), rect.x + padding, rect.y + rect.height / 2);
      }

      if (args.col === expandToggleColIndex) {
        const isCollapsed = collapsedRowSet.has(args.row);
        const chevronSize = 8;
        const cx = rect.x + rect.width - 16;
        const cy = rect.y + rect.height / 2;

        ctx.fillStyle = theme.textDark;
        ctx.beginPath();
        if (isCollapsed) {
          ctx.moveTo(cx, cy - chevronSize / 2);
          ctx.lineTo(cx + chevronSize, cy);
          ctx.lineTo(cx, cy + chevronSize / 2);
        } else {
          ctx.moveTo(cx - chevronSize / 2, cy);
          ctx.lineTo(cx + chevronSize / 2, cy);
          ctx.lineTo(cx, cy + chevronSize);
        }
        ctx.closePath();
        ctx.fill();
      }

      if (args.highlighted) {
        ctx.fillStyle = theme.accentLight;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      }

      const borderColor = theme.borderColor ?? "#e6e6e6";
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rect.x + rect.width - 0.5, rect.y);
      ctx.lineTo(rect.x + rect.width - 0.5, rect.y + rect.height);
      ctx.moveTo(rect.x, rect.y + rect.height - 0.5);
      ctx.lineTo(rect.x + rect.width, rect.y + rect.height - 0.5);
      ctx.stroke();

      ctx.restore();
    },
    [groupBy, expandToggleColIndex, headerRowSet, collapsedRowSet, orderedColumns, columnFormats]
  );

  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      const [visualCol, row] = cell;

      const col = orderedColumns[visualCol];
      if (!col?.id) return grid.getCellContent(cell as Item);

      const underlyingIndex = columnIndexMap.get(col.id);
      if (underlyingIndex == null)
        return grid.getCellContent(cell as Item);

      const isDetailRow = groupBy.length > 0 && !headerRowSet.has(row);

      if (isDetailRow && col.id && groupBy.includes(col.id)) {
        return { kind: GridCellKind.Text, data: "", displayData: "", allowOverlay: false } satisfies TextCell;
      }

      if (isDetailRow && col.id.includes(AGG_DELIMITER)) {
        const spanInfo = aggColSpans.get(visualCol);
        if (spanInfo && spanInfo[0] === -1) {
          return { kind: GridCellKind.Text, data: "", displayData: "", allowOverlay: false } satisfies TextCell;
        }
        const baseCell = grid.getCellContent([underlyingIndex, row] as Item);
        if (spanInfo) {
          return { ...baseCell, span: spanInfo, allowOverlay: false };
        }
        return { ...baseCell, allowOverlay: false };
      }

      return grid.getCellContent([underlyingIndex, row] as Item);
    },
    [orderedColumns, columnIndexMap, grid, headerRowSet, groupBy, aggColSpans]
  );
  const toggleGrouping = useCallback(
    (colName: string) => {
      const base = colName.includes(AGG_DELIMITER) ? colName.split(AGG_DELIMITER)[0] : colName;
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
    if (!menuState) {
      setWeightColPicker(null);
      setFilterSubMenuOpen(null);
      setFormatSubMenuOpen(null);
      return;
    }

    const handleClickOutside = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      if (subMenuRef.current?.contains(event.target as Node)) return;
      if (filterSubMenuRef.current?.contains(event.target as Node)) return;
      if (formatSubMenuRef.current?.contains(event.target as Node)) return;
      setMenuState(null);
    };

    window.addEventListener("pointerdown", handleClickOutside, true);
    return () => {
      window.removeEventListener("pointerdown", handleClickOutside, true);
    };
  }, [menuState]);

  useEffect(() => {
    if (groupBy.length === 0) return;
    if (!containerRef.current) return;

    let scrollDiv: HTMLDivElement | null = null;

    const syncScroll = () => {
      if (groupHeaderScrollRef.current && scrollDiv) {
        groupHeaderScrollRef.current.scrollLeft = scrollDiv.scrollLeft;
      }
    };

    const observer = new MutationObserver(() => {
      const found = containerRef.current?.querySelector<HTMLDivElement>(".dvn-scroller");
      if (!found) return;
      observer.disconnect();
      scrollDiv = found;
      scrollDiv.addEventListener("scroll", syncScroll);
    });

    observer.observe(containerRef.current, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      scrollDiv?.removeEventListener("scroll", syncScroll);
    };
  }, [groupBy.length]);

  const groupHeaderSpans = useMemo(() => {
    if (groupBy.length === 0) return [];
    const groupBySet = new Set(groupBy);
    const spans: { label: string; width: number }[] = [];
    let groupKeySpan: { label: string; width: number } | null = null;
    for (const col of orderedColumns) {
      const id = col.id ?? "";
      const w = col.id ? columnWidths[col.id] ?? 100 : 100;
      const isAgg = id.includes(AGG_DELIMITER);
      const base = isAgg ? id.split(AGG_DELIMITER)[0] : id;
      if (groupBySet.has(id)) {
        if (groupKeySpan) {
          groupKeySpan.width += w;
        } else {
          groupKeySpan = { label: "", width: w };
          spans.push(groupKeySpan);
        }
      } else if (isAgg) {
        const last = spans[spans.length - 1];
        if (last && last.label === base) {
          last.width += w;
        } else {
          spans.push({ label: base, width: w });
        }
      } else {
        spans.push({ label: base, width: w });
      }
    }
    return spans;
  }, [orderedColumns, groupBy, columnWidths]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {groupBy.length > 0 && (
        <div style={{ overflow: "hidden", height: 36 }}>
          <div
            ref={groupHeaderScrollRef}
            style={{ display: "flex", overflow: "hidden", height: "100%" }}
          >
            {groupHeaderSpans.map((span, i) => (
              <div
                key={i}
                style={{
                  flexShrink: 0,
                  width: span.width,
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: theme.bgHeader,
                  color: theme.textHeader,
                  font: theme.headerFontStyle ?? "bold 13px sans-serif",
                  borderRight: `1px solid ${theme.borderColor ?? "#e1e1e1"}`,
                  borderBottom: `1px solid ${theme.borderColor ?? "#e1e1e1"}`,
                  boxSizing: "border-box",
                }}
              >
                {span.label}
              </div>
            ))}
          </div>
        </div>
      )}
      <DataEditor
        ref={editorRef}
        {...grid}
        getCellContent={getCellContent}
        columns={orderedColumns.map(col => {
          const isGrouped = col.id ? groupBy.includes(col.id) : false;
          const width = col.id
            ? columnWidths[col.id] ?? 100
            : 100;

          const isAgg =
            typeof col.id === "string" &&
            col.id.includes(AGG_DELIMITER);

          return {
            ...col,
            width,
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
        onColumnMoved={(startIndex, endIndex) => {
          setColumnOrder(prev => {
            const next = [...prev];
            const [moved] = next.splice(startIndex, 1);
            next.splice(endIndex, 0, moved);
            return next;
          });
        }}
        onColumnProposeMove={(startIndex, endIndex) => {
          if (groupBy.length === 0) return true;
          const boundary = groupBy.length;
          return (startIndex < boundary) === (endIndex < boundary);
        }}
        groupHeaderHeight={groupBy.length > 0 ? 0 : undefined}
        rowGrouping={rowGroupingOptions}
        rows={grid.rows}
        drawCell={drawCell}
        getCellsForSelection={true}
        drawHeader={drawHeader}
        onHeaderClicked={onHeaderClicked}
        onCellClicked={(cell, event) => {
          setMenuState(null);
          if (groupBy.length > 0) {
            const [visualCol, visualRow] = cell;
            const mapped = mapper(visualRow);
            if (mapped.isGroupHeader && visualCol === expandToggleColIndex) {
              if (event.localEventX >= event.bounds.width - 24) {
                grid.toggleExpandGroup(mapped.originalIndex as number);
              }
            }
          }
        }}

      />

      {menuState && (() => {
        const col = orderedColumns[menuState.colIndex];
        if (!col?.id) return null;

        const colId = col.id;
        const baseColId = colId.includes(AGG_DELIMITER)
          ? colId.split(AGG_DELIMITER)[0]
          : colId;

        const isGrouped = groupBy.includes(baseColId);

        const top = menuState.bounds
          ? menuState.bounds.y + menuState.bounds.height
          : 40;
        const left = menuState.bounds ? menuState.bounds.x : 40;

        return (
          <>
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
            {isGrouped && groupBy.length >= 2 && (
              <div
                style={{ padding: "6px 12px", cursor: "pointer" }}
                onClick={() => {
                  setGroupBy([]);
                  setAggregates({});
                  setMenuState(null);
                }}
              >
                Ungroup all columns
              </div>
            )}
            <div style={{ height: "1px", background: "#eee", margin: "4px 0" }} />
            <div
              ref={filterItemRef}
              style={{ padding: "6px 12px", cursor: "pointer", background: filterSubMenuOpen === baseColId ? "rgba(0,0,0,0.05)" : undefined }}
              onClick={() => { setFilterSubMenuOpen(prev => prev === baseColId ? null : baseColId); setFormatSubMenuOpen(null); }}
            >
              Filter column ▶
            </div>
            {(() => {
              const kind = columnTypeMap[baseColId];
              const isAggCol = colId.includes(AGG_DELIMITER);
              const aggFn = isAggCol ? colId.split(AGG_DELIMITER)[1] : null;
              const NUMERIC_AGG_FNS = new Set(["sum", "avg", "count", "distinct", "min", "max", "wavg"]);
              const effectiveKind = aggFn && NUMERIC_AGG_FNS.has(aggFn) ? "number" : kind;
              if (effectiveKind !== "number" && effectiveKind !== "date" && effectiveKind !== "boolean") return null;
              return (
                <div
                  ref={formatItemRef}
                  style={{ padding: "6px 12px", cursor: "pointer", background: formatSubMenuOpen === baseColId ? "rgba(0,0,0,0.05)" : undefined }}
                  onClick={() => { setFormatSubMenuOpen(prev => prev === baseColId ? null : baseColId); setFilterSubMenuOpen(null); }}
                >
                  Value format ▶
                </div>
              );
            })()}
            {groupBy.length > 0 && (() => {

              if (groupBy.includes(baseColId)) {
                return null;
              }

              const existing = aggregates[baseColId] ?? [columnTypeMap[baseColId] === "number" ? "sum" : "distinct"];
              const defaultFn = columnTypeMap[baseColId] === "number" ? "sum" : "distinct";

              const aggList = columnTypeMap[baseColId] === "number"
                ? NUMERIC_AGGS
                : NON_NUMERIC_AGGS;

              return (
                <>
                  <div style={{ height: "1px", background: "#eee", margin: "4px 0" }} />

                  <div style={{ padding: "6px 12px", fontWeight: 600 }}>
                    Add aggregate
                  </div>

                  {aggList.map(fn => {
                    if (fn === "wavg") {
                      const activeWavgFn = existing.find((e: string) => e.startsWith("wavg:"));
                      const activeWeightCol = activeWavgFn?.slice(5);
                      return (
                        <div
                          key="wavg"
                          ref={wavgItemRef}
                          style={{
                            padding: "6px 12px",
                            cursor: "pointer",
                            background: activeWavgFn ? "rgba(0,0,0,0.05)" : weightColPicker === baseColId ? "rgba(0,0,0,0.08)" : undefined,
                          }}
                          onClick={() => {
                            if (activeWavgFn) {
                              setAggregates(prev => {
                                const current = prev[baseColId] ?? [defaultFn];
                                if (current.length <= 1) return prev;
                                const next = current.filter((f: string) => f !== activeWavgFn);
                                return { ...prev, [baseColId]: next };
                              });
                              setWeightColPicker(null);
                            } else {
                              setWeightColPicker(weightColPicker === baseColId ? null : baseColId);
                            }
                          }}
                        >
                          {activeWavgFn ? `✓ wavg(${activeWeightCol})` : "wavg ▶"}
                        </div>
                      );
                    }

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
                            const current = prev[baseColId] ?? [defaultFn];
                            const next = current.includes(fn)
                              ? (current.length > 1 ? current.filter((f: string) => f !== fn) : current)
                              : [...current, fn];

                            const order = aggList;
                            const sorted = order.filter((f: string) =>
                              next.includes(f)
                            );
                            const wavgEntries = next.filter((f: string) => f.startsWith("wavg:"));

                            const updated = { ...prev };
                            const final = [...sorted, ...wavgEntries];
                            if (final.length === 0) delete updated[baseColId];
                            else updated[baseColId] = final;

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

          {weightColPicker && (() => {
            const menuRect = menuRef.current?.getBoundingClientRect();
            const wavgRect = wavgItemRef.current?.getBoundingClientRect();
            const containerRect = containerRef.current?.getBoundingClientRect();
            if (!menuRect || !wavgRect || !containerRect) return null;

            const subLeft = menuRect.right - containerRect.left;
            const subTop = wavgRect.top - containerRect.top;

            const baseColId = weightColPicker;
            const defaultFn = columnTypeMap[baseColId] === "number" ? "sum" : "distinct";

            return (
              <div
                ref={subMenuRef}
                style={{
                  position: "absolute",
                  top: subTop,
                  left: subLeft,
                  background: "white",
                  border: "1px solid #ccc",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                  padding: "4px 0",
                  zIndex: 1001,
                  minWidth: 140,
                }}
              >
                <div style={{ padding: "6px 12px", fontWeight: 600 }}>
                  Weight column
                </div>
                <div style={{ height: "1px", background: "#eee", margin: "4px 0" }} />
                {Object.entries(columnTypeMap)
                  .filter(([k, v]) => v === "number" && !groupBy.includes(k) && k !== baseColId)
                  .map(([weightCol]) => (
                    <div
                      key={weightCol}
                      style={{ padding: "6px 12px", cursor: "pointer" }}
                      onClick={() => {
                        setAggregates(prev => {
                          const current = prev[baseColId] ?? [defaultFn];
                          const without = current.filter((f: string) => !f.startsWith("wavg:"));
                          return { ...prev, [baseColId]: [...without, `wavg:${weightCol}`] };
                        });
                        setWeightColPicker(null);
                      }}
                    >
                      {weightCol}
                    </div>
                  ))
                }
              </div>
            );
          })()}

          {filterSubMenuOpen && (() => {
            const menuRect = menuRef.current?.getBoundingClientRect();
            const filterItemRect = filterItemRef.current?.getBoundingClientRect();
            const containerRect = containerRef.current?.getBoundingClientRect();
            if (!menuRect || !filterItemRect || !containerRect) return null;

            const subLeft = menuRect.right - containerRect.left;
            const subTop = filterItemRect.top - containerRect.top;
            const targetCol = filterSubMenuOpen;
            const rawType = columnTypeMap[targetCol] ?? "other";
            const colType: "number" | "string" | "other" =
              rawType === "number" ? "number" : rawType === "string" ? "string" : "other";
            const allVals = allDistinctValues[targetCol] ?? [];
            const visibleVals = visibleDistinctValues[targetCol] ?? [];
            const colFilters = grid.filters.filter((f: FilterSpec) => f.column === targetCol);

            return (
              <div
                ref={filterSubMenuRef}
                style={{
                  position: "absolute",
                  top: subTop,
                  left: subLeft,
                  background: "white",
                  border: "1px solid #ccc",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                  zIndex: 1001,
                }}
              >
                <ColumnFilterMenu
                  columnId={targetCol}
                  columnType={colType}
                  allValues={allVals}
                  visibleValues={visibleVals}
                  distinctValueThreshold={distinctValueThreshold}
                  filtersForColumn={colFilters}
                  onChangeFilters={newFilters => {
                    grid.setFiltersForColumn(targetCol, newFilters);
                  }}
                />
              </div>
            );
          })()}

          {formatSubMenuOpen && (() => {
            const menuRect = menuRef.current?.getBoundingClientRect();
            const formatItemRect = formatItemRef.current?.getBoundingClientRect();
            const containerRect = containerRef.current?.getBoundingClientRect();
            if (!menuRect || !formatItemRect || !containerRect) return null;

            const subLeft = menuRect.right - containerRect.left;
            const subTop = formatItemRect.top - containerRect.top;
            const targetCol = formatSubMenuOpen;
            const openColId = orderedColumns[menuState.colIndex]?.id ?? "";
            const openAggFn = openColId.includes(AGG_DELIMITER) ? openColId.split(AGG_DELIMITER)[1] : null;
            const NUMERIC_AGG_FNS_FM = new Set(["sum", "avg", "count", "distinct", "min", "max", "wavg"]);
            const kind = columnTypeMap[targetCol] ?? "other";
            const effectiveKind = openAggFn && NUMERIC_AGG_FNS_FM.has(openAggFn) ? "number" : kind;
            const colKind: "number" | "date" | "boolean" | "other" =
              effectiveKind === "number" || effectiveKind === "date" || effectiveKind === "boolean" ? effectiveKind : "other";

            return (
              <div
                ref={formatSubMenuRef}
                style={{
                  position: "absolute",
                  top: subTop,
                  left: subLeft,
                  background: "white",
                  border: "1px solid #ccc",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                  zIndex: 1001,
                }}
              >
                <ValueFormatMenu
                  columnId={targetCol}
                  columnKind={colKind}
                  activeFormat={columnFormats[targetCol]}
                  onChange={fmt => {
                    setColumnFormats(prev => {
                      const next = { ...prev };
                      if (fmt === null) {
                        delete next[targetCol];
                      } else {
                        next[targetCol] = fmt;
                      }
                      props.onColumnFormatsChange?.(next);
                      return next;
                    });
                  }}
                />
              </div>
            );
          })()}

          </>
        );
      })()}
    </div>
  );
}
