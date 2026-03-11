import { type Page, type BrowserContext } from '@playwright/test';
import { sampleRows } from '../src/sampleData';

export { sampleRows };

export const WAIT_SHORT = 100;
export const WAIT_MEDIUM = 200;
export const WAIT_FORMAT = 150;

export type ColumnLayout = {
  centerX: number;
  header: {
    centerY: number;
    menuX: number;
    menuY: number;
    ascX: number;
    ascY: number;
    descX: number;
    descY: number;
  };
};

export type GridLayout = {
  columns: Record<string, ColumnLayout>;
  rows: { centerY: number }[];
  containerBounds: { top: number; bottom: number };
};

export type CopyResult = {
  values: string[];
  visibleRows: number[];
};

export async function getLayout(page: Page): Promise<GridLayout> {
  const layoutPromise = page.waitForEvent('console', msg =>
    msg.text().startsWith('__ARROWGRID_LAYOUT__')
  );
  await page.keyboard.press('Control+Shift+Alt+d');
  const msg = await layoutPromise;
  const json = msg.text().replace('__ARROWGRID_LAYOUT__ ', '');
  return JSON.parse(json);
}

export async function copyColumn(page: Page, col: ColumnLayout, rows: GridLayout['rows'], context: BrowserContext, containerBounds?: GridLayout['containerBounds']): Promise<CopyResult> {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  if (rows.length === 0) return { values: [], visibleRows: [] };
  const bounds = containerBounds ?? { top: 0, bottom: 9999 };
  const onScreenRows = rows
    .map((r, i) => ({ i, ...r }))
    .filter(r => r.centerY > bounds.top && r.centerY < bounds.bottom);
  if (onScreenRows.length === 0) return { values: [], visibleRows: [] };
  await page.mouse.click(col.centerX, onScreenRows[0].centerY);
  if (onScreenRows.length > 1) {
    await page.keyboard.down('Shift');
    await page.mouse.click(col.centerX, onScreenRows[onScreenRows.length - 1].centerY);
    await page.keyboard.up('Shift');
  }
  await page.keyboard.press('Control+C');
  await page.waitForTimeout(WAIT_SHORT);
  const text = await page.evaluate(() => navigator.clipboard.readText());
  return { values: text.split('\n'), visibleRows: onScreenRows.map(r => r.i) };
}

export function parseValue(s: string): number | string {
  const n = Number(s);
  return isNaN(n) ? s : n;
}

export function isSortedAsc(values: string[]): boolean {
  const parsed = values.map(parseValue);
  return parsed.every((v, i) => i === 0 || parsed[i - 1] <= v);
}

export function isSortedDesc(values: string[]): boolean {
  const parsed = values.map(parseValue);
  return parsed.every((v, i) => i === 0 || parsed[i - 1] >= v);
}

export const SKIP_SORT_COLS = new Set(['active', 'date']);

export async function testSortForColumn(page: Page, col: ColumnLayout, colId: string, rows: GridLayout['rows'], context: BrowserContext, skipColIds: Set<string> = new Set()) {
  const { expect } = await import('@playwright/test');
  if (skipColIds.has(colId) || SKIP_SORT_COLS.has(colId)) return;

  await page.mouse.click(col.header.ascX, col.header.ascY);
  await page.waitForTimeout(WAIT_FORMAT);
  const layout2 = await getLayout(page);
  const colKey = Object.keys(layout2.columns).find(k => Math.abs(layout2.columns[k].centerX - col.centerX) < 2)!;
  const { values: postAsc } = await copyColumn(page, layout2.columns[colKey], layout2.rows, context, layout2.containerBounds);
  expect(isSortedAsc(postAsc)).toBe(true);

  await page.mouse.click(col.header.descX, col.header.descY);
  await page.waitForTimeout(WAIT_FORMAT);
  const layout3 = await getLayout(page);
  const { values: postDesc } = await copyColumn(page, layout3.columns[colKey], layout3.rows, context, layout3.containerBounds);
  expect(isSortedDesc(postDesc)).toBe(true);

  await page.mouse.click(col.header.ascX, col.header.ascY);
  await page.waitForTimeout(WAIT_FORMAT);
}

export async function closeMenu(page: Page) {
  const canvas = page.getByTestId('data-grid-canvas');
  const box = await canvas.boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width - 5, box.y + box.height - 5);
  }
  await page.waitForTimeout(WAIT_SHORT);
}

export async function openFormatMenu(page: Page, col: ColumnLayout) {
  await page.mouse.click(col.header.menuX, col.header.menuY);
  await page.getByText('Value format ▶').waitFor({ state: 'visible' });
  await page.getByText('Value format ▶').click();
  await page.locator('div[style*="position: absolute"]').last().locator('select').first().waitFor({ state: 'visible' });
  return page.locator('div[style*="position: absolute"]').last();
}

export function setupErrorTracking(page: Page) {
  const errors: string[] = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));
  return errors;
}

function pad2(n: number) { return n < 10 ? '0' + n : String(n); }

export function formatDefaultDate(d: Date) {
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export const SAMPLE_DATA = sampleRows.map(row =>
  Object.values(row).map(v => {
    if (v instanceof Date) return formatDefaultDate(v);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  })
);
