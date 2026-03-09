# ArrowGrid

A TypeScript library that combines [glide-data-grid](https://github.com/glideapps/glide-data-grid) with [arquero](https://github.com/uwdata/arquero) to provide data grid functionality with grouping, sorting, <s>filtering</s> (not yet), and aggregation features. This is in alpha stage and much of it is done with the assistance of gpt 5.2, claude sonnet/opus4.6, and big pickle through opencode. As an incidental aside, big pickle is way better than gpt5.2 and isn't really noticeably worse than claude.

After trying other react grids that weren't so fast I decided to add the features that [glide](https://docs.grid.glideapps.com/) doesn't have. As a big proponent of all things arrow, I decided to marry glide with [arquero](https://idl.uw.edu/arquero/). One of these days maybe I'll try to make the engine in rust-wasm and use something like datafusion or polars instead of arquero.

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

## Status

There's still quite a bit to do, in particular with formatting and styles. I'm pretty happy with the sorting, grouping, and expanding of the groups. 

Other features to do: 

* change the format from the column menu. 
* multi-column sort
* sort of raw groups when expanded from being grouped
* filter
* copy paste
* export to excel (via rust_xlsxwriter and wasm)
* make interface to use edits

Not planned features:

* lazy loading (ie by page, etc)

Maybe one day features:

* use rust/wasm based data engine instead of js based arquero




## Thanks 

to @snowyowl for [this snippet](https://discord.com/channels/1006981052516016198/1006981052960620624/1480515696264872066)
```tsx
import React from 'react'
import { TopLevelHeaderColumn, WrapperColumnDictionary } from './inner-types'
import { DataEditorRef, GridColumn, Theme } from '@glideapps/glide-data-grid'
import { WrapperColumn } from './wrapper-types'
import { RowMarkerOptions } from '@glideapps/glide-data-grid/dist/dts/data-editor/data-editor'

export function useTopLevelHeader<T>(
    dataEditorRef: DataEditorRef | null,
    containerRef: HTMLElement | null,
    topLevelHeaderScrollRef: HTMLElement | null,
    columns: WrapperColumn<T>[],
    columnDictionary: WrapperColumnDictionary<T>,
    columnsInner: readonly GridColumn[],
    freezeColumns: number | undefined,
    theme: Partial<Theme>,
    rowMarkers: RowMarkerOptions['kind'] | RowMarkerOptions | undefined,
) {
    const dataGridScrollRef = React.useRef<HTMLDivElement | null>(null)
    const scrollListener = React.useCallback(() => {
        if (!topLevelHeaderScrollRef) return
        topLevelHeaderScrollRef.scrollLeft = dataGridScrollRef.current?.scrollLeft ?? 0
    }, [topLevelHeaderScrollRef])
    React.useEffect(() => {
        if (containerRef == null) return
        const handleMutation: MutationCallback = (_mutationsList, observer) => {
            const scrollInner = containerRef!.querySelector<HTMLDivElement>('.dvn-scroller.dgw-data-editor')
            if (!scrollInner) return
            observer.disconnect()
            dataGridScrollRef.current = scrollInner
            dataGridScrollRef.current!.addEventListener('scroll', scrollListener)
        }
        const observer = new MutationObserver(handleMutation)
        observer.observe(containerRef!, { childList: true, subtree: true })
        return () => {
            observer.disconnect()
            dataGridScrollRef.current?.removeEventListener('scroll', scrollListener)
        }
    }, [containerRef, scrollListener])
    const topLevelHeaderColumns = React.useMemo<TopLevelHeaderColumn[][]>(() => {
        if (columnsInner.length === 0 || dataEditorRef == null) return []
        const levels = columns.reduce((l, column) => Math.max(l, column.group?.length ?? 0), 0)
        if (levels < 2) return []
        const result: TopLevelHeaderColumn[][] = Array.from({ length: levels - 1 }, () => [])
        columnsInner.forEach((columnInner, index) => {
            const column = columnDictionary[columnInner.id!]
            Array.from({ length: levels - 1 }, (_, i) => i).forEach((level) => {
                const title = column.column.group ? column.column.group[level + 1] ?? '' : ''
                let header: TopLevelHeaderColumn
                if (index == 0 || index == freezeColumns || result[level].slice(-1)[0].title !== title) {
                    header = {
                        title: title,
                        width: 0,
                        freezeColumn: freezeColumns != undefined && index < freezeColumns,
                    }
                    result[level].push(header)
                } else {
                    header = result[level].slice(-1)[0]
                }
                if (column.column.width !== undefined) {
                    header.width = header.width + column.column.width
                } else {
                    const width = dataEditorRef?.getBounds(index)?.width
                    header.width = header.width + (width != undefined && !isNaN(width) ? width - 1 : 0)
                }
            })
        })
        const markerColumnWidth =
            rowMarkers != undefined &&
            ((typeof rowMarkers == 'string' && rowMarkers !== 'none') ||
                (typeof rowMarkers == 'object' && rowMarkers.kind != 'none'))
                ? dataEditorRef?.getBounds(-1)?.width ?? 0
                : 0
        if (markerColumnWidth != 0 && !isNaN(markerColumnWidth)) {
            result.forEach((l) => {
                l.unshift({
                    title: '',
                    width: markerColumnWidth,
                    freezeColumn: true,
                })
            })
        } else {
            result.forEach((level) => {
                level[0].width = level[0].width + 1
                const last = level.slice(-1)[0]
                last.width = last.width - 1
            })
        }
        result.reverse()
        return result
    }, [columnsInner, dataEditorRef, columns, columnDictionary, freezeColumns, rowMarkers])
    React.useEffect(() => {
        if (!topLevelHeaderScrollRef || !theme) return
        topLevelHeaderScrollRef.style.setProperty('--dgw-top-level-header-hover-bg', theme.bgHeaderHovered ?? '')
        topLevelHeaderScrollRef.style.setProperty('--dgw-top-level-header-bg', theme.bgHeader ?? '')
    }, [theme, topLevelHeaderScrollRef])
    return {
        topLevelHeaderColumns,
    }
}

type TopLevelHeaderInnerProps = {
    readonly topLevelHeaderColumns: TopLevelHeaderColumn[][]
    readonly groupHeaderHeight: number
    readonly theme: Partial<Theme>
    readonly displayFreezeColumns: boolean
    readonly stickyLeft: number
    readonly width: number
}
const TopLevelHeaderInner: React.FC<TopLevelHeaderInnerProps> = (props) => {
    const { topLevelHeaderColumns, groupHeaderHeight, theme, displayFreezeColumns, stickyLeft, width } = props
    return (
        <div
            style={{
                width: width,
                ...(displayFreezeColumns ? { position: 'sticky', left: 0, zIndex: 2 } : { zIndex: 1 }),
            }}
        >
            {topLevelHeaderColumns.map((topColumns, level) => {
                return (
                    <div key={level}>
                        {topColumns
                            .filter((column) => column.freezeColumn == displayFreezeColumns)
                            .map((column, n) => {
                                return (
                                    <div
                                        className='dgw-top-level-header-column'
                                        key={`${level}${n}`}
                                        style={{
                                            width: column.width,
                                            height: groupHeaderHeight,
                                            color: theme.textHeader,
                                            font: `${theme.headerFontStyle} ${theme.fontFamily}`,
                                            borderRight: `solid 1px ${theme.borderColor}`,
                                            borderBottom: `solid 1px ${theme.borderColor}`,
                                        }}
                                    >
                                        <span style={{ left: stickyLeft + 8 }}>{column.title}</span>
                                    </div>
                                )
                            })}
                    </div>
                )
            })}
        </div>
    )
}

type TopLevelHeaderProps = {
    readonly topLevelHeaderColumns: TopLevelHeaderColumn[][]
    readonly groupHeaderHeight: number
    readonly theme: Partial<Theme>
}

const TopLevelHeader = React.forwardRef<HTMLDivElement, TopLevelHeaderProps>((props, ref) => {
    const { topLevelHeaderColumns, groupHeaderHeight, theme } = props
    const freezeColumnsWidth = React.useMemo(() => {
        return topLevelHeaderColumns[0]
            ?.filter((column) => column.freezeColumn)
            .map((column) => column.width)
            .reduce((sum, width) => sum + width, 0)
    }, [topLevelHeaderColumns])
    const columnsWidth = React.useMemo(() => {
        return topLevelHeaderColumns[0]
            ?.filter((column) => !column.freezeColumn)
            .map((column) => column.width)
            .reduce((sum, width) => sum + width, 0)
    }, [topLevelHeaderColumns])
    return (
        <div ref={ref} className='dgw-top-level-header'>
            <TopLevelHeaderInner
                topLevelHeaderColumns={topLevelHeaderColumns}
                groupHeaderHeight={groupHeaderHeight}
                theme={theme}
                displayFreezeColumns={true}
                stickyLeft={0}
                width={freezeColumnsWidth}
            />
            <TopLevelHeaderInner
                topLevelHeaderColumns={topLevelHeaderColumns}
                groupHeaderHeight={groupHeaderHeight}
                theme={theme}
                displayFreezeColumns={false}
                stickyLeft={freezeColumnsWidth}
                width={columnsWidth}
            />
        </div>
    )
})
TopLevelHeader.displayName = 'TopLevelHeader'
export { TopLevelHeader }
```

It allows my group header row to be centered and eventually have buttons to it since glide's group header is just flatly drawn with no customization.




## License

MIT
