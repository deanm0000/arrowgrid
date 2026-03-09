import { useState, useMemo, useCallback, useEffect } from "react";
import type { ColumnTable, Table } from "arquero";
import { table, op, from, desc as aqDesc, escape } from "arquero";
import type { GridColumn, GridCell, Item, EditableGridCell } from "@glideapps/glide-data-grid";
import { toGridCell, getCellKind, CellValue } from "../convert/toGridCell";
import { fromGridCell } from "../convert/fromGridCell";
import { AGG_DELIMITER, type SortSpec, type FilterSpec, type CellChange, type UseArqueroGridResult, type UseArqueroGridProps, type RowData } from "../types";
import { Op } from "arquero/dist/types/op/op-api";
import { TableExpr, TypedArray } from "arquero/dist/types/table/types";



// grouping now handled via Arquero groupby + rollup

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
  // no UI-level grouping state; grouping is data-driven

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
      s.desc ? s.column : aqDesc(s.column)
    ));
    return inputTable.orderby(sortKeys);
  }, [sortBy]);

  // grouping handled below in finalView memo



  const [view, columnNames] = useMemo(() => {
    let v = baseTable;

    v = applyEdits(v);
    v = applyFilters(v);
    // v = applySort(v);

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
        if (!VALID_AGGS.has(fn)) continue;

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

    let grouped = view.groupby(...groupBy).rollup(rollupSpec);

    const finalColumns = [...groupBy, ...aggregateColumnIds];
    grouped = grouped.select(...finalColumns);

    grouped = applySort(grouped)
    return grouped;
  }, [view, groupBy, columnNames, sortBy, aggregates]);


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
      const column = finalView.columnNames()[col];
      if (!column) {
        return toGridCell(null);
      }

      const value = finalView.get(column, row);
      const kind = columnKinds[column] || "text";

      const returnCell = toGridCell(value, kind);
      return groupBy.length > 0 ? { ...returnCell, allowOverlay: false } : returnCell;
    },
    [finalView, columnKinds]
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


  const rows = useMemo(() => finalView.numRows(), [finalView]);

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

  // no row-level toggleGroup anymore

  return {
    columns: finalView.columnNames().filter((name) => name != "__row_id").map((name) => ({
      id: name,
      title: name.includes(AGG_DELIMITER)
        ? name.split(AGG_DELIMITER)[1]
        : name,
      width: 100,
    })) as GridColumn[],
    getCellContent,
    onCellEdited,
    rows,
    groups: undefined,
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
