import type { ColumnTable } from "arquero";

export const AGG_DELIMITER = "ARROWGRIDDELIMITERYOUSHOULDNTSEETHIS";

export type RowData = Record<string, string | number | boolean | Date | null>;

export interface SortSpec {
  column: string;
  desc?: boolean;
}

export interface AggregateSpec {
  op: "sum" | "mean" | "avg" | "count" | "min" | "max" | "median" | "weightedAvg" | "custom";
  column?: string;
  weightColumn?: string;
  fn?: (values: (string | number | boolean | Date | null)[]) => string | number | boolean | Date | null;
  as?: string;
}

export type FilterOp =
  | "=="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "between"
  | "isNull"
  | "isNotNull"
  | "contains"
  | "notContains"
  | "startsWith"
  | "endsWith"
  | "regex"
  | "in";

export interface FilterSpec {
  column?: string;
  op?: FilterOp;
  value?: string | number | boolean | Date | null | (string | number | boolean | Date | null)[];
  value2?: number | null;
  otherColumn?: string;
  expr?: (d: RowData) => boolean;
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

export type NumberFormat =
  | { type: "general" }
  | { type: "decimal"; decimals: number }
  | { type: "currency"; decimals: number }
  | { type: "accounting"; decimals: number }
  | { type: "percentage" }
  | { type: "scientific" };

export type DateFormat = "iso" | "mm-dd-yyyy" | "mmm-dd-yyyy" | "mm-dd-yyyy-hh-mm";

export type BooleanFormat = "checkbox" | "words";

export type ColumnFormat =
  | { kind: "number"; format: NumberFormat }
  | { kind: "date"; format: DateFormat }
  | { kind: "boolean"; format: BooleanFormat };

export interface UseArqueroGridProps {
  data: ColumnTable;
  groupBy?: string[];
  sortBy?: SortSpec[];
  filters?: FilterSpec[];
  aggregates?: Record<string, string[]>;
  editable?: boolean | Record<string, boolean>;
  distinctValueThreshold?: number;
  columnFormats?: Record<string, ColumnFormat>;
  onColumnFormatsChange?: (formats: Record<string, ColumnFormat>) => void;
  testCopyMode?: boolean;
  onCellChange?: (column: string, row: number, oldValue: string | number | boolean | Date | null, newValue: string | number | boolean | Date | null) => void;
  onDataChange?: (newTable: ColumnTable) => void;
  backgroundColor?: string | [string, string];
  roundingRadius?: number;
  width?: number;
  height?: number;
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
  uniqueValues?: (string | number | boolean | Date | null)[];
}

export interface GroupHeaderProps {
  groupKey: string;
  groupColumn: string;
  isCollapsed: boolean;
  rowCount: number;
  onToggle: (groupKey: string) => void;
}
