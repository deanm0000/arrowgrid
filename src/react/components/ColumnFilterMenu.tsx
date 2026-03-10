import React from "react";
import type { FilterSpec } from "../../types";
import { ValueFilter } from "./ValueFilter";
import { TextFilter } from "./TextFilter";
import { NumberFilter } from "./NumberFilter";

type ScalarValue = string | number | boolean | Date | null;
type ColumnType = "number" | "string" | "other";

interface ColumnFilterMenuProps {
  columnId: string;
  columnType: ColumnType;
  allValues: ScalarValue[];
  visibleValues: ScalarValue[];
  distinctValueThreshold: number;
  filtersForColumn: FilterSpec[];
  onChangeFilters: (newFilters: FilterSpec[]) => void;
}

export function ColumnFilterMenu({
  columnId,
  columnType,
  allValues,
  visibleValues,
  distinctValueThreshold,
  filtersForColumn,
  onChangeFilters,
}: ColumnFilterMenuProps) {
  const showValueList = allValues.length <= distinctValueThreshold;

  const valueFilter = filtersForColumn.find(f => f.op === "in");
  const typeFilter = filtersForColumn.find(f => f.op !== "in");

  const setValueFilter = (filter: FilterSpec | null) => {
    const withoutValue = filtersForColumn.filter(f => f.op !== "in");
    onChangeFilters(filter ? [...withoutValue, filter] : withoutValue);
  };

  const setTypeFilter = (filter: FilterSpec | null) => {
    const withoutType = filtersForColumn.filter(f => f.op === "in");
    onChangeFilters(filter ? [...withoutType, filter] : withoutType);
  };

  return (
    <div style={{ minWidth: 220 }}>
      {showValueList && (
        <>
          <ValueFilter
            columnId={columnId}
            allValues={allValues}
            visibleValues={visibleValues}
            activeFilter={valueFilter}
            onChange={setValueFilter}
          />
          {(columnType === "string" || columnType === "number") && (
            <div style={{ height: 1, background: "#eee", margin: "4px 0" }} />
          )}
        </>
      )}
      {columnType === "string" && (
        <TextFilter
          columnId={columnId}
          activeFilter={typeFilter}
          onChange={setTypeFilter}
        />
      )}
      {columnType === "number" && (
        <NumberFilter
          columnId={columnId}
          activeFilter={typeFilter}
          onChange={setTypeFilter}
        />
      )}
    </div>
  );
}
