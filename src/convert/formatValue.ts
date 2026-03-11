import type { ColumnFormat, NumberFormat, DateFormat } from "../types";

const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function pad2(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

function addThousandSeps(intPart: string): string {
  let result = "";
  const len = intPart.length;
  for (let i = 0; i < len; i++) {
    if (i > 0 && (len - i) % 3 === 0) result += ",";
    result += intPart[i];
  }
  return result;
}

function formatNumber(value: number, fmt: NumberFormat): string {
  switch (fmt.type) {
    case "general":
      return String(value);

    case "decimal":
      return value.toFixed(fmt.decimals);

    case "currency": {
      const abs = Math.abs(value);
      const fixed = abs.toFixed(fmt.decimals);
      const [intPart, decPart] = fixed.split(".");
      const withSeps = addThousandSeps(intPart);
      const formatted = decPart !== undefined ? withSeps + "." + decPart : withSeps;
      return (value < 0 ? "-$" : "$") + formatted;
    }

    case "accounting": {
      const abs = Math.abs(value);
      const fixed = abs.toFixed(fmt.decimals);
      const [intPart, decPart] = fixed.split(".");
      const withSeps = addThousandSeps(intPart);
      const numStr = decPart !== undefined ? withSeps + "." + decPart : withSeps;
      const isNeg = value < 0;
      return isNeg ? "(" + numStr + ")" : numStr;
    }

    case "percentage":
      return (value * 100).toFixed(0) + "%";

    case "scientific": {
      const exp = value.toExponential(2).toUpperCase();
      return exp.replace("E+", "E+").replace("E-", "E-");
    }
  }
}

function formatDate(value: Date, fmt: DateFormat): string {
  const mm = pad2(value.getMonth() + 1);
  const dd = pad2(value.getDate());
  const yyyy = String(value.getFullYear());
  const hh = pad2(value.getHours());
  const min = pad2(value.getMinutes());
  const mmm = MONTH_ABBR[value.getMonth()];

  switch (fmt) {
    case "iso":
      return `${yyyy}-${mm}-${dd}`;
    case "mm-dd-yyyy":
      return `${mm}-${dd}-${yyyy}`;
    case "mmm-dd-yyyy":
      return `${mmm}-${dd}-${yyyy}`;
    case "mm-dd-yyyy-hh-mm":
      return `${mm}-${dd}-${yyyy} ${hh}:${min}`;
  }
}

export function formatValue(
  value: string | number | boolean | Date | null | undefined,
  format: ColumnFormat
): string | null {
  if (value === null || value === undefined) return null;

  if (format.kind === "number") {
    if (typeof value !== "number") return String(value);
    return formatNumber(value, format.format);
  }

  if (format.kind === "date") {
    if (!(value instanceof Date)) return String(value);
    return formatDate(value, format.format);
  }

  if (format.kind === "boolean") {
    if (format.format === "checkbox") return null;
    return value ? "true" : "false";
  }

  return null;
}
