# ArrowGrid

A TypeScript library that combines [glide-data-grid](https://github.com/glideapps/glide-data-grid) with [arquero](https://github.com/uwdata/arquero) to provide data grid functionality with grouping, sorting, filtering, and aggregation features.

## Basic Usage

```tsx
import { useArqueroGrid } from 'arrowgrid';
import { table } from 'arquero';
import { DataEditor } from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';

function App() {
  const data = table([
    { name: 'Alice', value: 100, category: 'A' },
    { name: 'Bob', value: 200, category: 'B' },
    { name: 'Charlie', value: 150, category: 'A' },
  ]);

  const grid = useArqueroGrid({
    data,
    editable: true,
    onDataChange: (newTable) => {
      console.log('New data:', newTable.objects());
    },
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

Enable row grouping by specifying columns to group by. When grouped, editing is disabled (no 1:1 relationship between display rows and data rows):

```tsx
function GroupedGrid() {
  const data = table([
    { name: 'Alice', value: 100, category: 'A', region: 'North' },
    { name: 'Bob', value: 200, category: 'B', region: 'South' },
    { name: 'Charlie', value: 150, category: 'A', region: 'North' },
  ]);

  const grid = useArqueroGrid({
    data,
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
  const data = table([
    { name: 'Alice', value: 100, category: 'A' },
    { name: 'Bob', value: 200, category: 'B' },
    { name: 'Charlie', value: 150, category: 'A' },
  ]);

  const grid = useArqueroGrid({
    data,
    groupBy: ['category'],
  });

  const handleGroupToggle = (groupKey: string) => {
    grid.toggleGroup(groupKey);
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
  const data = table([
    { name: 'Alice', value: 100, category: 'A' },
    { name: 'Bob', value: 200, category: 'B' },
    { name: 'Charlie', value: 150, category: 'A' },
  ]);

  const grid = useArqueroGrid({
    data,
    sortBy: [
      { column: 'value', desc: true },  // Sort by value descending
    ],
  });

  return (
    <DataEditor
      columns={grid.columns}
      getCellContent={grid.getCellContent}
      rows={grid.rows}
    />
  );
}
```

## Filtering

Filter data by column values using an array of filter specs:

```tsx
function FilteredGrid() {
  const data = table([
    { name: 'Alice', value: 100, category: 'A' },
    { name: 'Bob', value: 200, category: 'B' },
    { name: 'Charlie', value: 150, category: 'A' },
  ]);

  const grid = useArqueroGrid({
    data,
    filters: [
      { column: 'category', op: '==', value: 'A' },
      { column: 'value', op: '>', value: 100 },
    ],
  });

  return (
    <DataEditor
      columns={grid.columns}
      getCellContent={grid.getCellContent}
      rows={grid.rows}
    />
  );
}
```

Filter operators available:
- `==` - Equals
- `!=` - Not equals
- `>` - Greater than
- `<` - Less than
- `>=` - Greater or equal
- `<=` - Less or equal
- `contains` - Substring match
- `startsWith` - Starts with
- `endsWith` - Ends with
- `in` - Match any value in a list

Compare to another column:
```tsx
{ column: 'value', op: '>', otherColumn: 'limit' }
```

Custom predicate function:
```tsx
{ expr: (d) => d.value > 0 && d.value < 100 }
```

## Editing with Undo/Redo

Changes are staged until explicitly committed. When `commit()` is called, the `onDataChange` callback receives the updated table with all edits applied:

```tsx
function EditableGridWithHistory() {
  const [data, setData] = useState(() => table([
    { name: 'Alice', value: 100, category: 'A' },
    { name: 'Bob', value: 200, category: 'B' },
  ]));

  const grid = useArqueroGrid({
    data,
    editable: true,
    onDataChange: (newTable) => {
      setData(newTable);
    },
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
2. Call `grid.commit()` to save all staged changes and call `onDataChange` with the new table
3. Call `grid.rollback()` to discard all staged changes
4. Use `grid.undo()` / `grid.redo()` to navigate the edit history

### Per-Column Editability

Control which columns are editable:

```tsx
const grid = useArqueroGrid({
  data,
  editable: {
    name: true,   // editable
    value: true,  // editable
    category: false,  // not editable
  },
});
```

Or enable/disable all editing:
```tsx
const grid = useArqueroGrid({
  data,
  editable: false,  // nothing editable
});
```

Note: When `groupBy` is set, all editing is disabled regardless of this setting.

## Aggregation

Combine grouping with aggregation functions:

```tsx
function AggregatedGrid() {
  const data = table([
    { name: 'Alice', value: 100, weight: 1, category: 'A' },
    { name: 'Bob', value: 200, weight: 2, category: 'B' },
    { name: 'Charlie', value: 150, weight: 1, category: 'A' },
  ]);

  const grid = useArqueroGrid({
    data,
    groupBy: ['category'],
    aggregates: {
      totalValue: { op: 'sum', column: 'value' },
      avgValue: { op: 'mean', column: 'value', as: 'avg' },
      count: { op: 'count', as: 'rowCount' },
      weightedAvg: { op: 'weightedAvg', column: 'value', weightColumn: 'weight' },
    },
  });

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
- `weightedAvg` - Weighted average using `sum(value * weightColumn) / sum(weightColumn)`
- `custom` - Custom aggregation function

## API Reference

### useArqueroGrid Hook

```typescript
function useArqueroGrid(props: UseArqueroGridProps): UseArqueroGridResult
```

#### Props

| Prop | Type | Description |
|------|------|-------------|
| `data` | `Table` | Arquero table |
| `groupBy` | `string[]` | Columns to group by |
| `sortBy` | `SortSpec[]` | Initial sort configuration |
| `filters` | `FilterSpec[]` | Initial filters (array) |
| `aggregates` | `Record<string, AggregateSpec>` | Aggregation config |
| `editable` | `boolean \| Record<string, boolean>` | Editability (default: false) |
| `onCellChange` | `(col, row, old, new) => void` | Callback when cell changes |
| `onDataChange` | `(newTable: Table) => void` | Callback when commit is called |

#### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `columns` | `GridColumn[]` | Grid column definitions |
| `getCellContent` | `(cell: Item) => GridCell` | Get cell data |
| `onCellEdited` | `(cell, newValue) => void` | Handle cell edits |
| `rows` | `number` | Number of rows |
| `groups` | `RowGroup[]` | Group definitions |
| `filters` | `FilterSpec[]` | Active filters |
| `setFilter` | `(filter: FilterSpec) => void` | Add a filter |
| `removeFilter` | `(index: number) => void` | Remove a filter |
| `clearFilters` | `() => void` | Clear all filters |
| `stagedCount` | `number` | Number of staged changes |
| `canUndo` | `boolean` | Whether undo is available |
| `canRedo` | `boolean` | Whether redo is available |
| `commit` | `() => void` | Commit staged changes |
| `rollback` | `() => void` | Rollback staged changes |
| `undo` | `() => void` | Undo last change |
| `redo` | `() => boolean` | Redo last undone change |
| `toggleGroup` | `(key) => void` | Toggle group collapse |

### Types

```typescript
interface SortSpec {
  column: string;
  desc?: boolean;
}

interface FilterSpec {
  column?: string;
  op?: string;
  value?: any;
  otherColumn?: string;
  expr?: (d: any) => boolean;
}

interface AggregateSpec {
  op: "sum" | "mean" | "avg" | "count" | "min" | "max" | "median" | "weightedAvg" | "custom";
  column?: string;
  weightColumn?: string;
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
