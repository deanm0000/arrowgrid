import { useState, useMemo, useCallback, useEffect } from "react";
import type { Table } from "arquero";
import { table, op, desc as aqDesc } from "arquero";
import type { GridColumn, GridCell, Item, EditableGridCell, RowGroup, RowGroupingOptions } from "@glideapps/glide-data-grid";
import { useRowGrouping } from "@glideapps/glide-data-grid";
import { toGridCell, getCellKind } from "../convert/toGridCell";
import { fromGridCell } from "../convert/fromGridCell";
import type { SortSpec, FilterSpec, CellChange, UseArqueroGridResult, UseArqueroGridProps } from "../types";

type ArqueroTable = ReturnType<typeof table> & {
  filter(criteria: any): ArqueroTable;
  orderby(...keys: any[]): ArqueroTable;
  groupby(...keys: string[]): any;
  rollup(values: Record<string, any>): ArqueroTable;
  derive(values: Record<string, any>): ArqueroTable;
  column(name: string): any;
  numRows(): number;
  objects(): any[];
  object(row: number): any;
};

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

  const [tableData, setTableData] = useState<ArqueroTable>(() => data as ArqueroTable);
  const [filters, setFilters] = useState<FilterSpec[]>(() => initialFilters);
  const [staged, setStaged] = useState<Map<string, Map<number, any>>>(new Map());
  const [undoStack, setUndoStack] = useState<CellChange[]>([]);
  const [redoStack, setRedoStack] = useState<CellChange[]>([]);
  const [groupStates, setGroupStates] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    setTableData(data as ArqueroTable);
    setStaged(new Map());
    setUndoStack([]);
    setRedoStack([]);
  }, [data]);

  useEffect(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  const applyEdits = useCallback((inputTable: ArqueroTable): ArqueroTable => {
    if (staged.size === 0) return inputTable;

    const derives: Record<string, (d: any) => any> = {};

    for (const [column, rowMap] of staged) {
      derives[column] = (d: any) => {
        const edited = rowMap.get(d.__row_id);
        return edited !== undefined ? edited : d[column];
      };
    }

    if (Object.keys(derives).length === 0) return inputTable;
    return inputTable.derive(derives) as ArqueroTable;
  }, [staged]);

  const applyFilters = useCallback((inputTable: ArqueroTable): ArqueroTable => {
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

  const applySort = useCallback((inputTable: ArqueroTable): ArqueroTable => {
    if (sortBy.length === 0) return inputTable;
    const sortKeys = sortBy.map(s => s.desc ? aqDesc(s.column) : s.column);
    return inputTable.orderby(...sortKeys);
  }, [sortBy]);

  const applyGroupBy = useCallback((inputTable: ArqueroTable): { table: ArqueroTable; groups: GroupInfo[] } => {
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

  const baseTable = useMemo(() => {
    return tableData.derive({
      __row_id: op.row_number() - 1,
    }) as ArqueroTable;
  }, [tableData]);

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
    const columnNames = tableData.columnNames();
    const sampleObj = tableData.object(0) as any;
    
    if (sampleObj) {
      for (const colName of columnNames) {
        const sampleValue = sampleObj[colName];
        kinds[colName] = getCellKind(colName, sampleValue);
      }
    }
    return kinds;
  }, [tableData]);

  const adjustRowForGroups = useCallback((row: number, groups: GroupInfo[]): number => {
    if (groups.length === 0) return row;
    let offset = 0;
    for (const group of groups) {
      if (row < group.headerIndex) break;
      offset += 1;
      if (group.isCollapsed) {
        offset += group.rowCount;
      }
    }
    return row - offset;
  }, []);

  const getCell = useCallback((column: string, row: number): any => {
    const { table: displayTable, groups } = displayView;
    
    for (const group of groups) {
      if (row === group.headerIndex) {
        return undefined;
      }
      if (group.isCollapsed) {
        if (row < group.headerIndex) break;
        if (row <= group.headerIndex + group.rowCount) {
          return undefined;
        }
      }
    }

    const adjustedRow = adjustRowForGroups(row, groups);
    if (adjustedRow < 0) return undefined;
    
    const obj = displayTable.object(adjustedRow) as any;
    if (obj && column in obj) {
      return obj[column];
    }
    return undefined;
  }, [displayView, adjustRowForGroups]);

  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      const [col, row] = cell;
      const column = tableData.columnNames()[col];
      if (!column) {
        return toGridCell(null);
      }

      const value = getCell(column, row);
      const kind = columnKinds[column] || "text";

      return toGridCell(value, kind);
    },
    [tableData, getCell, columnKinds]
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
      const column = tableData.columnNames()[col];
      if (!column) return;

      if (!isColumnEditable(column)) return;

      const newValue = fromGridCell(newCell);
      const oldValue = getCell(column, row);

      if (newValue !== oldValue) {
        const { table: displayTable, groups } = displayView;
        const adjustedRow = adjustRowForGroups(row, groups);
        const obj = displayTable.object(adjustedRow) as any;
        const rowId = obj?.__row_id;
        if (rowId === undefined) return;

        setStaged(prev => {
          const next = new Map(prev);
          let columnMap = next.get(column);
          if (!columnMap) {
            columnMap = new Map();
            next.set(column, columnMap);
          }
          columnMap.set(rowId, newValue);
          return next;
        });

        setUndoStack(prev => [...prev, {
          type: "cell",
          column,
          row: rowId,
          oldValue,
          newValue
        }]);
        setRedoStack([]);
        
        onCellChange?.(column, row, oldValue, newValue);
      }
    },
    [tableData, getCell, isColumnEditable, onCellChange]
  );

  const columnNames = tableData.columnNames().filter(n => n !== "__row_id");
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
    setStaged(new Map());
    onDataChange?.(tableData);
  }, [tableData, onDataChange]);

  const rollback = useCallback(() => {
    setStaged(new Map());
  }, []);

  const undo = useCallback(() => {
    const change = undoStack[undoStack.length - 1];
    if (!change) return;

    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, change]);
    
    setStaged(prev => {
      const next = new Map(prev);
      const columnMap = next.get(change.column);
      if (columnMap) {
        columnMap.delete(change.row);
        if (columnMap.size === 0) {
          next.delete(change.column);
        }
      }
      return next;
    });
  }, [undoStack]);

  const redo = useCallback(() => {
    const change = redoStack[redoStack.length - 1];
    if (!change) return false;

    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, change]);
    
    setStaged(prev => {
      const next = new Map(prev);
      let columnMap = next.get(change.column);
      if (!columnMap) {
        columnMap = new Map();
        next.set(change.column, columnMap);
      }
      columnMap.set(change.row, change.newValue);
      return next;
    });
    return true;
  }, [redoStack]);

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
    stagedCount: staged.size,
    commit,
    rollback,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    toggleGroup,
  };
}
