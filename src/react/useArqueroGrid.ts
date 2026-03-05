import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { Table } from "arquero";
import type { GridColumn, GridCell, Item, EditableGridCell, RowGroup, RowGroupingOptions } from "@glideapps/glide-data-grid";
import { useRowGrouping } from "@glideapps/glide-data-grid";
import { ArqueroGrid } from "../ArqueroGrid";
import { toGridCell, getCellKind } from "../convert/toGridCell";
import { fromGridCell } from "../convert/fromGridCell";
import type { SortSpec, FilterSpec, UseArqueroGridResult, UseArqueroGridProps } from "../types";

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

  const gridRef = useRef<ArqueroGrid | null>(null);
  if (!gridRef.current) {
    gridRef.current = new ArqueroGrid(data);
  }
  const grid = gridRef.current;

  const [filters, setFilters] = useState<FilterSpec[]>(initialFilters);

  useEffect(() => {
    grid.setData(data);
  }, [grid, data]);

  useEffect(() => {
    grid.setGroupBy(groupBy);
  }, [grid, groupBy]);

  useEffect(() => {
    grid.setSortBy(sortBy);
  }, [grid, sortBy]);

  useEffect(() => {
    grid.setFilters(filters);
  }, [grid, filters]);

  useEffect(() => {
    grid.setAggregates(aggregates);
  }, [grid, aggregates]);

  const columnKinds = useMemo(() => {
    const kinds: Record<string, "text" | "number" | "uri" | "image" | "boolean" | "markdown" | "bubble" | "drilldown" | "rowid"> = {};
    const columnNames = grid.getColumnNames();
    const sampleObj = grid.table.object(0) as any;
    
    if (sampleObj) {
      for (const colName of columnNames) {
        const sampleValue = sampleObj[colName];
        kinds[colName] = getCellKind(colName, sampleValue);
      }
    }
    return kinds;
  }, [grid]);

  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      const [col, row] = cell;
      const column = gridRef.current?.table.columnNames()[col];
      if (!column) {
        return toGridCell(null);
      }

      const value = gridRef.current?.getCell(column, row);
      const kind = columnKinds[column] || "text";

      return toGridCell(value, kind);
    },
    [columnKinds]
  );

  const isEditable = useCallback((columnId: string): boolean => {
    if (!gridRef.current) return false;
    return gridRef.current.isColumnEditable(columnId, editable);
  }, [editable]);

  const onCellEdited = useCallback(
    (cell: Item, newCell: EditableGridCell): void => {
      const [col, row] = cell;
      const column = gridRef.current?.table.columnNames()[col];
      if (!column || !gridRef.current) return;

      if (!isEditable(column)) return;

      const newValue = fromGridCell(newCell);
      const oldValue = gridRef.current.getCell(column, row);

      if (newValue !== oldValue) {
        gridRef.current.setCell(column, row, newValue);
        onCellChange?.(column, row, oldValue, newValue);
      }
    },
    [isEditable, onCellChange]
  );

  const rows = grid.getRowCount();

  const groups = useMemo((): RowGroupingOptions | undefined => {
    if (groupBy.length === 0) return undefined;

    const groupInfo = grid.buildGrouping();
    if (groupInfo.length === 0) return undefined;

    return {
      groups: groupInfo as readonly RowGroup[],
      height: 32,
    };
  }, [grid, groupBy]);

  useRowGrouping(groups, rows);

  const setFilter = useCallback(
    (filter: FilterSpec) => {
      setFilters((prev) => [...prev, filter]);
    },
    []
  );

  const removeFilter = useCallback(
    (index: number) => {
      setFilters((prev) => prev.filter((_, i) => i !== index));
    },
    []
  );

  const clearFilters = useCallback(() => {
    setFilters([]);
    grid.clearFilters();
  }, [grid]);

  const commit = useCallback(() => {
    const newTable = grid.commit();
    onDataChange?.(newTable);
  }, [grid, onDataChange]);

  const rollback = useCallback(() => {
    grid.rollback();
  }, [grid]);

  const undo = useCallback(() => {
    grid.undo();
  }, [grid]);

  const redo = useCallback(() => {
    return grid.redo();
  }, [grid]);

  const toggleGroup = useCallback((key: string) => {
    grid.toggleGroup(key);
  }, [grid]);

  return {
    columns: grid.table.columnNames().map((name, idx) => ({
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
    stagedCount: grid.stagedCount,
    commit,
    rollback,
    undo,
    redo,
    canUndo: grid.canUndo,
    canRedo: grid.canRedo,
    toggleGroup,
  };
}
