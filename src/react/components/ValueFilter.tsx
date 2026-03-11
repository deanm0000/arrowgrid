import React, { useMemo, useState, useEffect, useCallback } from "react";
import type { FilterSpec } from "../../types";

type ScalarValue = string | number | boolean | Date | null;

interface ValueFilterProps {
  columnId: string;
  allValues: ScalarValue[];
  visibleValues: ScalarValue[];
  activeFilter: FilterSpec | undefined;
  onChange: (filter: FilterSpec | null) => void;
}

const menuItemStyle: React.CSSProperties = {
  padding: "4px 12px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 8,
  userSelect: "none",
};

export function ValueFilter({ columnId, allValues, visibleValues, activeFilter, onChange }: ValueFilterProps) {
  const activeSet = useMemo<Set<string>>(() => {
    if (activeFilter?.op === "in" && Array.isArray(activeFilter.value)) {
      return new Set(activeFilter.value.map(String));
    }
    return new Set(allValues.map(String));
  }, [activeFilter, allValues]);

  const [checked, setChecked] = useState<Set<string>>(activeSet);

  useEffect(() => {
    setChecked(activeSet);
  }, [activeSet]);

  const visibleStrings = useMemo(() => visibleValues.map(String), [visibleValues]);

  const allChecked = visibleStrings.every(v => checked.has(v));
  const someChecked = visibleStrings.some(v => checked.has(v));
  const indeterminate = someChecked && !allChecked;

  const emit = useCallback((next: Set<string>) => {
    const allValStrs = new Set(allValues.map(String));
    const checkedInAll = [...next].filter(v => allValStrs.has(v));
    if (checkedInAll.length === allValues.length) {
      onChange(null);
    } else {
      const originalValues = allValues.filter(v => next.has(String(v)));
      onChange({ column: columnId, op: "in", value: originalValues });
    }
  }, [allValues, columnId, onChange]);

  const toggle = useCallback((val: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      queueMicrotask(() => emit(next));
      return next;
    });
  }, [emit]);

  const toggleAll = useCallback(() => {
    setChecked(prev => {
      const next = new Set(prev);
      if (visibleStrings.every(v => next.has(v))) {
        visibleStrings.forEach(v => next.delete(v));
      } else {
        visibleStrings.forEach(v => next.add(v));
      }
      queueMicrotask(() => emit(next));
      return next;
    });
  }, [visibleStrings, emit]);

  const selectAllRef = React.useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <div>
      <div style={menuItemStyle} onClick={toggleAll}>
        <input
          ref={selectAllRef}
          type="checkbox"
          checked={allChecked}
          onChange={toggleAll}
          onClick={e => e.stopPropagation()}
        />
        <span style={{ fontStyle: "italic", color: "#555" }}>Select all</span>
      </div>
      <div style={{ maxHeight: 180, overflowY: "auto" }}>
        {visibleValues.map(val => {
          const s = String(val);
          return (
            <div key={s} style={menuItemStyle} onClick={() => toggle(s)}>
              <input
                type="checkbox"
                checked={checked.has(s)}
                onChange={() => toggle(s)}
                onClick={e => e.stopPropagation()}
              />
              <span>{s}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
