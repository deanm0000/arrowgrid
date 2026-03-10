import React, { useState, useEffect, useCallback } from "react";
import type { FilterSpec, FilterOp } from "../../types";

interface TextFilterProps {
  columnId: string;
  activeFilter: FilterSpec | undefined;
  onChange: (filter: FilterSpec | null) => void;
}

const TEXT_OPS: { value: FilterOp; label: string }[] = [
  { value: "contains", label: "Contains" },
  { value: "notContains", label: "Does not contain" },
  { value: "==", label: "Equals" },
  { value: "!=", label: "Does not equal" },
  { value: "startsWith", label: "Starts with" },
  { value: "endsWith", label: "Ends with" },
  { value: "regex", label: "Regex" },
];

const isTextOp = (op: FilterOp): boolean =>
  TEXT_OPS.some(o => o.value === op);

export function TextFilter({ columnId, activeFilter, onChange }: TextFilterProps) {
  const initialOp: FilterOp =
    activeFilter?.op && isTextOp(activeFilter.op) ? activeFilter.op : "contains";
  const initialValue =
    typeof activeFilter?.value === "string" ? activeFilter.value : "";

  const [op, setOp] = useState<FilterOp>(initialOp);
  const [value, setValue] = useState<string>(initialValue);

  useEffect(() => {
    setOp(activeFilter?.op && isTextOp(activeFilter.op) ? activeFilter.op : "contains");
    setValue(typeof activeFilter?.value === "string" ? activeFilter.value : "");
  }, [activeFilter]);

  const emit = useCallback((currentOp: FilterOp, currentValue: string) => {
    if (currentValue.trim() === "") {
      onChange(null);
    } else {
      onChange({ column: columnId, op: currentOp, value: currentValue });
    }
  }, [columnId, onChange]);

  const handleOpChange = (newOp: FilterOp) => {
    setOp(newOp);
    emit(newOp, value);
  };

  const handleValueChange = (newValue: string) => {
    setValue(newValue);
    emit(op, newValue);
  };

  const clear = () => {
    setValue("");
    onChange(null);
  };

  return (
    <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
      <select
        value={op}
        onChange={e => handleOpChange(e.target.value as FilterOp)}
        style={{ width: "100%" }}
      >
        {TEXT_OPS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <input
        type="text"
        value={value}
        onChange={e => handleValueChange(e.target.value)}
        placeholder="Value..."
        style={{ width: "100%", boxSizing: "border-box" }}
      />
      <button onClick={clear} style={{ cursor: "pointer" }}>Clear</button>
    </div>
  );
}
