import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { ColumnTable } from "arquero";
import { op, from, escape } from "arquero";
import { DataEditor, GridCellKind, useRowGrouping, type DrawHeaderCallback, type DrawCellCallback, type GridCell, type GridColumn, type HeaderClickedEventArgs, type Theme, type Item, type Rectangle, type RowGroup, type DataEditorRef, type EditableGridCell, type TextCell, useTheme } from "@glideapps/glide-data-grid";
import { AGG_DELIMITER, type UseArqueroGridProps, type SortSpec, type CellChange, type RowData, type FilterSpec, type ColumnFormat } from "../types";
import { toGridCell, getCellKind } from "../convert/toGridCell";
import { applyEdits, applyFilters, applySort } from "../data/transforms";
import { ColumnFilterMenu } from "./components/ColumnFilterMenu";
import { ValueFormatMenu } from "./components/ValueFormatMenu";
import type { TableExpr, TypedArray, Params } from "arquero/dist/types/table/types";


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
  const bgColors = useMemo<[string, string]>(() => {
    const bg = props.backgroundColor;
    if (Array.isArray(bg)) return bg;
    if (typeof bg === "string") return [bg, bg];
    return ["#e6e6e6", "#f5f5f5"];
  }, [props.backgroundColor]);
  const roundingRadius = props.roundingRadius ?? 6;
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
  const [formatSubMenuOpen, setFormatSubMenuOpen] = useState<{ colId: string; mode: "value" | "agg" } | null>(null);
  const formatValueItemRef = useRef<HTMLDivElement | null>(null);
  const formatAggItemRef = useRef<HTMLDivElement | null>(null);
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
  const [filters, setFilters] = useState<FilterSpec[]>(props.filters ?? []);
  const setFiltersForColumn = useCallback(
    (column: string, newFilters: FilterSpec[]) => {
      setFilters(prev => [
        ...prev.filter(f => f.column !== column),
        ...newFilters,
      ]);
    },
    []
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const groupHeaderScrollRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<DataEditorRef>(null);

  useEffect(() => {
    setExpandedGroups(new Set());
  }, [groupBy.join(",")]);

  const editable = props.editable;
  const onCellChange = props.onCellChange;
  const onDataChange = props.onDataChange;

  const [staged, setStaged] = useState<Map<string, Map<number, CellChange>>>(new Map());
  const [undoStack, setUndoStack] = useState<CellChange[]>([]);
  const [redoStack, setRedoStack] = useState<CellChange[]>([]);

  const baseTable = useMemo(() => {
    return props.data.derive({ __row_id: op.row_number() });
  }, [props.data]);

  useEffect(() => {
    setStaged(new Map());
    setUndoStack([]);
    setRedoStack([]);
  }, [props.data]);

  const [view, columnNames] = useMemo(() => {
    let v = applyEdits(baseTable, staged, baseTable.columnNames());
    v = applyFilters(v, filters);
    if (groupBy.length === 0) v = applySort(v, sortBy);
    return [v, baseTable.columnNames().filter(n => n !== "__row_id")];
  }, [baseTable, staged, filters, sortBy, groupBy.length]);

  const finalView = useMemo(() => {
    if (groupBy.length === 0) return view;

    const VALID_AGGS = new Set(["sum", "avg", "min", "max", "count", "distinct", "mode"]);
    const rollupSpec: Record<string, TableExpr> = {};
    const aggregateColumnIds: string[] = [];
    const nonGroupColumns = columnNames.filter(c => !groupBy.includes(c));

    type WavgSpec = { col: string; weightCol: string; productId: string };
    const needsWtdAvg: WavgSpec[] = [];

    for (const col of nonGroupColumns) {
      const arr = view.array(col) as TypedArray;
      const isNumeric = arr.every((v) => typeof v === "number" || v == null);
      const defaultFn = isNumeric ? "sum" : "distinct";
      const rawFns = aggregates?.[col];
      const fns = Array.isArray(rawFns) ? rawFns : rawFns ? [rawFns] : [defaultFn];

      for (const fn of fns) {
        if (fn.startsWith("wavg:")) {
          const weightCol = fn.slice(5);
          const productId = `${col}${AGG_DELIMITER}${weightCol}${AGG_DELIMITER}wtdprod`;
          if (!aggregateColumnIds.includes(productId)) {
            aggregateColumnIds.push(productId);
            rollupSpec[productId] = op.sum(`${col}_x_${weightCol}`);
          }
          needsWtdAvg.push({ col, weightCol, productId });
          continue;
        }

        if (!VALID_AGGS.has(fn)) continue;
        const id = `${col}${AGG_DELIMITER}${fn}`;
        if (aggregateColumnIds.includes(id)) continue;
        aggregateColumnIds.push(id);

        switch (fn) {
          case "sum": rollupSpec[id] = op.sum(col); break;
          case "avg": rollupSpec[id] = op.mean(col); break;
          case "min": rollupSpec[id] = op.min(col); break;
          case "max": rollupSpec[id] = op.max(col); break;
          case "count": rollupSpec[id] = op.count(); break;
          case "distinct": rollupSpec[id] = op.distinct(col); break;
          case "mode": rollupSpec[id] = op.mode(col); break;
        }
      }
    }

    for (const { weightCol } of needsWtdAvg) {
      const weightSumId = `${weightCol}${AGG_DELIMITER}sum`;
      if (!aggregateColumnIds.includes(weightSumId)) {
        aggregateColumnIds.push(weightSumId);
        rollupSpec[weightSumId] = op.sum(weightCol);
      }
    }

    let viewForGrouping = view;
    if (needsWtdAvg.length > 0) {
      const productDerives: Record<string, TableExpr> = {};
      for (const { col, weightCol } of needsWtdAvg) {
        const prodCol = `${col}_x_${weightCol}`;
        productDerives[prodCol] = escape((d: RowData) => (d[col] as number) * (d[weightCol] as number));
      }
      viewForGrouping = view.derive(productDerives);
    }

    let grouped = viewForGrouping.groupby(...groupBy).rollup(rollupSpec);

    if (needsWtdAvg.length > 0) {
      const wavgDerives: Record<string, TableExpr> = {};
      const intermediates = new Set<string>();
      const userRequestedSums = new Set(
        nonGroupColumns.flatMap(col =>
          (aggregates?.[col] ?? []).filter((f: string) => f === "sum").map(() => `${col}${AGG_DELIMITER}sum`)
        )
      );

      for (const { col, weightCol, productId } of needsWtdAvg) {
        const wavgId = `${col}${AGG_DELIMITER}wavg${AGG_DELIMITER}${weightCol}`;
        const weightSumId = `${weightCol}${AGG_DELIMITER}sum`;
        wavgDerives[wavgId] = escape((d: RowData) => {
          const prod = d[productId] as number;
          const wsum = d[weightSumId] as number;
          return wsum === 0 ? null : prod / wsum;
        });
        let insertAt = -1;
        for (let i = 0; i < aggregateColumnIds.length; i++) {
          if (aggregateColumnIds[i].split(AGG_DELIMITER)[0] === col) insertAt = i;
        }
        if (insertAt === -1) aggregateColumnIds.push(wavgId);
        else aggregateColumnIds.splice(insertAt + 1, 0, wavgId);
        intermediates.add(productId);
        if (!userRequestedSums.has(weightSumId)) {
          intermediates.add(weightSumId);
        }
      }
      grouped = grouped.derive(wavgDerives);
      const toKeep = aggregateColumnIds.filter(id => !intermediates.has(id));
      aggregateColumnIds.splice(0, aggregateColumnIds.length, ...toKeep);
    }

    const finalColumns = [...groupBy, ...aggregateColumnIds];
    grouped = grouped.select(...finalColumns);
    grouped = applySort(grouped, sortBy);
    return grouped;
  }, [view, groupBy, columnNames, sortBy, aggregates]);

  const gridColumns = useMemo(() =>
    finalView.columnNames().filter((name) => name != "__row_id").map((name) => ({
      id: name,
      title: name.includes(AGG_DELIMITER)
        ? (() => {
            const parts = name.split(AGG_DELIMITER);
            return parts[1] === "wavg" ? `wavg(${parts[2]})` : parts[1];
          })()
        : name,
      width: 100,
    })) as GridColumn[],
  [finalView]);

  const groupKeyFor = useCallback(
    (row: RowData) => JSON.stringify(groupBy.map(col => row[col])),
    [groupBy]
  );

  const { expandedView, rowGroups } = useMemo(() => {
    if (groupBy.length === 0 || expandedGroups.size === 0) {
      const groups: RowGroup[] = [];
      for (let i = 0; i < finalView.numRows(); i++) {
        groups.push({ headerIndex: i, isCollapsed: true });
      }
      return { expandedView: finalView, rowGroups: groupBy.length > 0 ? groups : [] };
    }

    const finalCols = finalView.columnNames();
    const allRows: Record<string, unknown>[] = [];
    const groups: RowGroup[] = [];

    for (let i = 0; i < finalView.numRows(); i++) {
      const summaryRow = finalView.object(i) as RowData;
      const key = groupKeyFor(summaryRow);
      const isExpanded = expandedGroups.has(key);
      const headerIndex = allRows.length;
      allRows.push(summaryRow);

      if (isExpanded) {
        const filtered = view.params({ gk: groupBy.map(col => summaryRow[col]) })
          .filter(
            escape((d: RowData, $: Params) =>
              groupBy.every((col, idx) => d[col] === $.gk[idx])
            )
          );
        for (let j = 0; j < filtered.numRows(); j++) {
          const detailRow = filtered.object(j) as RowData;
          const projected: Record<string, unknown> = {};
          for (const col of finalCols) {
            if (groupBy.includes(col)) {
              projected[col] = detailRow[col];
            } else {
              const base = col.split(AGG_DELIMITER)[0];
              projected[col] = detailRow[base] ?? null;
            }
          }
          allRows.push(projected);
        }
        groups.push({ headerIndex, isCollapsed: false });
      } else {
        groups.push({ headerIndex, isCollapsed: true });
      }
    }

    return { expandedView: from(allRows).select(finalCols), rowGroups: groups };
  }, [finalView, expandedGroups, view, groupBy, groupKeyFor]);

  const gridRows = useMemo(() => expandedView.numRows(), [expandedView]);

  const toggleExpandGroup = useCallback(
    (expandedViewRowIndex: number) => {
      const row = expandedView.object(expandedViewRowIndex) as RowData;
      if (!row) return;
      const key = groupKeyFor(row);
      setExpandedGroups(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [expandedView, groupKeyFor]
  );

  const columnKinds = useMemo(() => {
    const kinds: Record<string, "text" | "number" | "uri" | "image" | "boolean" | "markdown" | "bubble" | "drilldown" | "rowid"> = {};
    const sampleObj = baseTable.object(0) as RowData | undefined;
    if (sampleObj) {
      for (const colName of columnNames) {
        const sampleValue = sampleObj[colName];
        kinds[colName] = getCellKind(colName, sampleValue);
      }
    }
    return kinds;
  }, [baseTable]);

  const gridGetCellContent = useCallback(
    (cell: Item): GridCell => {
      const [col, row] = cell;
      const column = expandedView.columnNames()[col];
      if (!column) return toGridCell(null);

      const value = expandedView.get(column, row);
      const baseCol = column.includes(AGG_DELIMITER) ? column.split(AGG_DELIMITER)[0] : column;
      const aggFn = column.includes(AGG_DELIMITER) ? column.split(AGG_DELIMITER)[1] : null;
      const NUMERIC_AGG_FNS = new Set(["sum", "avg", "mean", "count", "distinct", "min", "max"]);
      const baseKind = columnKinds[baseCol] || columnKinds[column] || "text";

      const isDetailRow = aggFn && value !== null && value !== undefined && typeof value !== "number";
      const kind = isDetailRow ? baseKind : (aggFn && NUMERIC_AGG_FNS.has(aggFn) ? "number" : baseKind);
      const fmt: ColumnFormat | undefined = isDetailRow
        ? columnFormats[baseCol]
        : columnFormats[column] ?? columnFormats[baseCol];

      const returnCell = toGridCell(value, kind, fmt, testCopyMode);
      return groupBy.length > 0 ? { ...returnCell, allowOverlay: false } : returnCell;
    },
    [expandedView, columnKinds, columnFormats, testCopyMode, groupBy.length]
  );

  const isColumnEditable = useCallback((columnId: string): boolean => {
    if (groupBy.length > 0) return false;
    if (editable === undefined || editable === false) return false;
    if (typeof editable === "boolean") return editable;
    if (typeof editable === "object") {
      return editable[columnId] ?? false;
    }
    return false;
  }, [groupBy, editable]);

  const onCellEdited = useCallback(
    (cell: Item, newCell: EditableGridCell): void => {
      const [col, row] = cell;
      const column = baseTable.columnNames()[col];
      if (!column) return;
      if (!isColumnEditable(column)) return;
      if ("displayData" in newCell && newCell.displayData == String(newCell.data)) return;

      const viewWRows = view.derive({ __disp_row: op.row_number() });
      const filtTab = viewWRows.filter(escape((d: RowData) => d.__disp_row == row + 1));
      const rowId = filtTab.get("__row_id", 0) as number;

      const oldEdit = staged.get(column)?.get(rowId);
      setStaged(prev => {
        const newOuterMap = new Map(prev);
        const existingInnerMap = newOuterMap.get(column) || new Map();
        const newInnerMap = new Map(existingInnerMap);
        newInnerMap.set(rowId, newCell.data);
        newOuterMap.set(column, newInnerMap);
        return newOuterMap;
      });

      setUndoStack(prev => [...prev, {
        row: rowId,
        col: column,
        oldVal: (oldEdit == undefined) ? undefined : oldEdit.oldVal
      }]);
      setRedoStack([]);
    },
    [view, isColumnEditable, baseTable, staged]
  );

  const commit = useCallback(() => {
    const committedWithId = applyEdits(baseTable, staged, baseTable.columnNames());
    const cleanColumns = committedWithId.columnNames();
    const committed = committedWithId.select(...cleanColumns) as ColumnTable;
    onDataChange?.(committed);
    setStaged(new Map());
  }, [staged, baseTable, onDataChange]);

  const rollback = useCallback(() => {
    setStaged(new Map());
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  const undo = useCallback(() => {
    const latestUndo = undoStack.at(-1);
    setUndoStack(prev => [...prev.slice(0, -1)]);
    if (latestUndo != undefined) {
      const thisRedoVal = staged.get(latestUndo.col)?.get(latestUndo.row)?.oldVal ?? undefined;
      if (thisRedoVal != undefined) {
        setRedoStack(prev => [...prev, { row: latestUndo.row, col: latestUndo.col, oldVal: thisRedoVal }]);
      }
    }
    setStaged(prev => {
      if (latestUndo == undefined) return prev;
      const newOuterMap = new Map(prev);
      const existingInnerMap = newOuterMap.get(latestUndo.col) || new Map();
      const newInnerMap = new Map(existingInnerMap);
      if (latestUndo.oldVal == undefined) newInnerMap.delete(latestUndo.row);
      else newInnerMap.set(latestUndo.row, latestUndo.oldVal);
      newOuterMap.set(latestUndo.col, newInnerMap);
      return newOuterMap;
    });
  }, [undoStack, staged]);

  const redo = useCallback(() => {
    const latestRedo = redoStack.at(-1);
    if (!latestRedo) return false;
    setRedoStack(prev => [...prev.slice(0, -1)]);
    setUndoStack(prev => {
      if (prev.filter(x => x.col == latestRedo.col && x.row == latestRedo.row).length == 0) {
        return [...prev, { ...latestRedo, oldVal: undefined }];
      } else {
        return [...prev, latestRedo];
      }
    });
    setStaged(prev => {
      if (latestRedo == undefined) return prev;
      const newOuterMap = new Map(prev);
      const existingInnerMap = newOuterMap.get(latestRedo.col) || new Map();
      const newInnerMap = new Map(existingInnerMap);
      if (latestRedo.oldVal == undefined) newInnerMap.delete(latestRedo.row);
      else newInnerMap.set(latestRedo.row, latestRedo.oldVal);
      newOuterMap.set(latestRedo.col, newInnerMap);
      return newOuterMap;
    });
    return true;
  }, [redoStack, staged]);

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
      const otherFilters = filters.filter(f => f.column !== col && f.op !== "in");
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
  }, [props.data, filters, allDistinctValues]);

  useEffect(() => {
    if (groupBy.length === 0) setAggregates({});
  }, [groupBy.length]);

  const [columnOrder, setColumnOrder] = useState<string[]>([]);

  const defaultOrderedColumns = useMemo(() => {
    const groupedSet = new Set(groupBy);
    const groupedCols = gridColumns.filter(c => c.id && groupedSet.has(c.id));
    const otherCols = gridColumns.filter(c => !c.id || !groupedSet.has(c.id));
    return [...groupedCols, ...otherCols];
  }, [gridColumns, groupBy]);

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
      .map(id => gridColumns.find(c => c.id === id))
      .filter((c): c is typeof gridColumns[0] => Boolean(c));
  }, [columnOrder, gridColumns, defaultOrderedColumns]);


  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.key.toLowerCase() === 'd' && e.ctrlKey && e.shiftKey && e.altKey)) return;
      const editor = editorRef.current;
      if (!editor) return;

      const numCols = orderedColumns.length;
      const numRows = gridRows;

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

      const cr = containerRef.current?.getBoundingClientRect();
      console.log('__ARROWGRID_LAYOUT__', JSON.stringify({
        columns,
        rows,
        containerBounds: cr ? { top: cr.top, bottom: cr.bottom } : { top: 0, bottom: 9999 },
      }));
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [orderedColumns, gridRows]);

  // Map visual column index -> underlying column index
  const columnIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    gridColumns.forEach((c, i) => {
      if (c.id) map.set(c.id, i);
    });
    return map;
  }, [gridColumns]);

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
    orderedColumns: typeof gridColumns,
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
    () => new Set(rowGroups.map(g => g.headerIndex)),
    [rowGroups]
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
    if (groupBy.length === 0 || rowGroups.length === 0) return undefined;
    return {
      groups: rowGroups as RowGroup[],
      height: 34,
      navigationBehavior: "skip" as const,
    };
  }, [rowGroups, groupBy]);

  const { mapper } = useRowGrouping(rowGroupingOptions, gridRows);

  const expandToggleColIndex = useMemo(() => {
    if (groupBy.length === 0) return -1;
    const lastGroupCol = groupBy[groupBy.length - 1];
    return orderedColumns.findIndex(c => c.id === lastGroupCol);
  }, [groupBy, orderedColumns]);

  const collapsedRowSet = useMemo(() => {
    const set = new Set<number>();
    for (const g of rowGroups) {
      if (g.isCollapsed) set.add(g.headerIndex);
    }
    return set;
  }, [rowGroups]);

  const drawCell = useCallback<DrawCellCallback>(
    (args, drawContent) => {
      const { ctx, rect, theme, highlighted } = args;
      const rowBg = bgColors[args.row % 2];

      const fillBg = (inset = 0) => {
        ctx.fillStyle = rowBg;
        ctx.fillRect(rect.x + inset, rect.y + inset, rect.width - inset * 2, rect.height - inset * 2);
        if (highlighted) {
          ctx.fillStyle = theme.accentLight;
          ctx.fillRect(rect.x + inset, rect.y + inset, rect.width - inset * 2, rect.height - inset * 2);
        }
      };

      const drawBorders = () => {
        const borderColor = theme.borderColor ?? "#e6e6e6";
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rect.x + rect.width - 0.5, rect.y);
        ctx.lineTo(rect.x + rect.width - 0.5, rect.y + rect.height);
        ctx.moveTo(rect.x, rect.y + rect.height - 0.5);
        ctx.lineTo(rect.x + rect.width, rect.y + rect.height - 0.5);
        ctx.stroke();
      };

      const col = orderedColumns[args.col];
      const colId = col?.id ?? null;
      const baseColId = colId
        ? (colId.includes(AGG_DELIMITER) ? colId.split(AGG_DELIMITER)[0] : colId)
        : null;
      const fmt = colId ? (columnFormats[colId] ?? (baseColId ? columnFormats[baseColId] : undefined)) : undefined;
      const isAccounting = fmt?.kind === "number" && fmt.format.type === "accounting";
      const isHeaderRow = groupBy.length > 0 && headerRowSet.has(args.row);

      if (isAccounting) {
        const cellData = "displayData" in args.cell ? args.cell.displayData : ("data" in args.cell ? String(args.cell.data) : "");
        const numStr = typeof cellData === "string" ? cellData : "";
        const isNeg = numStr.startsWith("(");
        const padding = 8;
        ctx.save();
        fillBg(isHeaderRow ? 0 : 1);
        ctx.fillStyle = isNeg ? "#c00" : theme.textDark;
        ctx.font = isHeaderRow ? `bold 13px ${theme.fontFamily}` : (theme.baseFontStyle ?? "13px sans-serif");
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillText("$", rect.x + padding, rect.y + rect.height / 2);
        ctx.textAlign = "right";
        ctx.fillText(numStr, rect.x + rect.width - padding, rect.y + rect.height / 2);
        if (isHeaderRow) drawBorders();
        ctx.restore();
        return;
      }

      if (!isHeaderRow) {
        ctx.save();
        fillBg();
        ctx.restore();
        drawContent();
        return;
      }

      const { cell } = args;
      const displayText = ("displayData" in cell ? cell.displayData : null) ?? ("data" in cell ? String(cell.data) : "") ?? "";
      const padding = 8;

      ctx.save();
      fillBg();

      ctx.fillStyle = theme.textDark;
      ctx.font = `bold 13px ${theme.fontFamily}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(String(displayText), rect.x + padding, rect.y + rect.height / 2);

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

      drawBorders();
      ctx.restore();
    },
    [groupBy, expandToggleColIndex, headerRowSet, collapsedRowSet, orderedColumns, columnFormats, bgColors]
  );

  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      const [visualCol, row] = cell;

      const col = orderedColumns[visualCol];
      if (!col?.id) return gridGetCellContent(cell as Item);

      const underlyingIndex = columnIndexMap.get(col.id);
      if (underlyingIndex == null)
        return gridGetCellContent(cell as Item);

      const isDetailRow = groupBy.length > 0 && !headerRowSet.has(row);

      if (isDetailRow && col.id && groupBy.includes(col.id)) {
        return { kind: GridCellKind.Text, data: "", displayData: "", allowOverlay: false } satisfies TextCell;
      }

      if (isDetailRow && col.id.includes(AGG_DELIMITER)) {
        const spanInfo = aggColSpans.get(visualCol);
        if (spanInfo && spanInfo[0] === -1) {
          return { kind: GridCellKind.Text, data: "", displayData: "", allowOverlay: false } satisfies TextCell;
        }
        const baseCell = gridGetCellContent([underlyingIndex, row] as Item);
        if (spanInfo) {
          return { ...baseCell, span: spanInfo, allowOverlay: false };
        }
        return { ...baseCell, allowOverlay: false };
      }

      return gridGetCellContent([underlyingIndex, row] as Item);
    },
    [orderedColumns, columnIndexMap, gridGetCellContent, headerRowSet, groupBy, aggColSpans]
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
    <div className="arrow-grid-container" ref={containerRef} style={{ position: "relative", height:'100%', width:'100%'  }} >
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
        onCellEdited={onCellEdited}
        theme={{ bgCell: bgColors[0], bgCellMedium: bgColors[1], roundingRadius }}
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
        rows={gridRows}
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
                toggleExpandGroup(mapped.originalIndex as number);
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
              const hasNumericAgg = aggFn != null && NUMERIC_AGG_FNS.has(aggFn);
              const sourceFormattable = kind === "number" || kind === "date" || kind === "boolean";
              const needsSplitMenu = groupBy.length > 0 && hasNumericAgg && kind !== "number" && sourceFormattable;
              const items: React.ReactNode[] = [];

              if (sourceFormattable) {
                items.push(
                  <div
                    key="value-format"
                    ref={formatValueItemRef}
                    style={{ padding: "6px 12px", cursor: "pointer", background: formatSubMenuOpen?.colId === baseColId && formatSubMenuOpen.mode === "value" ? "rgba(0,0,0,0.05)" : undefined }}
                    onClick={() => { setFormatSubMenuOpen(prev => prev?.colId === baseColId && prev.mode === "value" ? null : { colId: baseColId, mode: "value" }); setFilterSubMenuOpen(null); }}
                  >
                    Value format ▶
                  </div>
                );
              }

              if (needsSplitMenu) {
                items.push(
                  <div
                    key="agg-format"
                    ref={formatAggItemRef}
                    style={{ padding: "6px 12px", cursor: "pointer", background: formatSubMenuOpen?.colId === baseColId && formatSubMenuOpen.mode === "agg" ? "rgba(0,0,0,0.05)" : undefined }}
                    onClick={() => { setFormatSubMenuOpen(prev => prev?.colId === baseColId && prev.mode === "agg" ? null : { colId: baseColId, mode: "agg" }); setFilterSubMenuOpen(null); }}
                  >
                    Aggregate format ▶
                  </div>
                );
              } else if (!sourceFormattable && hasNumericAgg) {
                items.push(
                  <div
                    key="agg-format"
                    ref={formatAggItemRef}
                    style={{ padding: "6px 12px", cursor: "pointer", background: formatSubMenuOpen?.colId === baseColId && formatSubMenuOpen.mode === "agg" ? "rgba(0,0,0,0.05)" : undefined }}
                    onClick={() => { setFormatSubMenuOpen(prev => prev?.colId === baseColId && prev.mode === "agg" ? null : { colId: baseColId, mode: "agg" }); setFilterSubMenuOpen(null); }}
                  >
                    Aggregate format ▶
                  </div>
                );
              }

              if (items.length === 0) return null;
              return <>{items}</>;
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
            const colFilters = filters.filter((f: FilterSpec) => f.column === targetCol);

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
                    setFiltersForColumn(targetCol, newFilters);
                  }}
                />
              </div>
            );
          })()}

          {formatSubMenuOpen && (() => {
            const menuRect = menuRef.current?.getBoundingClientRect();
            const anchorRef = formatSubMenuOpen.mode === "agg" ? formatAggItemRef : formatValueItemRef;
            const formatItemRect = anchorRef.current?.getBoundingClientRect();
            const containerRect = containerRef.current?.getBoundingClientRect();
            if (!menuRect || !formatItemRect || !containerRect) return null;

            const subLeft = menuRect.right - containerRect.left;
            const subTop = formatItemRect.top - containerRect.top;
            const targetBaseCol = formatSubMenuOpen.colId;
            const openColId = orderedColumns[menuState.colIndex]?.id ?? "";

            let formatKey: string;
            let colKind: "number" | "date" | "boolean" | "other";

            if (formatSubMenuOpen.mode === "agg") {
              formatKey = openColId;
              colKind = "number";
            } else {
              formatKey = targetBaseCol;
              const kind = columnTypeMap[targetBaseCol] ?? "other";
              colKind = kind === "number" || kind === "date" || kind === "boolean" ? kind : "other";
            }

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
                  columnId={formatKey}
                  columnKind={colKind}
                  activeFormat={columnFormats[formatKey]}
                  onChange={fmt => {
                    setColumnFormats(prev => {
                      const next = { ...prev };
                      if (fmt === null) {
                        delete next[formatKey];
                      } else {
                        next[formatKey] = fmt;
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
