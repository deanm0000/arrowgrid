import React, { useState, useCallback } from "react";
import type { FilterSpec } from "../../types";

export interface ColumnFilterProps {
  columnId: string;
  currentFilter?: FilterSpec;
  onFilterAdd: (filter: FilterSpec) => void;
  onFilterRemove: () => void;
  uniqueValues?: any[];
}

export function ColumnFilter({
  columnId,
  currentFilter,
  onFilterAdd,
  onFilterRemove,
  uniqueValues = [],
}: ColumnFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterOp, setFilterOp] = useState<string>(
    currentFilter?.op || "=="
  );
  const [filterValue, setFilterValue] = useState<any>(
    currentFilter?.value ?? ""
  );

  const handleApply = useCallback(() => {
    if (filterOp === "==" && filterValue === "") {
      onFilterRemove();
    } else {
      onFilterAdd({
        column: columnId,
        op: filterOp,
        value: filterValue,
      });
    }
    setIsOpen(false);
  }, [columnId, filterOp, filterValue, onFilterAdd, onFilterRemove]);

  const handleClear = useCallback(() => {
    setFilterValue("");
    onFilterRemove();
    setIsOpen(false);
  }, [onFilterRemove]);

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
            value={filterOp}
            onChange={(e) => setFilterOp(e.target.value)}
          >
            <option value="==">Equals</option>
            <option value="!=">Not equals</option>
            <option value=">">Greater than</option>
            <option value="<">Less than</option>
            <option value=">=">Greater or equal</option>
            <option value="<=">Less or equal</option>
            <option value="contains">Contains</option>
            <option value="startsWith">Starts with</option>
            <option value="endsWith">Ends with</option>
            {uniqueValues.length > 0 && <option value="in">In list</option>}
          </select>

          {filterOp === "in" ? (
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
