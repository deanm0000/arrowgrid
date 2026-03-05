import {
  type GridCell,
  type TextCell,
  type NumberCell,
  type UriCell,
  type ImageCell,
  type BooleanCell,
  type MarkdownCell,
  type BubbleCell,
  type DrilldownCell,
  type RowIDCell,
  GridCellKind,
} from "@glideapps/glide-data-grid";

export type CellValue = string | number | boolean | Date | null | undefined;

function createBaseCell(): Pick<GridCell, "allowOverlay" | "lastUpdated"> {
  return {
    allowOverlay: true,
    lastUpdated: Date.now(),
  };
}

export function toGridCell(
  value: CellValue,
  kind: "text" | "number" | "uri" | "image" | "boolean" | "markdown" | "bubble" | "drilldown" | "rowid" = "text"
): GridCell {
  if (value === null || value === undefined) {
    return {
      ...createBaseCell(),
      kind: GridCellKind.Text,
      data: "",
      displayData: "",
    };
  }

  switch (kind) {
    case "number":
      return {
        ...createBaseCell(),
        kind: GridCellKind.Number,
        displayData: String(Number(value) || 0),
        data: Number(value) || 0,
      } as NumberCell;

    case "uri":
      return {
        ...createBaseCell(),
        kind: GridCellKind.Uri,
        data: String(value),
      } as UriCell;

    case "image":
      const imgValue = Array.isArray(value) ? value : [String(value)];
      return {
        ...createBaseCell(),
        kind: GridCellKind.Image,
        data: imgValue,
      } as ImageCell;

    case "boolean":
      return {
        ...createBaseCell(),
        kind: GridCellKind.Boolean,
        data: Boolean(value),
        allowOverlay: false,
      } as BooleanCell;

    case "markdown":
      return {
        ...createBaseCell(),
        kind: GridCellKind.Markdown,
        data: String(value),
      } as MarkdownCell;

    case "bubble":
      const bubbleValue = Array.isArray(value)
        ? value.map(String)
        : [String(value)];
      return {
        ...createBaseCell(),
        kind: GridCellKind.Bubble,
        data: bubbleValue,
      } as BubbleCell;

    case "drilldown":
      const drillValue = Array.isArray(value)
        ? value.map((v) => ({ text: String(v), id: String(v) }))
        : [{ text: String(value), id: String(value) }];
      return {
        ...createBaseCell(),
        kind: GridCellKind.Drilldown,
        data: drillValue,
      } as DrilldownCell;

    case "rowid":
      return {
        ...createBaseCell(),
        kind: GridCellKind.RowID,
        data: String(value),
      } as RowIDCell;

    case "text":
    default:
      return {
        ...createBaseCell(),
        kind: GridCellKind.Text,
        data: String(value),
        displayData: String(value),
      } as TextCell;
  }
}

export function getCellKind(
  _columnId: string,
  sampleValue: CellValue
): "text" | "number" | "uri" | "image" | "boolean" | "markdown" | "bubble" | "drilldown" | "rowid" {
  if (sampleValue === null || sampleValue === undefined) {
    return "text";
  }

  if (typeof sampleValue === "number") {
    return "number";
  }

  if (typeof sampleValue === "boolean") {
    return "boolean";
  }

  if (sampleValue instanceof Date) {
    return "text";
  }

  if (Array.isArray(sampleValue)) {
    if (sampleValue.length > 0 && typeof sampleValue[0] === "string") {
      if (String(sampleValue[0]).startsWith("http")) {
        return "image";
      }
      return "bubble";
    }
    return "text";
  }

  const strValue = String(sampleValue);
  if (strValue.startsWith("http://") || strValue.startsWith("https://")) {
    return "uri";
  }

  if (strValue.includes("#") || strValue.includes("*") || strValue.includes("`")) {
    return "markdown";
  }

  return "text";
}
