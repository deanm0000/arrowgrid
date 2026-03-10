import React, { useState, useEffect, useCallback } from "react";
import type { FilterSpec, FilterOp } from "../../types";

interface NumberFilterProps {
  columnId: string;
  activeFilter: FilterSpec | undefined;
  onChange: (filter: FilterSpec | null) => void;
}

const NUMBER_OPS: { value: FilterOp; label: string; noInput?: boolean; twoInputs?: boolean }[] = [
  { value: "==", label: "Equals" },
  { value: "!=", label: "Does not equal" },
  { value: ">", label: "Greater than" },
  { value: ">=", label: "Greater than or equal" },
  { value: "<", label: "Less than" },
  { value: "<=", label: "Less than or equal" },
  { value: "between", label: "Between", twoInputs: true },
  { value: "isNull", label: "Is null", noInput: true },
  { value: "isNotNull", label: "Is not null", noInput: true },
];

const isNumberOp = (op: FilterOp): boolean =>
  NUMBER_OPS.some(o => o.value === op);

export function NumberFilter({ columnId, activeFilter, onChange }: NumberFilterProps) {
  const initialOp: FilterOp =
    activeFilter?.op && isNumberOp(activeFilter.op) ? activeFilter.op : "==";
  const initialValue =
    typeof activeFilter?.value === "number" ? String(activeFilter.value) : "";
  const initialValue2 =
    typeof activeFilter?.value2 === "number" ? String(activeFilter.value2) : "";

  const [op, setOp] = useState<FilterOp>(initialOp);
  const [value, setValue] = useState<string>(initialValue);
  const [value2, setValue2] = useState<string>(initialValue2);

  useEffect(() => {
    setOp(activeFilter?.op && isNumberOp(activeFilter.op) ? activeFilter.op : "==");
    setValue(typeof activeFilter?.value === "number" ? String(activeFilter.value) : "");
    setValue2(typeof activeFilter?.value2 === "number" ? String(activeFilter.value2) : "");
  }, [activeFilter]);

  const opMeta = NUMBER_OPS.find(o => o.value === op);

  const emit = useCallback((currentOp: FilterOp, currentValue: string, currentValue2: string) => {
    const meta = NUMBER_OPS.find(o => o.value === currentOp);
    if (meta?.noInput) {
      onChange({ column: columnId, op: currentOp });
      return;
    }
    if (meta?.twoInputs) {
      const lo = parseFloat(currentValue);
      const hi = parseFloat(currentValue2);
      if (!isNaN(lo) && !isNaN(hi)) {
        onChange({ column: columnId, op: currentOp, value: lo, value2: hi });
      } else {
        onChange(null);
      }
      return;
    }
    const n = parseFloat(currentValue);
    if (!isNaN(n)) {
      onChange({ column: columnId, op: currentOp, value: n });
    } else {
      onChange(null);
    }
  }, [columnId, onChange]);

  const handleOpChange = (newOp: FilterOp) => {
    setOp(newOp);
    emit(newOp, value, value2);
  };

  const handleValueChange = (newValue: string) => {
    setValue(newValue);
    emit(op, newValue, value2);
  };

  const handleValue2Change = (newValue2: string) => {
    setValue2(newValue2);
    emit(op, value, newValue2);
  };

  const clear = () => {
    setValue("");
    setValue2("");
    onChange(null);
  };

  return (
    <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
      <select
        value={op}
        onChange={e => handleOpChange(e.target.value as FilterOp)}
        style={{ width: "100%" }}
      >
        {NUMBER_OPS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {!opMeta?.noInput && (
        <input
          type="number"
          value={value}
          onChange={e => handleValueChange(e.target.value)}
          placeholder={opMeta?.twoInputs ? "Min..." : "Value..."}
          style={{ width: "100%", boxSizing: "border-box" }}
        />
      )}
      {opMeta?.twoInputs && (
        <input
          type="number"
          value={value2}
          onChange={e => handleValue2Change(e.target.value)}
          placeholder="Max..."
          style={{ width: "100%", boxSizing: "border-box" }}
        />
      )}
      <button onClick={clear} style={{ cursor: "pointer" }}>Clear</button>
    </div>
  );
}
