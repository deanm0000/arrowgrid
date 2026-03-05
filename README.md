# ArrowGrid

A TypeScript library that combines [glide-data-grid](https://github.com/glideapps/glide-data-grid) with [arquero](https://github.com/uwdata/arquero) to provide data grid functionality with grouping, sorting, filtering, and aggregation features.

## Basic Usage

```tsx
import { useArqueroGrid } from 'arrowgrid';
import { DataEditor } from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';

function App() {
  const grid = useArqueroGrid({
    data: [
      { name: 'Alice', value: 100, category: 'A' },
      { name: 'Bob', value: 200, category: 'B' },
      { name: 'Charlie', value: 150, category: 'A' },
    ],
    columns: [
      { id: 'name', title: 'Name', width: 150 },
      { id: 'value', title: 'Value', width: 100 },
      { id: 'category', title: 'Category', width: 100 },
    ],
    editable: true,
  });

  return (
    <DataEditor
      columns={grid.columns}
      getCellContent={grid.getCellContent}
      onCellEdited={grid.onCellEdited}
      rows={grid.rows}
    />
  );
}
```

## Grouping

Enable row grouping by specifying columns to group by:

```tsx
function GroupedGrid() {
  const grid = useArqueroGrid({
    data: [
      { name: 'Alice', value: 100, category: 'A', region: 'North' },
      { name: 'Bob', value: 200, category: 'B', region: 'South' },
      { name: 'Charlie', value: 150, category: 'A', region: 'North' },
    ],
    columns: [
      { id: 'name', title: 'Name', width: 150 },
      { id: 'value', title: 'Value', width: 100 },
      { id: 'category', title: 'Category', width: 100 },
      { id: 'region', title: 'Region', width: 100 },
    ],
    groupBy: ['category'],
  });

  return (
    <DataEditor
      columns={grid.columns}
      getCellContent={grid.getCellContent}
      rows={grid.rows}
      groups={grid.groups}
    />
  );
}
```

To toggle group collapse state:

```tsx
function GroupedGridWithToggle() {
  const grid = useArqueroGrid({
    data: [
      { name: 'Alice', value: 100, category: 'A' },
      { name: 'Bob', value: 200, category: 'B' },
      { name: 'Charlie', value: 150, category: 'A' },
    ],
    columns: [
      { id: 'name', title: 'Name', width: 150 },
      { id: 'value', title: 'Value', width: 100 },
      { id: 'category', title: 'Category', width: 100 },
    ],
    groupBy: ['category'],
  });

  const handleGroupHeaderClick = (groupKey: string) => {
    grid.toggleGroup(groupKey); // Toggle collapse state
  };

  return (
    <DataEditor
      columns={grid.columns}
      getCellContent={grid.getCellContent}
      rows={grid.rows}
      groups={grid.groups}
    />
  );
}
```

## Sorting

Sort by clicking column headers or programmatically:

```tsx
function SortedGrid() {
  const grid = useArqueroGrid({
    data: [
      { name: 'Alice', value: 100, category: 'A' },
      { name: 'Bob', value: 200, category: 'B' },
      { name: 'Charlie', value: 150, category: 'A' },
    ],
    columns: [
      { id: 'name', title: 'Name', width: 150 },
      { id: 'value', title: 'Value', width: 100 },
      { id: 'category', title: 'Category', width: 100 },
    ],
    sortBy: [
      { column: 'value', desc: true },  // Sort by value descending
    ],
  });

  return (
    <DataEditor
      columns={grid.columns}
      getCellContent={grid.getCellContent}
      rows={grid.rows}
      onHeaderClicked={(col) => {
        const column = grid.columns[col];
        const currentSort = grid.sortBy.find(s => s.column === column.id);
        // Toggle sort direction
        grid.setSortBy([
          { 
            column: column.id as string, 
            desc: currentSort ? !currentSort.desc : true 
          }
        ]);
      }}
    />
  );
}
```

## Filtering

Filter data by column values:

```tsx
function FilteredGrid() {
  const grid = useArqueroGrid({
    data: [
      { name: 'Alice', value: 100, category: 'A' },
      { name: 'Bob', value: 200, category: 'B' },
      { name: 'Charlie', value: 150, category: 'A' },
    ],
    columns: [
      { id: 'name', title: 'Name', width: 150 },
      { id: 'value', title: 'Value', width: 100 },
      { id: 'category', title: 'Category', width: 100 },
    ],
  });

  // Apply filters
  grid.setFilter('category', { type: 'equals', value: 'A' });
  grid.setFilter('value', { type: 'gt', value: 100 });

  // Clear filters
  grid.clearFilters();

  return (
    <DataEditor
      columns={grid.columns}
      getCellContent={grid.getCellContent}
      rows={grid.rows}
    />
  );
}
```

Filter types available:
- `equals` - Exact match
- `contains` - Substring match (for strings)
- `gt`, `gte`, `lt`, `lte` - Numeric comparisons
- `in` - Match any value in a list
- `custom` - Custom predicate function

## Editing with Undo/Redo

Changes are staged until explicitly committed:

```tsx
function EditableGridWithHistory() {
  const grid = useArqueroGrid({
    data: [
      { name: 'Alice', value: 100, category: 'A' },
      { name: 'Bob', value: 200, category: 'B' },
    ],
    columns: [
      { id: 'name', title: 'Name', width: 150 },
      { id: 'value', title: 'Value', width: 100 },
      { id: 'category', title: 'Category', width: 100 },
    ],
    editable: true,
  });

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <button 
          onClick={grid.undo} 
          disabled={!grid.canUndo}
        >
          Undo
        </button>
        <button 
          onClick={grid.redo} 
          disabled={!grid.canRedo}
        >
          Redo
        </button>
        <button onClick={grid.commit}>
          Commit Changes ({grid.stagedCount} staged)
        </button>
        <button onClick={grid.rollback}>
          Rollback
        </button>
      </div>

      <DataEditor
        columns={grid.columns}
        getCellContent={grid.getCellContent}
        onCellEdited={grid.onCellEdited}
        rows={grid.rows}
      />
    </div>
  );
}
```

### How Staged Editing Works

1. When a cell is edited, the change is staged (not yet saved to the underlying data)
2. Call `grid.commit()` to save all staged changes to the arquero table
3. Call `grid.rollback()` to discard all staged changes
4. Use `grid.undo()` / `grid.redo()` to navigate the edit history

## Aggregation

Combine grouping with aggregation functions:

```tsx
function AggregatedGrid() {
  const grid = useArqueroGrid({
    data: [
      { name: 'Alice', value: 100, category: 'A' },
      { name: 'Bob', value: 200, category: 'B' },
      { name: 'Charlie', value: 150, category: 'A' },
    ],
    columns: [
      { id: 'name', title: 'Name', width: 150 },
      { id: 'value', title: 'Value', width: 100 },
      { id: 'category', title: 'Category', width: 100 },
    ],
    groupBy: ['category'],
    aggregates: {
      totalValue: { op: 'sum', column: 'value' },
      avgValue: { op: 'mean', column: 'value', as: 'avg' },
      count: { op: 'count', as: 'rowCount' },
    },
  });

  // Get aggregated data
  const aggregatedData = grid.getAggregatedData();

  return (
    <DataEditor
      columns={grid.columns}
      getCellContent={grid.getCellContent}
      rows={grid.rows}
    />
  );
}
```

Supported aggregate operations:
- `sum` - Sum of values
- `mean` / `avg` - Average of values
- `count` - Count of rows
- `min` - Minimum value
- `max` - Maximum value
- `median` - Median value
- `custom` - Custom aggregation function

## API Reference

### useArqueroGrid Hook

```typescript
function useArqueroGrid(props: UseArqueroGridProps): UseArqueroGridResult
```

#### Props

| Prop | Type | Description |
|------|------|-------------|
| `data` | `any[]` | Array of row objects |
| `columns` | `GridColumn[]` | Column definitions |
| `groupBy` | `string[]` | Columns to group by |
| `sortBy` | `SortSpec[]` | Initial sort configuration |
| `filters` | `Map<string, FilterSpec>` | Initial filters |
| `editable` | `boolean` | Enable cell editing (default: true) |
| `onCellChange` | `(col, row, old, new) => void` | Callback when cell changes |

#### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `columns` | `GridColumn[]` | Grid column definitions |
| `getCellContent` | `(cell: Item) => GridCell` | Get cell data |
| `onCellEdited` | `(cell, newValue) => void` | Handle cell edits |
| `rows` | `number` | Number of rows |
| `groups` | `RowGroup[]` | Group definitions |
| `filters` | `Map<string, FilterSpec>` | Active filters |
| `stagedCount` | `number` | Number of staged changes |
| `canUndo` | `boolean` | Whether undo is available |
| `canRedo` | `boolean` | Whether redo is available |
| `setFilter` | `(column, spec) => void` | Set a filter |
| `clearFilters` | `() => void` | Clear all filters |
| `commit` | `() => void` | Commit staged changes |
| `rollback` | `() => void` | Rollback staged changes |
| `undo` | `() => void` | Undo last change |
| `redo` | `() => boolean` | Redo last undone change |
| `toggleGroup` | `(key) => void` | Toggle group collapse |

### ArqueroGrid Class

```typescript
class ArqueroGrid {
  constructor(data?: any[])
  
  // Data access
  getCell(column: string, row: number): any
  setCell(column: string, row: number, value: any): void
  setData(data: any[]): void
  getView(): Table
  
  // History
  commit(): void
  rollback(): void
  undo(): void
  redo(): boolean
  get canUndo(): boolean
  get canRedo(): boolean
  get stagedCount(): number
  
  // Transformations
  setGroupBy(columns: string[]): void
  setSortBy(sort: SortSpec[]): void
  addSort(column: string, desc?: boolean): void
  removeSort(column: string): void
  setFilter(column: string, spec: FilterSpec | undefined): void
  clearFilters(): void
  
  // Grouping
  toggleGroup(key: string): void
  getGroupState(key: string): boolean
  buildGrouping(): GroupInfo[]
  
  // Aggregation
  setAggregates(aggregates: Record<string, AggregateSpec>): void
  getAggregatedData(): Table | null
}
```

### Types

```typescript
interface SortSpec {
  column: string;
  desc?: boolean;
}

interface FilterSpec {
  type: "equals" | "contains" | "gt" | "gte" | "lt" | "lte" | "in" | "custom";
  value?: any;
  values?: any[];
  predicate?: (value: any) => boolean;
}

interface AggregateSpec {
  op: "sum" | "mean" | "avg" | "count" | "min" | "max" | "median" | "custom";
  column?: string;
  fn?: (values: any[]) => any;
  as?: string;
}
```

## CSS

Import the required CSS for glide-data-grid:

```typescript
import '@glideapps/glide-data-grid/dist/index.css';
```

## License

MIT
