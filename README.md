# ArrowGrid

A TypeScript library that combines [glide-data-grid](https://github.com/glideapps/glide-data-grid) with [arquero](https://github.com/uwdata/arquero) to provide data grid functionality with grouping, sorting, <s>filtering</s> (not yet), and aggregation features. This is in alpha mode and much of it is done with the assistance of gpt 5.2, claude sonnet/opus4.6, and big pickle through opencode. As an incidental aside, big pickle is way better than gpt5.2 and isn't really noticeably worse than claude.

## Basic Usage


## In browser 

![Actual browser usage](/arrowglide.gif)

## Code

```tsx
import {useState, useMemo, useCallback}  from 'react';
import { createRoot } from 'react-dom/client';
import { ColumnTable, from } from 'arquero';
import { ArqueroGrid } from './react/ArqueroGrid';
import '@glideapps/glide-data-grid/dist/index.css';

const sampleData = from([
  { name: 'Alice', value: 100, category: 'A', region: 'North', weight: 1.0 },
  { name: 'Bob', value: 200, category: 'B', region: 'South', weight: 1.5 },
  { name: 'Charlie', value: 150, category: 'A', region: 'North', weight: 2.0 },
  { name: 'Diana', value: 300, category: 'C', region: 'East', weight: 1.2 },
  { name: 'Eve', value: 250, category: 'B', region: 'West', weight: 0.8 },
  { name: 'Frank', value: 175, category: 'A', region: 'South', weight: 1.1 },
  { name: 'Grace', value: 225, category: 'C', region: 'North', weight: 1.3 },
  { name: 'Henry', value: 190, category: 'B', region: 'East', weight: 2.1 },
]);

function App() {

  const [data, setData] = useState<ColumnTable>(sampleData);

  const groupBy:string[] = [];

  const filters = useMemo(() => [], []);

  const editable = useMemo(
    () => ({
      name: true,
      value: true,
      region: true,
      category: false,
      weight: true,
    }),
    []
  );

  // These don't do anything yet
  const onDataChange = useCallback((newTable: ColumnTable) => {
    console.log('Data changed:', newTable.objects());
    setData(newTable);
  }, []);

  const onCellChange = useCallback(
    (col: string, row: number, oldVal: unknown, newVal: unknown) => {
      console.log(`Cell changed: ${col}[${row}] from ${oldVal} to ${newVal}`);
    },
    []
  );

  return (
    <>
      <div className="grid-container">
        <ArqueroGrid
          data={data}
          groupBy={groupBy}
          filters={filters}
          editable={editable}
          onDataChange={onDataChange}
          onCellChange={onCellChange}
        />
      </div>
    </>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);

```





## License

MIT
