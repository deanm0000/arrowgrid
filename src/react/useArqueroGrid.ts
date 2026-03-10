import { useState, useMemo, useCallback, useEffect } from "react";
import type { ColumnTable } from "arquero";
import { op, from, desc as aqDesc, escape } from "arquero";
import type { GridColumn, GridCell, Item, EditableGridCell, RowGroup } from "@glideapps/glide-data-grid";
import { toGridCell, getCellKind } from "../convert/toGridCell";

import { AGG_DELIMITER, type FilterSpec, type CellChange, type UseArqueroGridResult, type UseArqueroGridProps, type RowData } from "../types";

import { TableExpr, TypedArray } from "arquero/dist/types/table/types";




export function useArqueroGrid(
  props: UseArqueroGridProps
): UseArqueroGridResult {
  const {
    data,
    groupBy = [],
    sortBy = [],
    filters: initialFilters = [],
    aggregates = {},
    editable,
    onCellChange,
    onDataChange,
  } = props;


  // const [baseTable, setbaseTable] = useState<ColumnTable>(data);
  const [filters, setFilters] = useState<FilterSpec[]>(initialFilters);
  const [staged, setStaged] = useState<Map<string, Map<number, CellChange>>>(new Map());
  const [undoStack, setUndoStack] = useState<CellChange[]>([]);
  const [redoStack, setRedoStack] = useState<CellChange[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const baseTable = useMemo(() => {
    const tableWRows = data.derive({
      __row_id: op.row_number(),
    })
    return tableWRows
  }, [data]);
  useEffect(() => {
    setStaged(new Map());
    setUndoStack([]);
    setRedoStack([]);
  }, [data]);

  useEffect(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  useEffect(() => {
    setExpandedGroups(new Set());
  }, [groupBy.join(",")]);

  const applyEdits = useCallback((inputTable: ColumnTable): ColumnTable => {
    if (staged.size === 0) return inputTable;

    let joined = inputTable
    for (const [col, innerMap] of staged) {
      if (innerMap.size == 0) continue

      const objs = Array.from(innerMap, ([row, val]) => ({ [col]: val, __row_id: row }))
      let editsTable = from(objs);

      editsTable = editsTable.rename({ [col]: `${col}${AGG_DELIMITER}edited` })

      joined = joined.join_left(
        editsTable,
        "__row_id"
      );
      joined = joined.derive({ [col]: escape((d: RowData) => d[`${col}${AGG_DELIMITER}edited`] ?? d[col]) })
    }

    return joined.select(baseTable.columnNames())
  }, [staged]);

  const applyFilters = useCallback((inputTable: ColumnTable): ColumnTable => {
    if (filters.length === 0) return inputTable;

    const filterConditions: ((d: RowData) => boolean)[] = [];

    for (const filter of filters) {
      if (filter.expr) {
        filterConditions.push(filter.expr);
        continue;
      }

      const { column, op: operator, value, otherColumn } = filter;
      if (!column || !operator) continue;

      switch (operator) {
        case "==":
          filterConditions.push((d: RowData) => d[column] === value);
          break;
        case "!=":
          filterConditions.push((d: RowData) => d[column] !== value);
          break;
        case ">":
          if (otherColumn) {
            filterConditions.push((d: RowData) => (d[column] as number) > (d[otherColumn] as number));
          } else if (value != null) {
            filterConditions.push((d: RowData) => (d[column] as number) > (value as number));
          }
          break;
        case "<":
          if (otherColumn) {
            filterConditions.push((d: RowData) => (d[column] as number) < (d[otherColumn] as number));
          } else if (value != null) {
            filterConditions.push((d: RowData) => (d[column] as number) < (value as number));
          }
          break;
        case ">=":
          if (otherColumn) {
            filterConditions.push((d: RowData) => (d[column] as number) >= (d[otherColumn] as number));
          } else if (value != null) {
            filterConditions.push((d: RowData) => (d[column] as number) >= (value as number));
          }
          break;
        case "<=":
          if (otherColumn) {
            filterConditions.push((d: RowData) => (d[column] as number) <= (d[otherColumn] as number));
          } else if (value != null) {
            filterConditions.push((d: RowData) => (d[column] as number) <= (value as number));
          }
          break;
        case "contains":
          if (typeof value === "string") {
            filterConditions.push((d: RowData) =>
              String(d[column] ?? "").toLowerCase().includes(value.toLowerCase())
            );
          }
          break;
        case "startsWith":
          if (typeof value === "string") {
            filterConditions.push((d: RowData) =>
              String(d[column] ?? "").toLowerCase().startsWith(value.toLowerCase())
            );
          }
          break;
        case "endsWith":
          if (typeof value === "string") {
            filterConditions.push((d: RowData) =>
              String(d[column] ?? "").toLowerCase().endsWith(value.toLowerCase())
            );
          }
          break;
        case "in":
          if (Array.isArray(value)) {
            filterConditions.push((d: RowData) => value.includes(d[column]));
          }
          break;
      }
    }

    if (filterConditions.length === 0) return inputTable;
    const combinedFilter = (d: RowData) => filterConditions.every(fn => fn(d));
    return inputTable.filter(combinedFilter);
  }, [filters]);

  const applySort = useCallback((inputTable: ColumnTable): ColumnTable => {
    if (sortBy.length === 0) return inputTable;
    const sortKeys = sortBy.map((s) => (
      s.desc ? aqDesc(s.column) : s.column
    ));
    return inputTable.orderby(sortKeys);
  }, [sortBy]);

  const [view, columnNames] = useMemo(() => {
    let v = baseTable;

    v = applyEdits(v);
    v = applyFilters(v);
    if (groupBy.length === 0) v = applySort(v);

    return [v, baseTable.columnNames().filter(n => n !== "__row_id")]
  }, [baseTable, applyEdits, applyFilters, applySort]);

  const finalView = useMemo(() => {
    if (groupBy.length === 0) return view;

    const VALID_AGGS = new Set([
      "sum",
      "avg",
      "min",
      "max",
      "count",
      "distinct",
      "mode",
    ]);

    const rollupSpec: Record<string, TableExpr> = {};
    const aggregateColumnIds: string[] = [];

    const nonGroupColumns = columnNames.filter(
      c => !groupBy.includes(c)
    );

    type WavgSpec = { col: string; weightCol: string; productId: string };
    const needsWtdAvg: WavgSpec[] = [];

    for (const col of nonGroupColumns) {
      const arr = view.array(col) as TypedArray;
      const isNumeric = arr.every(
        (v) => typeof v === "number" || v == null
      );

      const defaultFn = isNumeric ? "sum" : "distinct";
      const rawFns = aggregates?.[col];

      const fns = Array.isArray(rawFns)
        ? rawFns
        : rawFns
          ? [rawFns]
          : [defaultFn];

      for (const fn of fns) {
        if (fn.startsWith("wavg:")) {
          const weightCol = fn.slice(5);
          const productId = `${col}${AGG_DELIMITER}${weightCol}${AGG_DELIMITER}wtdprod`;
          if (!aggregateColumnIds.includes(productId)) {
            aggregateColumnIds.push(productId);
            rollupSpec[productId] = op.sum(`${col}_x_${weightCol}` as any);
          }
          needsWtdAvg.push({ col, weightCol, productId });
          continue;
        }

        if (!(VALID_AGGS.has(fn))) continue;

        const id = `${col}${AGG_DELIMITER}${fn}`;
        if (aggregateColumnIds.includes(id)) continue;

        aggregateColumnIds.push(id);

        switch (fn) {
          case "sum":
            rollupSpec[id] = op.sum(col);
            break;
          case "avg":
            rollupSpec[id] = op.mean(col);
            break;
          case "min":
            rollupSpec[id] = op.min(col);
            break;
          case "max":
            rollupSpec[id] = op.max(col);
            break;
          case "count":
            rollupSpec[id] = op.count();
            break;
          case "distinct":
            rollupSpec[id] = op.distinct(col);
            break;
          case "mode":
            rollupSpec[id] = op.mode(col);
            break;
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

    grouped = applySort(grouped)
    return grouped;
  }, [view, groupBy, columnNames, sortBy, aggregates]);

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
      console.log("[rowGroups] all collapsed, finalView rows:", finalView.numRows(), "groups:", groups.length);
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
        const filtered = view.params({ gk: groupBy.map(col => (summaryRow as any)[col]) })
          .filter(
            escape((d: RowData, $: any) =>
              groupBy.every((col, idx) => d[col] === $.gk[idx])
            )
          );
        const detailCount = filtered.numRows();
        console.log("[expandedView] group", key, "headerIndex:", headerIndex, "detailRows:", detailCount);

        for (let j = 0; j < detailCount; j++) {
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

    console.log("[expandedView] total rows:", allRows.length, "groups:", groups.length, "expanded:", expandedGroups.size);
    return { expandedView: from(allRows).select(finalCols), rowGroups: groups };
  }, [finalView, expandedGroups, view, groupBy, groupKeyFor]);

  const toggleExpandGroup = useCallback(
    (expandedViewRowIndex: number) => {
      const row = expandedView.object(expandedViewRowIndex) as RowData;
      if (!row) {
        console.log("[toggleExpandGroup] no row at index", expandedViewRowIndex);
        return;
      }
      const key = groupKeyFor(row);
      console.log("[toggleExpandGroup] index:", expandedViewRowIndex, "key:", key);
      setExpandedGroups(prev => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
          console.log("[toggleExpandGroup] collapsing, expandedGroups size:", next.size);
        } else {
          next.add(key);
          console.log("[toggleExpandGroup] expanding, expandedGroups size:", next.size);
        }
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


  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      const [col, row] = cell;
      const column = expandedView.columnNames()[col];
      if (!column) {
        return toGridCell(null);
      }

      const value = expandedView.get(column, row);
      const baseCol = column.includes(AGG_DELIMITER) ? column.split(AGG_DELIMITER)[0] : column;
      const kind = columnKinds[baseCol] || columnKinds[column] || "text";

      const returnCell = toGridCell(value, kind);
      return groupBy.length > 0 ? { ...returnCell, allowOverlay: false } : returnCell;
    },
    [expandedView, columnKinds]
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

      if ("displayData" in newCell && newCell.displayData == String(newCell.data)) {
        return
      }
      const viewWRows = view.derive({ __disp_row: op.row_number() })

      const filtTab = viewWRows.filter(escape((d: RowData) => d.__disp_row == row + 1))

      const rowId = filtTab.get("__row_id", 0) as number



      const oldEdit = staged.get(column)?.get(rowId)
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

      // onCellChange?.(column, row, oldValue, newValue);

    },
    [view, isColumnEditable, onCellChange]
  );


  const rows = useMemo(() => expandedView.numRows(), [expandedView]);

  const setFilter = useCallback(
    (filter: FilterSpec) => {
      setFilters(prev => [...prev, filter]);
    },
    []
  );

  const removeFilter = useCallback(
    (index: number) => {
      setFilters(prev => prev.filter((_, i) => i !== index));
    },
    []
  );

  const clearFilters = useCallback(() => {
    setFilters([]);
  }, []);

  const commit = useCallback(() => {
    const committedWithId = applyEdits(baseTable);
    const cleanColumns = committedWithId
      .columnNames()
    const committed = committedWithId.select(...cleanColumns) as ColumnTable;

    onDataChange?.(committed);
    setStaged(new Map());
  }, [applyEdits, baseTable, onDataChange]);

  const rollback = useCallback(() => {
    setStaged(new Map());
    setUndoStack([])
    setRedoStack([])
  }, []);

  const undo = useCallback(() => {
    const latestUndo = undoStack.at(-1)
    console.log(latestUndo)
    setUndoStack(prev => [...prev.slice(0, -1)]);
    if (latestUndo != undefined) {
      const thisRedoVal = staged.get(latestUndo.col)?.get(latestUndo.row)?.oldVal ?? undefined
      if (thisRedoVal != undefined) {
        setRedoStack(prev => [...prev, { row: latestUndo.row, col: latestUndo.col, oldVal: thisRedoVal }])
      };
    }

    setStaged(prev => {
      if (latestUndo == undefined) {
        return prev
      }
      const newOuterMap = new Map(prev);
      const existingInnerMap = newOuterMap.get(latestUndo.col) || new Map();
      const newInnerMap = new Map(existingInnerMap);

      if (latestUndo.oldVal == undefined) {

        newInnerMap.delete(latestUndo.row)
      } else {
        newInnerMap.set(latestUndo.row, latestUndo.oldVal)
      }
      newOuterMap.set(latestUndo.col, newInnerMap);
      return newOuterMap;
    });
  }, [undoStack, baseTable]);

  const redo = useCallback(() => {
    const latestRedo = redoStack.at(-1);
    if (!latestRedo) return false;

    setRedoStack(prev => [...prev.slice(0, -1)]);
    setUndoStack(prev => {
      if (prev.filter(x => x.col == latestRedo.col && x.row == latestRedo.row).length == 0) {
        return [...prev, { ...latestRedo, oldVal: undefined }]
      } else {
        return [...prev, latestRedo]
      }
    });

    setStaged(prev => {
      if (latestRedo == undefined) {
        return prev
      }
      const newOuterMap = new Map(prev);
      const existingInnerMap = newOuterMap.get(latestRedo.col) || new Map();
      const newInnerMap = new Map(existingInnerMap);

      if (latestRedo.oldVal == undefined) {

        newInnerMap.delete(latestRedo.row)
      } else {
        newInnerMap.set(latestRedo.row, latestRedo.oldVal)
      }
      newOuterMap.set(latestRedo.col, newInnerMap);
      return newOuterMap;
    });
    return true;
  }, [redoStack, baseTable]);

  return {
    columns: finalView.columnNames().filter((name) => name != "__row_id").map((name) => ({
      id: name,
      title: name.includes(AGG_DELIMITER)
        ? (() => {
            const parts = name.split(AGG_DELIMITER);
            return parts[1] === "wavg" ? `wavg(${parts[2]})` : parts[1];
          })()
        : name,
      width: 100,
    })) as GridColumn[],
    getCellContent,
    onCellEdited,
    rows,
    rowGroups,
    toggleExpandGroup,
    filters,
    setFilter,
    removeFilter,
    clearFilters,
    stagedCount: Array.from(staged.values()).reduce((sum, r) => sum + Object.keys(r).length, 0),
    commit,
    rollback,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  };
}
