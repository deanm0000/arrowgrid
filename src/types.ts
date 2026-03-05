import type { GridColumn } from "@glideapps/glide-data-grid";

export interface SortSpec {
  column: string;
  desc?: boolean;
}

export interface AggregateSpec {
  op: "sum" | "mean" | "avg" | "count" | "min" | "max" | "median" | "custom";
  column?: string;
  fn?: (values: any[]) => any;
  as?: string;
}

export interface FilterSpec {
  type: "equals" | "contains" | "gt" | "gte" | "lt" | "lte" | "in" | "custom";
  value?: any;
  values?: any[];
  predicate?: (value: any) => boolean;
}

export interface CellChange {
  type: "cell";
  column: string;
  row: number;
  oldValue: any;
  newValue: any;
}

export interface BulkChange {
  type: "bulk";
  changes: CellChange[];
}

export type Change = CellChange | BulkChange;

export interface GridConfig {
  data: any[];
  columns: GridColumn[];
  groupBy?: string[];
  sortBy?: SortSpec[];
  aggregates?: Record<string, AggregateSpec>;
  editable?: boolean;
}

export interface UseArqueroGridResult {
  columns: GridColumn[];
  getCellContent: (cell: [number, number]) => any;
  onCellEdited: (cell: [number, number], newValue: any) => void;
  rows: number;
  groups?: readonly (number | { readonly headerIndex: number; readonly isCollapsed: boolean; readonly subGroups?: readonly any[] })[];
  filters: Map<string, FilterSpec>;
  setFilter: (column: string, spec: FilterSpec | undefined) => void;
  stagedCount: number;
  commit: () => void;
  rollback: () => void;
  undo: () => void;
  redo: () => boolean;
  canUndo: boolean;
  canRedo: boolean;
  clearFilters: () => void;
}
