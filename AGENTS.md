# Typescript/React library

This is a library that combines glide-data-grid with arquero so that our tables have features like filtering, sorting, collapsing, etc

## Goals

We want a React component that accepts an arquero ColumnTable and outputs a grid that has basic features on by default. Those basic features are filtering, sorting, and grouping/aggregating.

## Steps

When engaged with a to-do list, complete the whole to-do list before returning to the user. Never prompt user to proceed, just proceed.

## Commands

- Lint: `npm run lint`
- Type-check: `npx tsc --noEmit`
- Test: `npm test` (requires `vite dev` running on port 5173)

# ArrowGrid Architecture

This document is written for LLMs starting with zero context. It explains how the system is structured, how data flows, and—critically—establishes precise terminology to avoid confusion between Arquero row grouping and Glide column grouping.

---

# 1. High-Level Overview

ArrowGrid is a React-based data grid that:

- Accepts an **Arquero `ColumnTable`** as input
- Applies filtering, sorting, row grouping, and aggregation
- Adapts the transformed data to **Glide Data Grid**
- Renders an interactive, canvas-based grid

It consists of two layers (there is no separate hook — all logic lives in the component):

```
Input Data (Arquero ColumnTable)
        ↓
ArqueroGrid (React component — ALL logic)
  - React state: groupBy, aggregates, sortBy, filters, columnFormats, columnWidths, edits
  - Data pipeline: applyEdits → applyFilters → applySort → grouping/aggregation → finalView
  - Pure transform helpers: src/data/transforms.ts
  - Cell conversion: src/convert/toGridCell.ts, src/convert/formatValue.ts
  - Custom drawCell / drawHeader overrides
        ↓
Glide Data Grid (Canvas Renderer)
```

Key principle:

> Arquero controls data semantics. Glide controls visual layout.

These two systems are independent and must not be conflated.

---

# 2. Core Data Flow

## 2.1 UI → State

User interactions (header click, aggregate toggle, sorting, format change) update React state within `ArqueroGrid`:

```
groupBy: string[]
aggregates: Record<string, string[]>
sortBy: SortSpec[]
filters: FilterSpec[]
columnFormats: Record<string, ColumnFormat>
columnWidths: Record<string, number>
```

All state is local to `ArqueroGrid`. There is no external hook.

---

## 2.2 Data Pipeline (inside ArqueroGrid)

The pipeline is driven by `useMemo` chains:

```
props.data (ColumnTable)
  → applyEdits (staged edits from cell editing)
  → applyFilters (FilterSpec[])
  → applySort (SortSpec[])
  → applyRowGroupingAndAggregation (groupBy + aggregates → rollup)
  → finalView (the ColumnTable that Glide sees)
  → expandedView (with collapsed groups filtered out)
```

Pure transform functions (`applyEdits`, `applyFilters`, `applySort`) live in `src/data/transforms.ts`. Grouping/aggregation logic is inline in the component.

Important: grouping happens *after* sorting and filtering.

---

## 2.3 Component → Glide

The component passes to `<DataEditor>`:

- `columns` — `GridColumn[]` derived from `finalView.columnNames()`
- `rows` — row count from the expanded view
- `getCellContent(col, row)` — calls `toGridCell()` with the value, column kind, format, and testCopyMode
- `drawCell` — custom canvas drawing for zebra striping, accounting format, selection highlight
- `drawHeader` — custom header rendering with sort triangles, menu button, column group headers

Glide does not understand Arquero. It only knows columns, rows, and a function that returns cell values.

---

# 3. Precise Terminology (CRITICAL)

The word "group" is used in two completely different systems.
This section defines canonical vocabulary.

---

## 3.1 Row Grouping (Arquero)

**Row Group Column**
> A column used in `groupBy` (Arquero `groupby()`).

This affects rows.

Example:

```
groupBy = ["category"]
```

Arquero operation:

```
table.groupby("category").rollup(...)
```

This collapses rows.

---

## 3.2 Column Grouping (Glide)

**Column Group** (aka Header Group)
> A visual header grouping in Glide.

This affects columns only.

Example:

```
value
  ├── sum
  ├── avg
  └── distinct
```

This is created by setting:

