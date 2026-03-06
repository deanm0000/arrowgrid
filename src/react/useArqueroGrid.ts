import { useState, useMemo, useCallback, useEffect } from "react";
import type { ColumnTable, Table } from "arquero";
import { table, op, from, desc as aqDesc, escape } from "arquero";
import type { GridColumn, GridCell, Item, EditableGridCell, RowGroup, RowGroupingOptions } from "@glideapps/glide-data-grid";
import { useRowGrouping } from "@glideapps/glide-data-grid";
import { toGridCell, getCellKind } from "../convert/toGridCell";
import { fromGridCell } from "../convert/fromGridCell";
import type { SortSpec, FilterSpec, CellChange, UseArqueroGridResult, UseArqueroGridProps } from "../types";



interface GroupInfo {
  headerIndex: number;
  isCollapsed: boolean;
  key: string;
  rowCount: number;
  subGroups: GroupInfo[] | undefined;
}

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
  const [staged, setStaged] = useState<Map<string, Map<number, any>>>(new Map());
  const [undoStack, setUndoStack] = useState<CellChange[]>([]);
  const [redoStack, setRedoStack] = useState<CellChange[]>([]);
  const [groupStates, setGroupStates] = useState<Map<string, boolean>>(new Map());

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

      editsTable = editsTable.rename({ [col]: `${col}___edited` })

      joined = joined.join_left(
        editsTable,
        "__row_id"
      );
      joined = joined.derive({ [col]: escape((d: any) => d[`${col}___edited`] ?? d[col]) })
    }

    return joined.select(baseTable.columnNames())
  }, [staged]);

  const applyFilters = useCallback((inputTable: ColumnTable): ColumnTable => {
    if (filters.length === 0) return inputTable;

    const filterConditions: ((d: any) => boolean)[] = [];

    for (const filter of filters) {
      if (filter.expr) {
        filterConditions.push(filter.expr);
        continue;
      }

      const { column, op: operator, value, otherColumn } = filter;
      if (!column || !operator) continue;

      switch (operator) {
        case "==":
          filterConditions.push((d: any) => d[column] === value);
          break;
        case "!=":
          filterConditions.push((d: any) => d[column] !== value);
          break;
        case ">":
          if (otherColumn) {
            filterConditions.push((d: any) => d[column] > d[otherColumn]);
          } else {
            filterConditions.push((d: any) => d[column] > value);
          }
          break;
        case "<":
          if (otherColumn) {
            filterConditions.push((d: any) => d[column] < d[otherColumn]);
          } else {
            filterConditions.push((d: any) => d[column] < value);
          }
          break;
        case ">=":
          if (otherColumn) {
            filterConditions.push((d: any) => d[column] >= d[otherColumn]);
          } else {
            filterConditions.push((d: any) => d[column] >= value);
          }
          break;
        case "<=":
          if (otherColumn) {
            filterConditions.push((d: any) => d[column] <= d[otherColumn]);
          } else {
            filterConditions.push((d: any) => d[column] <= value);
          }
          break;
        case "contains":
          if (typeof value === "string") {
            filterConditions.push((d: any) =>
              String(d[column] ?? "").toLowerCase().includes(value.toLowerCase())
            );
          }
          break;
        case "startsWith":
          if (typeof value === "string") {
            filterConditions.push((d: any) =>
              String(d[column] ?? "").toLowerCase().startsWith(value.toLowerCase())
            );
          }
          break;
        case "endsWith":
          if (typeof value === "string") {
            filterConditions.push((d: any) =>
              String(d[column] ?? "").toLowerCase().endsWith(value.toLowerCase())
            );
          }
          break;
        case "in":
          if (Array.isArray(value)) {
            filterConditions.push((d: any) => value.includes(d[column]));
          }
          break;
      }
    }

    if (filterConditions.length === 0) return inputTable;
    const combinedFilter = (d: any) => filterConditions.every(fn => fn(d));
    return inputTable.filter(combinedFilter);
  }, [filters]);

  const applySort = useCallback((inputTable: ColumnTable): ColumnTable => {
    if (sortBy.length === 0) return inputTable;
    const sortKeys = sortBy.map(s => s.desc ? aqDesc(s.column) : s.column);
    return inputTable.orderby(...sortKeys);
  }, [sortBy]);

  const applyGroupBy = useCallback((inputTable: ColumnTable): { table: ColumnTable; groups: GroupInfo[] } => {
    if (groupBy.length === 0) {
      return { table: inputTable, groups: [] };
    }

    const groups: GroupInfo[] = [];
    const groupColumn = groupBy[0];
    const values = inputTable.objects().map((o: any) => o[groupColumn]);
    const uniqueValues = [...new Set(values)];
    let currentRow = 0;

    for (const value of uniqueValues) {
      const groupRows = inputTable.filter((d: any) => d[groupColumn] === value);
      const rowCount = groupRows.numRows();
      const isCollapsed = groupStates.get(String(value)) ?? false;

      groups.push({
        headerIndex: currentRow,
        isCollapsed,
        key: String(value),
        rowCount,
        subGroups: groupBy.length > 1 ? [] : []
      });

      currentRow += rowCount + 1;
    }

    return { table: inputTable, groups };
  }, [groupBy, groupStates]);



  const view = useMemo(() => {
    let v = baseTable;

    v = applyEdits(v);
    v = applyFilters(v);
    v = applySort(v);

    return v;
  }, [baseTable, applyEdits, applyFilters, applySort]);

  const displayView = useMemo(() => {
    return applyGroupBy(view);
  }, [view, applyGroupBy]);

  const columnKinds = useMemo(() => {
    const kinds: Record<string, "text" | "number" | "uri" | "image" | "boolean" | "markdown" | "bubble" | "drilldown" | "rowid"> = {};
    const sampleObj = baseTable.object(0) as any;

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
      const column = baseTable.columnNames()[col];
      if (!column) {
        return toGridCell(null);
      }

      const value = view.get(column, row);
      const kind = columnKinds[column] || "text";

      return toGridCell(value, kind);
    },
    [view, columnKinds]
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

      const filtTab = viewWRows.filter(escape((d: any) => d.__disp_row == row + 1))

      const rowId = filtTab.get("__row_id", 0)



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
        oldVal: oldEdit
      }]);
      setRedoStack([]);

      // onCellChange?.(column, row, oldValue, newValue);

    },
    [view, isColumnEditable, onCellChange]
  );

  const columnNames = baseTable.columnNames().filter(n => n !== "__row_id");
  const rows = useMemo(() => {
    const { groups } = displayView;
    const baseRows = displayView.table.numRows();
    return baseRows + groups.length;
  }, [displayView]);

  const groups = useMemo((): RowGroupingOptions | undefined => {
    if (groupBy.length === 0) return undefined;

    const groupInfo = displayView.groups;
    if (groupInfo.length === 0) return undefined;

    return {
      groups: groupInfo as readonly RowGroup[],
      height: 32,
    };
  }, [displayView, groupBy]);

  useRowGrouping(groups, rows);

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
      const thisRedoVal = staged.get(latestUndo.col)?.get(latestUndo.row)
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

  const toggleGroup = useCallback((key: string) => {
    setGroupStates(prev => {
      const next = new Map(prev);
      next.set(key, !next.get(key));
      return next;
    });
  }, []);

  return {
    columns: columnNames.map((name) => ({
      id: name,
      title: name,
      width: 100,
    })) as GridColumn[],
    getCellContent,
    onCellEdited,
    rows,
    groups: groups?.groups,
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
    toggleGroup,
  };
}
