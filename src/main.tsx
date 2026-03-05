import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { from, Table } from 'arquero';
import { DataEditor } from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { useArqueroGrid } from './react/useArqueroGrid';

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
  const [data, setData] = useState<any>(sampleData);

  const grid = useArqueroGrid({
    data,
    groupBy: [],
    sortBy: [{ column: 'value', desc: false }],
    filters: [],
    editable: {
      name: true,
      value: true,
      region: true,
      category: false,
      weight: true,
    },
    onDataChange: (newTable) => {
      console.log('Data changed:', newTable.objects());
      setData(newTable);
    },
    onCellChange: (col, row, oldVal, newVal) => {
      console.log(`Cell changed: ${col}[${row}] from ${oldVal} to ${newVal}`);
    },
  });

  return (
    <>
      <div className="toolbar">
        <button onClick={grid.undo} disabled={!grid.canUndo}>Undo</button>
        <button onClick={grid.redo} disabled={!grid.canRedo}>Redo</button>
        <button onClick={grid.commit}>Commit ({grid.stagedCount} staged)</button>
        <button onClick={grid.rollback}>Rollback</button>
        <span style={{ marginLeft: 'auto' }}>
          Rows: {grid.rows}
        </span>
      </div>
      <div className="grid-container">
        <DataEditor
          columns={grid.columns}
          getCellContent={grid.getCellContent}
          onCellEdited={grid.onCellEdited}
          rows={grid.rows}
          className="grid-editor"
        />
      </div>
    </>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
