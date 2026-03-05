/* eslint-disable @typescript-eslint/no-explicit-any */
import { table, op, desc as aqDesc } from "arquero";
import type { SortSpec, AggregateSpec, FilterSpec, CellChange } from "./types";

interface GroupInfo {
  headerIndex: number;
  isCollapsed: boolean;
  key: string;
  subGroups: GroupInfo[] | undefined;
}

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

export class ArqueroGrid {
  private _table: ArqueroTable;
  private staged: Map<string, any>;
  private undoStack: CellChange[];
  private redoStack: CellChange[];
  private _groupBy: string[];
  private _sortBy: SortSpec[];
  private _filters: Map<string, FilterSpec>;
  private _aggregates: Record<string, AggregateSpec>;
  private _groupStates: Map<string, boolean>;
  private columnNames: string[];

  constructor(data: any[] = []) {
    this._table = table(data) as ArqueroTable;
    this.columnNames = this._table.columnNames();
    this.staged = new Map();
    this.undoStack = [];
    this.redoStack = [];
    this._groupBy = [];
    this._sortBy = [];
    this._filters = new Map();
    this._aggregates = {};
    this._groupStates = new Map();
  }

  get table(): ArqueroTable {
    return this._table;
  }

  get groupBy(): string[] {
    return [...this._groupBy];
  }

  get sortBy(): SortSpec[] {
    return [...this._sortBy];
  }

  get filters(): Map<string, FilterSpec> {
    return new Map(this._filters);
  }

  get aggregates(): Record<string, AggregateSpec> {
    return { ...this._aggregates };
  }

