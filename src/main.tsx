import {useState, useMemo, useCallback}  from 'react';
import { createRoot } from 'react-dom/client';
import { ColumnTable, from } from 'arquero';
import { ArqueroGrid } from './react/ArqueroGrid';
import { sampleRows } from './sampleData';
import '@glideapps/glide-data-grid/dist/index.css';

const sampleData = from(sampleRows);


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
          // backgroundColor={["#03f83c", "#b1f8c1"]}
        />
      </div>
    </>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
