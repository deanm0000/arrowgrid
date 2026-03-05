import { useState, useCallback } from "react";
import type { FilterSpec } from "../types";

export interface UseColumnFiltersProps {
  initialFilters?: Map<string, FilterSpec>;
  onFilterChange?: (filters: Map<string, FilterSpec>) => void;
}

export function useColumnFilters(props?: UseColumnFiltersProps) {
  const [filters, setFilters] = useState<Map<string, FilterSpec>>(
    props?.initialFilters || new Map()
  );

  const setFilter = useCallback(
    (column: string, spec: FilterSpec | undefined) => {
      setFilters((prev) => {
        const next = new Map(prev);
        if (spec) {
          next.set(column, spec);
        } else {
          next.delete(column);
        }
        props?.onFilterChange?.(next);
        return next;
      });
    },
    [props]
  );

  const clearFilters = useCallback(() => {
    setFilters(new Map());
    props?.onFilterChange?.(new Map());
  }, [props]);

  const removeFilter = useCallback(
    (column: string) => {
      setFilters((prev) => {
        const next = new Map(prev);
        next.delete(column);
        props?.onFilterChange?.(next);
        return next;
      });
    },
    [props]
  );

  return {
    filters,
    setFilter,
    clearFilters,
    removeFilter,
  };
}
