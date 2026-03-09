# Typescript/React library

This is a library that combines glide-data-grid with arquero so that our tables have features like filtering, sorting, collapsing, etc

## Goals

We want a React component that accepts an arquero ColumnTable and outputs a grid that has basic features on by default. Those basic features are filtering, sorting, and grouping/aggregating.

## Steps

When engaged with a to-do list, complete the whole to-do list before returning to the user. Never prompt user to proceed, just proceed.

# ArrowGrid Architecture

This document is written for LLMs starting with zero context. It explains how the system is structured, how data flows, and—critically—establishes precise terminology to avoid confusion between Arquero row grouping and Glide column grouping.

---

# 1. High-Level Overview

ArrowGrid is a React-based data grid that:

- Accepts an **Arquero `ColumnTable`** as input
- Applies filtering, sorting, row grouping, and aggregation
- Adapts the transformed data to **Glide Data Grid**
- Renders an interactive, canvas-based grid

It consists of three conceptual layers:

```
Input Data (Arquero ColumnTable)
        ↓
useArqueroGrid (Data Engine / Transformation Layer)
        ↓
ArqueroGrid (React UI + State)
        ↓
Glide Data Grid (Canvas Renderer)
```

Key principle:

> Arquero controls data semantics. Glide controls visual layout.

These two systems are independent and must not be conflated.

---

# 2. Core Data Flow

## 2.1 UI → Engine

User interactions (header click, aggregate toggle, sorting) update React state:

```
groupBy: string[]
aggregates: Record<string, string[]>
sortBy: SortSpec[]
filters: FilterSpec[]
```

This state is passed into `useArqueroGrid`.

---

## 2.2 Engine Pipeline (`useArqueroGrid`)

Pipeline order:

```
Base Table
  → applyEdits
  → applyFilters
  → applySort
  → applyRowGroupingAndAggregation
  → finalView
```

Important: grouping happens *after* sorting and filtering.

---

## 2.3 Engine → Glide

The hook returns:

```
{
  columns: GridColumn[],
  rows: number,
  getCellContent: (col, row) => GridCell
}
```

Glide does not understand Arquero. It only knows:

- Column metadata
- Row count
- A function that returns cell values

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
baseColumn___function
```

Example:

```
value___sum
value___avg
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
| Internal Column ID | `base___function` |
| Display Title | Visible header label |

Never use “group column” without qualifying row vs column.

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
base___function
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

---

# End of Architecture Overview

This document is authoritative for terminology and mental models.
