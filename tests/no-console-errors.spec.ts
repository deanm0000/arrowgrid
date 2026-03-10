import { test, expect, type Page } from '@playwright/test';
import { sampleRows } from '../src/sampleData';

const SAMPLE_DATA = sampleRows.map(row =>
  Object.values(row).map(v => String(v))
);

type ColumnLayout = {
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

type GridLayout = {
  columns: Record<string, ColumnLayout>;
  rows: { centerY: number }[];
};

async function getLayout(page: Page): Promise<GridLayout> {
  const layoutPromise = page.waitForEvent('console', msg =>
    msg.text().startsWith('__ARROWGRID_LAYOUT__')
  );
  await page.keyboard.press('Control+Shift+Alt+d');
  const msg = await layoutPromise;
  const json = msg.text().replace('__ARROWGRID_LAYOUT__ ', '');
  return JSON.parse(json);
}

async function copyColumn(page: Page, col: ColumnLayout, rows: GridLayout['rows'], context: any): Promise<string[]> {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.mouse.click(col.centerX, rows[0].centerY);
  await page.keyboard.down('Shift');
  await page.mouse.click(col.centerX, rows[rows.length - 1].centerY);
  await page.keyboard.up('Shift');
  await page.keyboard.press('Control+C');
  await page.waitForTimeout(100);
  const text = await page.evaluate(() => navigator.clipboard.readText());
  return text.split('\n');
}

function parseValue(s: string): number | string {
  const n = Number(s);
  return isNaN(n) ? s : n;
}

function isSortedAsc(values: string[]): boolean {
  const parsed = values.map(parseValue);
  return parsed.every((v, i) => i === 0 || parsed[i - 1] <= v);
}

function isSortedDesc(values: string[]): boolean {
  const parsed = values.map(parseValue);
  return parsed.every((v, i) => i === 0 || parsed[i - 1] >= v);
}

async function testSortForColumn(page: Page, col: ColumnLayout, colId: string, rows: GridLayout['rows'], context: any, skipColIds: Set<string> = new Set()) {
  if (skipColIds.has(colId)) return;
  const preSort = await copyColumn(page, col, rows, context);

  await page.mouse.click(col.header.ascX, col.header.ascY);
  await page.waitForTimeout(150);
  const layout2 = await getLayout(page);
  const colKey = Object.keys(layout2.columns).find(k => Math.abs(layout2.columns[k].centerX - col.centerX) < 2)!;
  const postAsc = await copyColumn(page, layout2.columns[colKey], layout2.rows, context);
  expect(isSortedAsc(postAsc)).toBe(true);

  await page.mouse.click(col.header.descX, col.header.descY);
  await page.waitForTimeout(150);
  const layout3 = await getLayout(page);
  const postDesc = await copyColumn(page, layout3.columns[colKey], layout3.rows, context);
  expect(isSortedDesc(postDesc)).toBe(true);

  // reset sort by clicking asc again (toggles off)
  await page.mouse.click(col.header.ascX, col.header.ascY);
  await page.waitForTimeout(150);
}

test('sort asc and desc works for all columns', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByTestId('data-grid-canvas').waitFor({ state: 'visible' });

  const layout = await getLayout(page);
  for (const [colId, col] of Object.entries(layout.columns)) {
    await testSortForColumn(page, col, colId, layout.rows, context);
  }

  expect(errors).toEqual([]);
});

test('sort asc and desc works for all columns after groupBy category', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByTestId('data-grid-canvas').waitFor({ state: 'visible' });

  const layout = await getLayout(page);
  await page.mouse.click(layout.columns['category'].header.menuX, layout.columns['category'].header.menuY);
  await page.getByText('Group by column').waitFor({ state: 'visible' });
  await page.getByText('Group by column').click();
  await page.waitForTimeout(200);

  const layoutAfter = await getLayout(page);
  const groupedCols = new Set(['category']);
  for (const [colId, col] of Object.entries(layoutAfter.columns)) {
    await testSortForColumn(page, col, colId, layoutAfter.rows, context, groupedCols);
  }

  expect(errors).toEqual([]);
});

test('copy full data range matches source data', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByTestId('data-grid-canvas').waitFor({ state: 'visible' });

  const layout = await getLayout(page);
  const cols = Object.values(layout.columns);
  const rows = layout.rows;

  await page.mouse.click(cols[0].centerX, rows[0].centerY);
  await page.keyboard.down('Shift');
  await page.mouse.click(cols[cols.length - 1].centerX, rows[rows.length - 1].centerY);
  await page.keyboard.up('Shift');

  await page.keyboard.press('Control+C');
  await page.waitForTimeout(100);

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  const parsed = clipboardText.split('\n').map(row => row.split('\t'));

  expect(parsed).toEqual(SAMPLE_DATA);
  expect(errors).toEqual([]);
});
