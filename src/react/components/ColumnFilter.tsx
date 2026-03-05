import React, { useState, useCallback } from "react";
import type { FilterSpec } from "../../types";

export interface ColumnFilterProps {
  columnId: string;
  currentFilter?: FilterSpec;
  onFilterChange: (column: string, spec: FilterSpec | undefined) => void;
  uniqueValues?: any[];
}

export function ColumnFilter({
  columnId,
  currentFilter,
  onFilterChange,
  uniqueValues = [],
}: ColumnFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterType, setFilterType] = useState<FilterSpec["type"]>(
    currentFilter?.type || "equals"
  );
  const [filterValue, setFilterValue] = useState<any>(
    currentFilter?.value ?? ""
  );

  const handleApply = useCallback(() => {
    if (filterType === "equals" && filterValue === "") {
      onFilterChange(columnId, undefined);
    } else {
      onFilterChange(columnId, {
        type: filterType,
        value: filterValue,
      });
    }
    setIsOpen(false);
  }, [columnId, filterType, filterValue, onFilterChange]);

  const handleClear = useCallback(() => {
    setFilterValue("");
    onFilterChange(columnId, undefined);
    setIsOpen(false);
  }, [columnId, onFilterChange]);

  return (
    <div className="column-filter">
      <button
        className="filter-toggle"
        onClick={() => setIsOpen(!isOpen)}
        title="Filter"
      >
        {currentFilter ? "▾" : "▸"}
      </button>

      {isOpen && (
        <div className="filter-dropdown">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as FilterSpec["type"])}
          >
            <option value="equals">Equals</option>
            <option value="contains">Contains</option>
            <option value="gt">Greater than</option>
            <option value="gte">Greater or equal</option>
            <option value="lt">Less than</option>
            <option value="lte">Less or equal</option>
            {uniqueValues.length > 0 && <option value="in">In list</option>}
          </select>

          {filterType === "in" ? (
            <select
              multiple
              value={Array.isArray(filterValue) ? filterValue : []}
              onChange={(e) =>
                setFilterValue(
                  Array.from(e.target.selectedOptions, (opt) => opt.value)
                )
              }
            >
              {uniqueValues.map((val) => (
                <option key={String(val)} value={String(val)}>
                  {String(val)}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={typeof filterValue === "number" ? "number" : "text"}
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              placeholder="Filter value..."
            />
          )}

          <div className="filter-actions">
            <button onClick={handleClear}>Clear</button>
            <button onClick={handleApply}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}