```
group: "value"
```

on aggregate columns.

This does NOT affect rows.

---

## 3.3 Aggregate Column

**Aggregate Column**
> A leaf column representing a specific aggregation function.

Internal ID format:

```
baseColumn{AGG_DELIMITER}function
```

Where `AGG_DELIMITER = "ARROWGRIDDELIMITERYOUSHOULDNTSEETHIS"`.

Example:

```
value{AGG_DELIMITER}sum
value{AGG_DELIMITER}avg
```

These are unique and engine-facing.

---

## 3.4 Base Column

The original column from the input table.

Example:

```
value
category
```

---

## 3.5 Terminology Table

| Term | Meaning |
|------|---------|
| Row Group Column | Column used in Arquero `groupby()` |
| Column Group | Glide header grouping |
| Aggregate Column | A specific aggregation output column |
| Base Column | Original column from source table |
| Internal Column ID | `base{AGG_DELIMITER}function` |
| Display Title | Visible header label |

Never use "group column" without qualifying row vs column.

---

# 4. Aggregation System

Aggregations are stored as:

```
aggregates: Record<string, string[]>
```

Keyed by base column.

Example:

```
{
  value: ["sum", "avg"],
  name: ["distinct"]
}
```

Engine builds rollup spec:

```
{
  value___sum: op.sum("value"),
  value___avg: op.mean("value")
}
```

Default behavior:

- Numeric columns → `sum`
- Non-numeric columns → `distinct`

---

# 5. Column Identity Model

Column IDs are authoritative.

```
finalView.columnNames()
```

UI must never assume original ordering.

All remapping happens via:

```
columnIndexMap
```

Visual index ≠ data index.

---

# 6. Arquero Intricacies

## 6.1 `groupby().rollup()` Replaces Columns

After rollup:

- Only group keys + rollup outputs exist

Therefore:

```
grouped.select(...finalColumns)
```

is required to enforce column order.

---

## 6.2 Rollup Keys Must Be Unique

Hence the naming scheme:

```
base{AGG_DELIMITER}function
```

---

## 6.3 Sorting Must Be Reapplied

Arquero does not preserve pre-group ordering.

We reapply:

```
grouped.orderby(...)
```

---

## 6.4 `op.count()` Counts Rows

It does not depend on column.

---

## 6.5 `filter()` Requires `escape()` for Closures

Arquero's `filter()` requires `escape()` wrapper for closures over external variables — without it, filter silently returns 0 rows.

---

# 7. Glide Intricacies

## 7.1 Glide Is Purely Visual

It knows nothing about Arquero.

It only consumes:

- columns
- rows
- getCellContent

---

## 7.2 Column Grouping Is Visual Only

Setting:

```
group: "value"
```

creates a header grouping only.

No data changes occur.

---

## 7.3 Headers Are Canvas-Drawn

Alignment and styling require overriding `drawHeader`.

Theme cannot control alignment.

---

## 7.4 Copy Behavior

Glide's copy pipeline checks, in order: `copyData` (from `BaseGridCell`), then `displayData`, then `data`.

- For `NumberCell`, Glide copies `displayData` (not `data`). To force raw copy, set `copyData: String(value)`.
- For `BooleanCell`, Glide copies `"TRUE"` / `"FALSE"` (uppercase).
- For `TextCell`, Glide copies `displayData ?? data`.

Normal copy (without `?testcopy=1`) copies raw values via `copyData`. `?testcopy=1` mode copies formatted display values (NumberCell becomes TextCell with `data = formatted`).

---

## 7.5 drawCell Override

When fully overriding cell rendering via `drawCell`:
- Must draw cell borders manually (right + bottom, 1px, `theme.borderColor`) — otherwise borders disappear.
- For accounting cells, call `drawContent()` first then overdraw just the interior to preserve Glide's native borders.

---

## 7.6 Theme Properties

- `bgCell` / `bgCellMedium` — fills the empty overflow area beyond data rows/columns. Set to match page background.
- `roundingRadius` — controls rounded corners on the selection box. Default is undefined (no rounding). We default to 6.
- Actual cell backgrounds are controlled entirely by `drawCell` using `bgColors[row % 2]`.

---

