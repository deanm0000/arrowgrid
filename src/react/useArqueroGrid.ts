import { useState, useMemo, useCallback, useEffect } from "react";
import type { GridColumn, GridCell, Item, EditableGridCell, RowGroup, RowGroupingOptions } from "@glideapps/glide-data-grid";
import { useRowGrouping } from "@glideapps/glide-data-grid";
import { ArqueroGrid } from "../ArqueroGrid";
import { toGridCell, getCellKind } from "../convert/toGridCell";
import { fromGridCell } from "../convert/fromGridCell";
import type { SortSpec, FilterSpec, UseArqueroGridResult } from "../types";

export interface UseArqueroGridProps {
  data: any[];
  columns: GridColumn[];
  groupBy?: string[];
  sortBy?: SortSpec[];
  filters?: Map<string, FilterSpec>;
  editable?: boolean;
  onCellChange?: (column: string, row: number, oldValue: any, newValue: any) => void;
}

export function useArqueroGrid(
  props: UseArqueroGridProps
): UseArqueroGridResult {
  const {
    data,
    columns,
    groupBy = [],
    sortBy = [],
    filters: initialFilters,
    editable = true,
    onCellChange,
  } = props;

  const [grid] = useState(() => new ArqueroGrid(data));
  const [filters, setFilters] = useState<Map<string, FilterSpec>>(
    initialFilters || new Map()
  );

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
    for (const [column, spec] of filters) {
      grid.setFilter(column, spec);
    }
  }, [grid, filters]);

  const columnKinds = useMemo(() => {
    const kinds: Record<string, "text" | "number" | "uri" | "image" | "boolean" | "markdown" | "bubble" | "drilldown" | "rowid"> = {};
    if (data.length > 0) {
      const sample = data[0];
      for (const col of columns) {
        const colId = col.id || String(col.title);
        const sampleValue = sample[colId];
        kinds[colId] = getCellKind(colId, sampleValue);
      }
    }
    return kinds;
  }, [data, columns]);

  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      const [col, row] = cell;
      const column = columns[col];
      if (!column) {
        return toGridCell(null);
      }

      const columnId = column.id || String(column.title);
      const value = grid.getCell(columnId, row);
      const kind = columnKinds[columnId] || "text";

      return toGridCell(value, kind);
    },
    [columns, grid, columnKinds]
  );

  const onCellEdited = useCallback(
    (cell: Item, newCell: EditableGridCell): void => {
      if (!editable) return;

      const [col, row] = cell;
      const column = columns[col];
      if (!column) return;

      const columnId = column.id || String(column.title);
      const newValue = fromGridCell(newCell);
      const oldValue = grid.getCell(columnId, row);

      if (newValue !== oldValue) {
        grid.setCell(columnId, row, newValue);
        onCellChange?.(columnId, row, oldValue, newValue);
      }
    },
    [columns, grid, editable, onCellChange]
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

  const { mapper, updateRowGroupingByPath, getRowGroupingForPath } = useRowGrouping(groups, rows);

  const setFilter = useCallback(
    (column: string, spec: FilterSpec | undefined) => {
      setFilters((prev) => {
        const next = new Map(prev);
        if (spec) {
          next.set(column, spec);
        } else {
          next.delete(column);
        }
        return next;
      });
    },
    []
  );

  const clearFilters = useCallback(() => {
    setFilters(new Map());
    grid.clearFilters();
  }, [grid]);

  const commit = useCallback(() => {
    grid.commit();
  }, [grid]);

  const rollback = useCallback(() => {
    grid.rollback();
  }, [grid]);

  const undo = useCallback(() => {
    grid.undo();
  }, [grid]);

  const redo = useCallback(() => {
    return grid.redo();
  }, [grid]);

  return {
    columns,
    getCellContent,
    onCellEdited,
    rows,
    groups: groups?.groups,
    filters,
    setFilter,
    stagedCount: grid.stagedCount,
    commit,
    rollback,
    undo,
    redo,
    canUndo: grid.canUndo,
    canRedo: grid.canRedo,
    clearFilters,
  };
}
