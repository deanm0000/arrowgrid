/* eslint-disable @typescript-eslint/no-explicit-any */
import { table, op, desc as aqDesc } from "arquero";
import type { Table } from "arquero";
import type { SortSpec, AggregateSpec, FilterSpec, CellChange } from "./types";

interface GroupInfo {
  headerIndex: number;
  isCollapsed: boolean;
  key: string;
  rowCount: number;
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
  reify(): ArqueroTable;
};

export class ArqueroGrid {
  private _table: ArqueroTable;
  private staged: Map<string, any>;
  private undoStack: CellChange[];
  private redoStack: CellChange[];
  private _groupBy: string[];
  private _sortBy: SortSpec[];
  private _filters: FilterSpec[];
  private _aggregates: Record<string, AggregateSpec>;
  private _groupStates: Map<string, boolean>;

  constructor(data: Table) {
    this._table = data as ArqueroTable;
    this.staged = new Map();
    this.undoStack = [];
    this.redoStack = [];
    this._groupBy = [];
    this._sortBy = [];
    this._filters = [];
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

  get filters(): FilterSpec[] {
    return [...this._filters];
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

  private applyEdits(inputTable: ArqueroTable): ArqueroTable {
    if (this.staged.size === 0) return inputTable;

    const edits: Record<string, Record<number, any>> = {};
    
    for (const [key, value] of this.staged) {
      const [column, rowStr] = key.split(":");
      const row = parseInt(rowStr, 10);
      if (!edits[column]) {
        edits[column] = {};
      }
      edits[column][row] = value;
    }

    const colUpdates: Record<string, any[]> = {};
    const numRows = inputTable.numRows();

    for (const [column, rowEdits] of Object.entries(edits)) {
      const currentCol = inputTable.column(column) as any;
      const newValues = [...currentCol];

      for (const [rowStr, newValue] of Object.entries(rowEdits)) {
        const row = parseInt(rowStr, 10);
        if (!isNaN(row) && row >= 0 && row < newValues.length) {
          newValues[row] = newValue;
        }
      }
      colUpdates[column] = newValues;
    }

    return inputTable.derive(colUpdates) as ArqueroTable;
  }

  private applyFilters(inputTable: ArqueroTable): ArqueroTable {
    if (this._filters.length === 0) return inputTable;

    const filterConditions: ((d: any) => boolean)[] = [];

    for (const filter of this._filters) {
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
  }

  private applySort(inputTable: ArqueroTable): ArqueroTable {
    if (this._sortBy.length === 0) return inputTable;

    const sortKeys = this._sortBy.map(s => {
      return s.desc ? aqDesc(s.column) : s.column;
    });
    return inputTable.orderby(...sortKeys);
  }

  private applyGroupBy(inputTable: ArqueroTable): { table: ArqueroTable; groups: GroupInfo[] } {
    if (this._groupBy.length === 0) {
      return { table: inputTable, groups: [] };
    }

    const groups: GroupInfo[] = [];
    const groupColumn = this._groupBy[0];
    const values = inputTable.objects().map((o: any) => o[groupColumn]);
    const uniqueValues = [...new Set(values)];
    let currentRow = 0;

    for (const value of uniqueValues) {
      const groupRows = inputTable.filter((d: any) => d[groupColumn] === value);
      const rowCount = groupRows.numRows();
      const isCollapsed = this._groupStates.get(String(value)) ?? false;

      groups.push({
        headerIndex: currentRow,
        isCollapsed,
        key: String(value),
        rowCount,
        subGroups: this._groupBy.length > 1 ? [] : []
      });

      currentRow += rowCount + 1;
    }

    return { table: inputTable, groups };
  }

  getView(): ArqueroTable {
    let view = this._table;
    view = this.applyEdits(view);
    view = this.applyFilters(view);
    view = this.applySort(view);
    return view;
  }

  getDisplayView(): { table: ArqueroTable; groups: GroupInfo[] } {
    let view = this.getView();
    return this.applyGroupBy(view);
  }

  private getStagedKey(column: string, row: number): string {
    return `${column}:${row}`;
  }

  getCell(column: string, row: number): any {
    const key = this.getStagedKey(column, row);
    if (this.staged.has(key)) {
      return this.staged.get(key);
    }

    const { table: view, groups } = this.getDisplayView();
    
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

    const adjustedRow = this.adjustRowForGroups(row, groups);
    if (adjustedRow < 0) return undefined;
    
    const obj = view.object(adjustedRow) as any;
    if (obj && column in obj) {
      return obj[column];
    }
    return undefined;
  }

  private adjustRowForGroups(row: number, groups: GroupInfo[]): number {
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
  }

  setCell(column: string, row: number, newValue: any): void {
    const { table: view, groups } = this.getDisplayView();
    const adjustedRow = this.adjustRowForGroups(row, groups);
    
    if (adjustedRow < 0) return;
    
    const obj = view.object(adjustedRow) as any;
    const oldValue = obj ? obj[column] : undefined;

    if (oldValue === newValue) {
      const key = this.getStagedKey(column, adjustedRow);
      this.staged.delete(key);
      return;
    }

    const key = this.getStagedKey(column, adjustedRow);
    this.staged.set(key, newValue);

    const change: CellChange = {
      type: "cell",
      column,
      row: adjustedRow,
      oldValue,
      newValue
    };
    this.undoStack.push(change);
    this.redoStack = [];
  }

  setData(data: Table): void {
    this._table = data as ArqueroTable;
    this.staged.clear();
    this.undoStack = [];
    this.redoStack = [];
  }

  commit(): ArqueroTable {
    if (this.staged.size === 0) return this._table;

    const edits: Record<string, Record<number, any>> = {};
    
    for (const [key, value] of this.staged) {
      const [column, rowStr] = key.split(":");
      const row = parseInt(rowStr, 10);
      if (!edits[column]) {
        edits[column] = {};
      }
      edits[column][row] = value;
    }

    const colUpdates: Record<string, any[]> = {};
    const numRows = this._table.numRows();

    for (const [column, rowEdits] of Object.entries(edits)) {
      const currentCol = this._table.column(column) as any;
      const newValues = [...currentCol];

      for (const [rowStr, newValue] of Object.entries(rowEdits)) {
        const row = parseInt(rowStr, 10);
        if (!isNaN(row) && row >= 0 && row < newValues.length) {
          newValues[row] = newValue;
        }
      }
      colUpdates[column] = newValues;
    }

    this._table = this._table.derive(colUpdates) as ArqueroTable;
    this.staged.clear();
    
    return this._table;
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

  setFilters(filters: FilterSpec[]): void {
    this._filters = filters;
  }

  addFilter(filter: FilterSpec): void {
    this._filters.push(filter);
  }

  removeFilter(index: number): void {
    this._filters.splice(index, 1);
  }

  clearFilters(): void {
    this._filters = [];
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
    const { groups } = this.getDisplayView();
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
        case "weightedAvg":
          if (spec.weightColumn) {
            aggObj[asName] = (d: any) => op.sum(d[colName] * d[spec.weightColumn!]) / op.sum(d[spec.weightColumn!]);
          }
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
    return this._table.columnNames();
  }

  getRowCount(): number {
    const { table: view, groups } = this.getDisplayView();
    const baseRows = view.numRows();
    return baseRows + groups.length;
  }

  isColumnEditable(columnId: string, editable: boolean | Record<string, boolean> | undefined): boolean {
    if (this._groupBy.length > 0) return false;
    if (editable === undefined || editable === false) return false;
    if (typeof editable === "boolean") return editable;
    if (typeof editable === "object") {
      return editable[columnId] ?? false;
    }
    return false;
  }
}