## 7.7 `getBounds(col, row)`

Returns `undefined` for rows not currently in the DOM. The `__ARROWGRID_LAYOUT__` handler silently drops these, so `layout.rows` only contains rows that Glide has rendered.

---

# 8. Header Rendering Model

Three header types exist:

1. Normal column header
2. Aggregate function header (e.g. "sum")
3. Column group header (e.g. "value")

Rendering responsibilities:

- Aggregate headers → styled via `themeOverride`
- Column group headers → centered via `drawHeader`
- Row group columns → default behavior

---

# 9. Mental Model Diagram

Example with row grouping + column aggregation:

```
Row Group Column: category

Data Engine Output Columns:

category | value___sum | value___avg

Glide Rendering:

          value
category   sum   avg
--------------------------------
A           10    5
B           20    10
```

Row grouping and column grouping are orthogonal systems.

---

# 10. Design Principles

1. Data semantics belong to Arquero.
2. Visual grouping belongs to Glide.
3. Never mix row grouping with column grouping terminology.
4. Always derive column identity from `finalView`.
5. Keep internal IDs stable and deterministic.
6. UI state is declarative input to the engine.
7. All logic lives in `ArqueroGrid.tsx` — there is no separate hook.

---

# 11. Value Formatting System

Formats are stored in `columnFormats: Record<string, ColumnFormat>` state.

Supported format types:
- **NumberFormat**: general, decimal, currency, accounting, percentage, scientific
- **DateFormat**: iso, mm-dd-yyyy, mmm-dd-yyyy, mm-dd-yyyy-hh-mm
- **BooleanFormat**: checkbox, words

Format menu: "Value format" submenu in column menu; "Aggregate format" for mixed-type columns in groupBy mode.

Accounting format: `$` is drawn separately in `drawCell` (left-aligned), number is right-aligned, negative in red with parens. The `$` is never in `data`/`displayData`, so copy does NOT include `$`.

Default date format (`mm-dd-yyyy-hh-mm`) is auto-applied on component mount by scanning `props.data` for Date-typed columns.

Format state keys:
- `columnFormats[baseColId]` — controls source value format
- `columnFormats[fullAggColId]` — controls aggregate output format
- `formatSubMenuOpen` state: `{ colId: string; mode: "value" | "agg" } | null`

---

# 12. Testing Architecture

Tests use Playwright (chromium only). `vite dev` must be running on port 5173.

## 12.1 Layout Emission

`Ctrl+Shift+Alt+D` triggers `__ARROWGRID_LAYOUT__` via `console.log`. The payload:

```json
{
  "columns": { "colId": { "centerX": number, "header": { "centerY", "menuX", "menuY", "ascX", "ascY", "descX", "descY" } } },
  "rows": [{ "centerY": number }],
  "containerBounds": { "top": number, "bottom": number }
}
```

- `containerBounds` comes from `.arrow-grid-container`'s `getBoundingClientRect()`.
- Row coordinates are page-absolute (suitable for `page.mouse.click()`).
- `getBounds()` only returns values for rows Glide has rendered, so `rows` may be a subset.

## 12.2 `copyColumn` Helper

Selects a column range by clicking first and shift-clicking last on-screen row, then copies.

On-screen rows are filtered using container bounds (NOT the viewport):
```ts
const onScreenRows = rows
  .map((r, i) => ({ i, ...r }))
  .filter(r => r.centerY > bounds.top && r.centerY < bounds.bottom);
```

Returns `CopyResult`:
```ts
{ values: string[], visibleRows: number[] }
```

`visibleRows` is an array of original row indices. Tests use `visibleRows[0]` and `visibleRows.at(-1)! + 1` as slice bounds into sample data arrays.

## 12.3 Wait Constants

Tests must use named constants for `waitForTimeout` — never hardcoded numbers:
- `WAIT_SHORT = 100`
- `WAIT_MEDIUM = 200`
- `WAIT_FORMAT = 150`

## 12.4 Test Copy Mode

`?testcopy=1` URL param switches copy behavior to return formatted display values instead of raw values. `testCopyMode` is read from `window.location.search` via `useMemo` in `ArqueroGrid`.

## 12.5 Menu Dismissal