  get stagedCount(): number {
    return this.staged.size;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  private applyFilters(inputTable: ArqueroTable): ArqueroTable {
    if (this._filters.size === 0) return inputTable;

    const filterConditions: ((d: any) => boolean)[] = [];

    for (const [column, spec] of this._filters) {
      if (!spec) continue;

      if (spec.type === "custom" && spec.predicate) {
        filterConditions.push((d: any) => spec.predicate!(d[column]));
        continue;
      }

      switch (spec.type) {
        case "equals":
          filterConditions.push((d: any) => d[column] === spec.value);
          break;
        case "contains":
          if (typeof spec.value === "string") {
            filterConditions.push((d: any) =>
              String(d[column] ?? "").toLowerCase().includes(spec.value!.toLowerCase())
            );
          }
          break;
        case "gt":
          filterConditions.push((d: any) => d[column] > spec.value);
          break;
        case "gte":
          filterConditions.push((d: any) => d[column] >= spec.value);
          break;
        case "lt":
          filterConditions.push((d: any) => d[column] < spec.value);
          break;
        case "lte":
          filterConditions.push((d: any) => d[column] <= spec.value);
          break;
        case "in":
          if (spec.values && Array.isArray(spec.values)) {
            filterConditions.push((d: any) => spec.values!.includes(d[column]));
          }
          break;
      }
    }

    if (filterConditions.length === 0) return inputTable;

    const combinedFilter = (d: any) => filterConditions.every(fn => fn(d));
    return inputTable.filter(combinedFilter);
  }

  private applySort(inputTable: ArqueroTable): ArqueroTable {
    if (this._sortBy.length === 0) return inputTable;

    const sortKeys = this._sortBy.map(s => {
      return s.desc ? aqDesc(s.column) : s.column;
    });
    return inputTable.orderby(...sortKeys);
  }

  getView(): ArqueroTable {
    let view = this._table;
    view = this.applyFilters(view);
    view = this.applySort(view);
    return view;
  }

  private getStagedKey(column: string, row: number): string {
    return `${column}:${row}`;
  }

  getCell(column: string, row: number): any {
    const key = this.getStagedKey(column, row);
    if (this.staged.has(key)) {
      return this.staged.get(key);
    }

    const view = this.getView();
    const obj = view.object(row) as any;
    if (obj && column in obj) {
      return obj[column];
    }
    return undefined;
  }

  setCell(column: string, row: number, newValue: any): void {
    const view = this.getView();
    const obj = view.object(row) as any;
    const oldValue = obj ? obj[column] : undefined;

    if (oldValue === newValue) {
      const key = this.getStagedKey(column, row);
      this.staged.delete(key);
      return;
    }

    const key = this.getStagedKey(column, row);
    this.staged.set(key, newValue);

    const change: CellChange = {
      type: "cell",
      column,
      row,
      oldValue,
      newValue
    };
    this.undoStack.push(change);
    this.redoStack = [];
  }

  setData(data: any[]): void {
    this._table = table(data) as ArqueroTable;
    this.columnNames = this._table.columnNames();
    this.staged.clear();
    this.undoStack = [];
    this.redoStack = [];
  }

  commit(): void {
    if (this.staged.size === 0) return;

    const updates: Record<string, Record<string, any>> = {};

    for (const [key, value] of this.staged) {
      const [column] = key.split(":");
      if (!updates[column]) {
        updates[column] = {};
      }
      updates[column][key] = value;
    }

    const colUpdates: Record<string, any[]> = {};

    for (const [column, rowUpdates] of Object.entries(updates)) {
      const currentCol = this._table.column(column) as any;
      const newValues = [...currentCol];

      for (const [key, newValue] of Object.entries(rowUpdates)) {
        const [, rowStr] = key.split(":");
        const row = parseInt(rowStr, 10);
        if (!isNaN(row) && row >= 0 && row < newValues.length) {
          newValues[row] = newValue;
        }
      }
      colUpdates[column] = newValues;
    }

    this._table = this._table.derive(colUpdates) as ArqueroTable;
    this.staged.clear();
  }

  rollback(): void {
    this.staged.clear();
  }

  undo(): void {
    const change = this.undoStack.pop();
    if (!change) return;

    const key = this.getStagedKey(change.column, change.row);
    this.staged.delete(key);
    this.redoStack.push(change);
  }

  redo(): boolean {
    const change = this.redoStack.pop();
    if (!change) return false;

    const key = this.getStagedKey(change.column, change.row);
    this.staged.set(key, change.newValue);
    this.undoStack.push(change);
    return true;
  }

  setGroupBy(columns: string[]): void {
    this._groupBy = columns;
  }

  setSortBy(sortBy: SortSpec[]): void {
    this._sortBy = sortBy;
  }

  addSort(column: string, desc: boolean = false): void {
    const existing = this._sortBy.findIndex(s => s.column === column);
    if (existing >= 0) {
      this._sortBy[existing] = { column, desc };
    } else {
      this._sortBy.push({ column, desc });
    }
  }

  removeSort(column: string): void {
    this._sortBy = this._sortBy.filter(s => s.column !== column);
  }

  setFilter(column: string, spec: FilterSpec | undefined): void {
    if (spec) {
      this._filters.set(column, spec);
    } else {
      this._filters.delete(column);
    }
  }

  clearFilters(): void {
    this._filters.clear();
  }

  setAggregates(aggregates: Record<string, AggregateSpec>): void {
    this._aggregates = aggregates;
  }

  toggleGroup(key: string): void {
    const current = this._groupStates.get(key);
    this._groupStates.set(key, !current);
  }

  getGroupState(key: string): boolean {
    return this._groupStates.get(key) ?? false;
  }

  getGroupStates(): Map<string, boolean> {
    return new Map(this._groupStates);
  }

  buildGrouping(): GroupInfo[] {
    if (this._groupBy.length === 0) return [];

    const view = this.getView();
    const groups: GroupInfo[] = [];
    const column = this._groupBy[0];
    const values = view.objects().map((o: any) => o[column]);
    const uniqueValues = [...new Set(values)];
    let currentRow = 0;

    for (const value of uniqueValues) {
      const groupRows = view.filter((d: any) => d[column] === value);
      const rowCount = groupRows.numRows();

      const isCollapsed = this.getGroupState(String(value));

      groups.push({
        headerIndex: currentRow,
        isCollapsed,
        key: String(value),
        subGroups: this._groupBy.length > 1 ? [] : []
      });

      currentRow += rowCount + 1;
    }

    return groups;
  }

  getAggregatedData(): ArqueroTable | null {
    if (this._groupBy.length === 0 || Object.keys(this._aggregates).length === 0) {
      return null;
    }

    const view = this.getView();
    const aggObj: Record<string, any> = {};

    for (const [name, spec] of Object.entries(this._aggregates)) {
      const colName = spec.column || this._groupBy[0];
      const asName = spec.as || name;

      switch (spec.op) {
        case "sum":
          aggObj[asName] = (d: any) => op.sum(d[colName]);
          break;
        case "mean":
        case "avg":
          aggObj[asName] = (d: any) => op.mean(d[colName]);
          break;
        case "count":
          aggObj[asName] = op.count();
          break;
        case "min":
          aggObj[asName] = (d: any) => op.min(d[colName]);
          break;
        case "max":
          aggObj[asName] = (d: any) => op.max(d[colName]);
          break;
        case "median":
          aggObj[asName] = (d: any) => op.median(d[colName]);
          break;
        case "custom":
          if (spec.fn) {
            aggObj[asName] = (d: any) => spec.fn!(d[colName]);
          }
          break;
      }
    }

    return view.groupby(...this._groupBy).rollup(aggObj);
  }

  getColumnNames(): string[] {
    return [...this.columnNames];
  }

  getRowCount(): number {
    return this.getView().numRows();
  }
}
