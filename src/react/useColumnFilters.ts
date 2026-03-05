import { useState, useCallback } from "react";
import type { FilterSpec, UseColumnFiltersProps } from "../types";

export function useColumnFilters(props?: UseColumnFiltersProps) {
  const [filters, setFilters] = useState<FilterSpec[]>(
    props?.initialFilters || []
  );

  const addFilter = useCallback(
    (filter: FilterSpec) => {
      setFilters((prev) => {
        const next = [...prev, filter];
        props?.onFilterChange?.(next);
        return next;
      });
    },
    [props]
  );

  const removeFilter = useCallback(
    (index: number) => {
      setFilters((prev) => {
        const next = prev.filter((_, i) => i !== index);
        props?.onFilterChange?.(next);
        return next;
      });
    },
    [props]
  );

  const clearFilters = useCallback(() => {
    setFilters([]);
    props?.onFilterChange?.([]);
  }, [props]);

  return {
    filters,
    addFilter,
    removeFilter,
    clearFilters,
  };
}