Column menus close on `pointerdown` outside the menu refs (`window` listener with `capture: true`). Tests use `closeMenu()` helper which clicks the canvas to dismiss. Pressing Escape does NOT close menus.

---

# 13. Key Discoveries

- `op.count()` and `op.distinct()` always return numbers regardless of the base column type. `getCellContent` detects numeric aggregate functions (`count`, `distinct`, `sum`, `avg`, `mean`, `min`, `max`) and uses `"number"` kind.
- React: calling parent `setState` inside a child's `setChecked` updater causes "setState during render" warning. Fix with `queueMicrotask(() => emit(next))`.
- `ValueFilter.emit` with all values checked emits `null` (clears filter = show all).
- Detail rows in groupBy mode: when an agg column slot holds a source value (string/date), detect via `typeof value !== "number"` and use the base column's kind instead of forcing `"number"`.

---

# 14. File Structure

```
/home/dean/pyjs/modules/arrowgrid/
├── AGENTS.md
├── package.json                        # type:module, scripts: lint/dev/test/build
├── eslint.config.js                    # @typescript-eslint/no-explicit-any: error
├── playwright.config.ts                # baseURL: localhost:5173, chromium only
├── tsconfig.json                       # include: src/**/* only (tests not type-checked)
├── vite.config.ts
├── index.html                          # .grid-container: flex:1
├── src/
│   ├── main.tsx                        # App entry, uses sampleRows from sampleData.ts
│   ├── sampleData.ts                   # 30 rows: name, value, category, region, weight, date, active
│   ├── types.ts                        # All types: NumberFormat, DateFormat, BooleanFormat,
│   │                                   # ColumnFormat, UseArqueroGridProps (backgroundColor,
│   │                                   # roundingRadius, width, height), AGG_DELIMITER
│   ├── index.ts                        # Exports ArqueroGrid component
│   ├── data/
│   │   └── transforms.ts              # Pure functions: applyEdits, applyFilters, applySort
│   ├── convert/
│   │   ├── formatValue.ts              # Pure formatValue(value, format) for all formats
│   │   ├── toGridCell.ts              # toGridCell(value, kind, format?, testCopyMode?)
│   │   └── fromGridCell.ts            # Converts edited GridCell back to a value
│   └── react/
│       ├── ArqueroGrid.tsx             # THE main component — contains ALL logic:
│       │                               # data pipeline, edit state (staged/undo/redo),
│       │                               # filter state, getCellContent, columnKinds,
│       │                               # drawCell (unified with fillBg/drawBorders helpers),
│       │                               # drawHeader, format menus, groupBy, aggregates,
│       │                               # column ordering, __ARROWGRID_LAYOUT__ emission,
│       │                               # bgColors for zebra, roundingRadius prop (default 6),
│       │                               # width/height optional props, className="arrow-grid-container"
│       ├── useColumnFilters.ts         # Column filter hook
│       └── components/
│           ├── ColumnFilterMenu.tsx
│           ├── ValueFilter.tsx
│           ├── TextFilter.tsx
│           ├── NumberFilter.tsx
│           ├── ValueFormatMenu.tsx
│           ├── ColumnFilter.tsx        # Legacy (unused)
│           └── GroupHeader.tsx
└── tests/
    ├── helpers.ts                      # getLayout, copyColumn (container-bounds filtering),
    │                                   # closeMenu, openFormatMenu, testSortForColumn,
    │                                   # CopyResult { values, visibleRows: number[] },
    │                                   # GridLayout { columns, rows, containerBounds },
    │                                   # WAIT_SHORT/WAIT_MEDIUM/WAIT_FORMAT constants
    ├── sort.spec.ts                    # 1 test — sort asc/desc for all columns
    ├── copy.spec.ts                    # 3 tests — full range copy, currency raw copy, all formats raw copy
    ├── filter.spec.ts                  # 2 tests — value filter, text filter op persistence
    ├── format.spec.ts                  # 11 tests — all number/date/boolean formats with testcopy=1
    └── groupby.spec.ts                # 1 test — boolean count/distinct aggregates return numbers
```

All 18 tests passing.

---

# End of Architecture Overview

This document is authoritative for terminology and mental models.
