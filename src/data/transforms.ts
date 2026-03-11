import type { ColumnTable } from "arquero";
import { from, desc as aqDesc, escape } from "arquero";
import { AGG_DELIMITER, type FilterSpec, type SortSpec, type CellChange, type RowData } from "../types";

export function applyEdits(
  inputTable: ColumnTable,
  staged: Map<string, Map<number, CellChange>>,
  selectColumns: string[]
): ColumnTable {
  if (staged.size === 0) return inputTable;

  let joined = inputTable;
  for (const [col, innerMap] of staged) {
    if (innerMap.size == 0) continue;

    const objs = Array.from(innerMap, ([row, val]) => ({ [col]: val, __row_id: row }));
    let editsTable = from(objs);

    editsTable = editsTable.rename({ [col]: `${col}${AGG_DELIMITER}edited` });

    joined = joined.join_left(editsTable, "__row_id");
    joined = joined.derive({ [col]: escape((d: RowData) => d[`${col}${AGG_DELIMITER}edited`] ?? d[col]) });
  }

  return joined.select(selectColumns);
}

export function applyFilters(
  inputTable: ColumnTable,
  filters: FilterSpec[]
): ColumnTable {
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
      case "between":
        if (value != null && filter.value2 != null) {
          const lo = value as number;
          const hi = filter.value2;
          filterConditions.push((d: RowData) => (d[column] as number) >= lo && (d[column] as number) <= hi);
        }
        break;
      case "isNull":
        filterConditions.push((d: RowData) => d[column] == null);
        break;
      case "isNotNull":
        filterConditions.push((d: RowData) => d[column] != null);
        break;
      case "contains":
        if (typeof value === "string") {
          filterConditions.push((d: RowData) =>
            String(d[column] ?? "").toLowerCase().includes(value.toLowerCase())
          );
        }
        break;
      case "notContains":
        if (typeof value === "string") {
          filterConditions.push((d: RowData) =>
            !String(d[column] ?? "").toLowerCase().includes(value.toLowerCase())
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
      case "regex":
        if (typeof value === "string") {
          try {
            const re = new RegExp(value, "i");
            filterConditions.push((d: RowData) => re.test(String(d[column] ?? "")));
          } catch {
            // invalid regex — skip
          }
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
  const combinedFilter = escape((d: RowData) => filterConditions.every(fn => fn(d)));
  return inputTable.filter(combinedFilter);
}

export function applySort(
  inputTable: ColumnTable,
  sortBy: SortSpec[]
): ColumnTable {
  if (sortBy.length === 0) return inputTable;
  const sortKeys = sortBy.map((s) => (
    s.desc ? aqDesc(s.column) : s.column
  ));
  return inputTable.orderby(sortKeys);
}
