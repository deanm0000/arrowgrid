import type { ColumnTable, Table } from "arquero";
import type { GridColumn } from "@glideapps/glide-data-grid";

export interface SortSpec {
  column: string;
  desc?: boolean;
}

export interface AggregateSpec {
  op: "sum" | "mean" | "avg" | "count" | "min" | "max" | "median" | "weightedAvg" | "custom";
  column?: string;
  weightColumn?: string;
  fn?: (values: any[]) => any;
  as?: string;
}

export interface FilterSpec {
  column?: string;
  op?: string;
  value?: any;
  otherColumn?: string;
  expr?: (d: any) => boolean;
}

export interface CellChange {
  row: number, 
  col: string
  oldVal: string | number | boolean | Date |  undefined
}

export interface BulkChange {
  type: "bulk";
  changes: CellChange[];
}

export type Change = CellChange | BulkChange;

export interface UseArqueroGridProps {
  data: ColumnTable;
  groupBy?: string[];
  sortBy?: SortSpec[];
  filters?: FilterSpec[];
  aggregates?: Record<string, AggregateSpec>;
  editable?: boolean | Record<string, boolean>;
  onCellChange?: (column: string, row: number, oldValue: any, newValue: any) => void;
  onDataChange?: (newTable: ColumnTable) => void;
}

export interface UseArqueroGridResult {
  columns: GridColumn[];
  getCellContent: (cell: readonly [number, number]) => any;
  onCellEdited: (cell: readonly [number, number], newValue: any) => void;
  rows: number;
  groups?: readonly (number | { readonly headerIndex: number; readonly isCollapsed: boolean; readonly subGroups?: readonly any[] })[];
  filters: FilterSpec[];
  setFilter: (filter: FilterSpec) => void;
  removeFilter: (index: number) => void;
  clearFilters: () => void;
  stagedCount: number;
  commit: () => void;
  rollback: () => void;
  undo: () => void;
  redo: () => boolean;
  canUndo: boolean;
  canRedo: boolean;
  toggleGroup: (key: string) => void;
}

export interface UseColumnFiltersProps {
  initialFilters?: FilterSpec[];
  onFilterChange?: (filters: FilterSpec[]) => void;
}

export interface ColumnFilterProps {
  columnId: string;
  currentFilter?: FilterSpec;
  onFilterAdd: (filter: FilterSpec) => void;
  onFilterRemove: () => void;
  uniqueValues?: any[];
}

export interface GroupHeaderProps {
  groupKey: string;
  groupColumn: string;
  isCollapsed: boolean;
  rowCount: number;
  onToggle: (groupKey: string) => void;
}
