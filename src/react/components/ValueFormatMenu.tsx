import React, { useState, useEffect } from "react";
import type { ColumnFormat, NumberFormat, DateFormat, BooleanFormat } from "../../types";

type ColumnKind = "number" | "date" | "boolean" | "other";

interface ValueFormatMenuProps {
  columnId: string;
  columnKind: ColumnKind;
  activeFormat: ColumnFormat | undefined;
  onChange: (format: ColumnFormat | null) => void;
}

const NUMBER_TYPES = [
  { value: "general", label: "General" },
  { value: "decimal", label: "Decimal" },
  { value: "currency", label: "Currency" },
  { value: "accounting", label: "Accounting" },
  { value: "percentage", label: "Percentage" },
  { value: "scientific", label: "Scientific" },
] as const;

const DATE_FORMATS: { value: DateFormat; label: string }[] = [
  { value: "mm-dd-yyyy-hh-mm", label: "MM-DD-YYYY HH:MM" },
  { value: "mm-dd-yyyy", label: "MM-DD-YYYY" },
  { value: "mmm-dd-yyyy", label: "MMM-DD-YYYY" },
  { value: "iso", label: "ISO-8601 (YYYY-MM-DD)" },
];

const DECIMAL_OPTIONS = [0, 1, 2, 3, 4, 5, 6];

function getInitialNumberType(fmt: ColumnFormat | undefined): string {
  if (fmt?.kind === "number") return fmt.format.type;
  return "general";
}

function getInitialDecimals(fmt: ColumnFormat | undefined): number {
  if (fmt?.kind === "number") {
    const f = fmt.format;
    if (f.type === "decimal" || f.type === "currency" || f.type === "accounting") {
      return f.decimals;
    }
  }
  return 2;
}

function getInitialDateFmt(fmt: ColumnFormat | undefined): DateFormat {
  if (fmt?.kind === "date") return fmt.format;
  return "mm-dd-yyyy-hh-mm";
}

function getInitialBoolFmt(fmt: ColumnFormat | undefined): BooleanFormat {
  if (fmt?.kind === "boolean") return fmt.format;
  return "checkbox";
}

const selectStyle: React.CSSProperties = { width: "100%" };
const containerStyle: React.CSSProperties = {
  padding: "8px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minWidth: 220,
};

export function ValueFormatMenu({ columnKind, activeFormat, onChange }: ValueFormatMenuProps) {
  const [numberType, setNumberType] = useState(getInitialNumberType(activeFormat));
  const [decimals, setDecimals] = useState(getInitialDecimals(activeFormat));
  const [dateFmt, setDateFmt] = useState<DateFormat>(getInitialDateFmt(activeFormat));
  const [boolFmt, setBoolFmt] = useState<BooleanFormat>(getInitialBoolFmt(activeFormat));

  useEffect(() => {
    if (columnKind === "date" && !activeFormat) {
      onChange({ kind: "date", format: "mm-dd-yyyy-hh-mm" });
    }
  }, []);

  const emitNumber = (type: string, dec: number) => {
    if (type === "general") {
      onChange({ kind: "number", format: { type: "general" } });
    } else if (type === "decimal") {
      onChange({ kind: "number", format: { type: "decimal", decimals: dec } });
    } else if (type === "currency") {
      onChange({ kind: "number", format: { type: "currency", decimals: dec } });
    } else if (type === "accounting") {
      onChange({ kind: "number", format: { type: "accounting", decimals: dec } });
    } else if (type === "percentage") {
      onChange({ kind: "number", format: { type: "percentage" } });
    } else if (type === "scientific") {
      onChange({ kind: "number", format: { type: "scientific" } });
    }
  };

  const handleNumberType = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const t = e.target.value;
    setNumberType(t);
    emitNumber(t, decimals);
  };

  const handleDecimals = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const d = Number(e.target.value);
    setDecimals(d);
    emitNumber(numberType, d);
  };

  const handleDateFmt = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const f = e.target.value as DateFormat;
    setDateFmt(f);
    onChange({ kind: "date", format: f });
  };

  const handleBoolFmt = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const f = e.target.value as BooleanFormat;
    setBoolFmt(f);
    onChange({ kind: "boolean", format: f });
  };

  const needsDecimals = numberType === "decimal" || numberType === "currency" || numberType === "accounting";

  if (columnKind === "number") {
    return (
      <div style={containerStyle}>
        <select value={numberType} onChange={handleNumberType} style={selectStyle}>
          {NUMBER_TYPES.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {needsDecimals && (
          <select value={decimals} onChange={handleDecimals} style={selectStyle}>
            {DECIMAL_OPTIONS.map(d => (
              <option key={d} value={d}>{d} decimal{d !== 1 ? "s" : ""}</option>
            ))}
          </select>
        )}
        <button onClick={() => onChange(null)} style={{ cursor: "pointer" }}>Reset</button>
      </div>
    );
  }

  if (columnKind === "date") {
    return (
      <div style={containerStyle}>
        <select value={dateFmt} onChange={handleDateFmt} style={selectStyle}>
          {DATE_FORMATS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button onClick={() => onChange(null)} style={{ cursor: "pointer" }}>Reset</button>
      </div>
    );
  }

  if (columnKind === "boolean") {
    return (
      <div style={containerStyle}>
        <select value={boolFmt} onChange={handleBoolFmt} style={selectStyle}>
          <option value="checkbox">Checkbox</option>
          <option value="words">True / False</option>
        </select>
        <button onClick={() => onChange(null)} style={{ cursor: "pointer" }}>Reset</button>
      </div>
    );
  }

  return null;
}
