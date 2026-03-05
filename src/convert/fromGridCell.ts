import type { GridCell } from "@glideapps/glide-data-grid";

export function fromGridCell(cell: GridCell): string | number | boolean | Date | null {
  switch (cell.kind) {
    case "text":
    case "uri":
    case "row-id":
    case "markdown":
      return cell.data;

    case "number":
      return cell.data ?? 0;

    case "boolean":
      return typeof cell.data === "boolean" ? cell.data : null;

    case "image":
    case "bubble":
      return typeof cell.data[0] === "string" ? cell.data[0] : null;

    case "drilldown":
      return cell.data[0]?.text ?? null;

    case "loading":
    case "protected":
    case "custom":
    default:
      return null;
  }
}

export function parseValue(
  value: string,
  targetKind: string
): string | number | boolean | Date | null {
  if (targetKind === "number") {
    const num = Number(value);
    return isNaN(num) ? null : num;
  }

  if (targetKind === "boolean") {
    const lower = value.toLowerCase();
    if (lower === "true" || lower === "1") return true;
    if (lower === "false" || lower === "0") return false;
    return null;
  }

  return value;
}
