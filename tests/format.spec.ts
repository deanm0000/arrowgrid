import { test, expect } from '@playwright/test';
import {
  getLayout, copyColumn, openFormatMenu, closeMenu, setupErrorTracking,
  sampleRows, WAIT_FORMAT,
} from './helpers';

function addThousandSeps(intPart: string): string {
  let result = '';
  const len = intPart.length;
  for (let i = 0; i < len; i++) {
    if (i > 0 && (len - i) % 3 === 0) result += ',';
    result += intPart[i];
  }
  return result;
}

function expectedGeneral(v: number) { return String(v); }
function expectedDecimal(v: number, d: number) { return v.toFixed(d); }
function expectedCurrency(v: number, d: number) {
  const abs = Math.abs(v);
  const fixed = abs.toFixed(d);
  const [intPart, decPart] = fixed.split('.');
  const withSeps = addThousandSeps(intPart);
  const formatted = decPart !== undefined ? withSeps + '.' + decPart : withSeps;
  return (v < 0 ? '-$' : '$') + formatted;
}
function expectedAccounting(v: number, d: number) {
  const abs = Math.abs(v);
  const fixed = abs.toFixed(d);
  const [intPart, decPart] = fixed.split('.');
  const withSeps = addThousandSeps(intPart);
  const numStr = decPart !== undefined ? withSeps + '.' + decPart : withSeps;
  return v < 0 ? '(' + numStr + ')' : numStr;
}
function expectedPercentage(v: number) { return (v * 100).toFixed(0) + '%'; }
function expectedScientific(v: number) { return v.toExponential(2).toUpperCase(); }

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function pad2(n: number) { return n < 10 ? '0' + n : String(n); }
function expectedIso(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function expectedMmDdYyyy(d: Date) {
  return `${pad2(d.getMonth()+1)}-${pad2(d.getDate())}-${d.getFullYear()}`;
}
function expectedMmmDdYyyy(d: Date) {
  return `${MONTH_ABBR[d.getMonth()]}-${pad2(d.getDate())}-${d.getFullYear()}`;
}
function expectedMmDdYyyyHhMm(d: Date) {
  return `${pad2(d.getMonth()+1)}-${pad2(d.getDate())}-${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const sampleValues = sampleRows.map(r => r.value);
const sampleDates = sampleRows.map(r => r.date);
const sampleBooleans = sampleRows.map(r => r.active);

test.describe('formatted copy with ?testcopy=1', () => {

  test.describe('number formats', () => {
    const DECIMALS = '2';

    test('general', async ({ page, context }) => {
      const errors = setupErrorTracking(page);
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto('/?testcopy=1');
      await page.getByTestId('data-grid-canvas').waitFor({ state: 'visible' });

      const layout = await getLayout(page);
      const formatMenu = await openFormatMenu(page, layout.columns['value']);
      await formatMenu.locator('select').first().selectOption('general');
      await page.waitForTimeout(WAIT_FORMAT);
      await closeMenu(page);

      const l = await getLayout(page);
      const { values: vals, visibleRows } = await copyColumn(page, l.columns['value'], l.rows, context, l.containerBounds);
      expect(vals).toEqual(sampleValues.slice(visibleRows[0], visibleRows.at(-1)! + 1).map(v => expectedGeneral(v)));
      expect(errors).toEqual([]);
    });

    test('decimal', async ({ page, context }) => {
      const errors = setupErrorTracking(page);
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto('/?testcopy=1');
      await page.getByTestId('data-grid-canvas').waitFor({ state: 'visible' });

      const layout = await getLayout(page);
      const formatMenu = await openFormatMenu(page, layout.columns['value']);
      await formatMenu.locator('select').first().selectOption('decimal');
      await formatMenu.locator('select').nth(1).selectOption(DECIMALS);
      await page.waitForTimeout(WAIT_FORMAT);
      await closeMenu(page);

      const l = await getLayout(page);
      const { values: vals, visibleRows } = await copyColumn(page, l.columns['value'], l.rows, context, l.containerBounds);
      expect(vals).toEqual(sampleValues.slice(visibleRows[0], visibleRows.at(-1)! + 1).map(v => expectedDecimal(v, 2)));
      expect(errors).toEqual([]);
    });

    test('currency', async ({ page, context }) => {
      const errors = setupErrorTracking(page);
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto('/?testcopy=1');
      await page.getByTestId('data-grid-canvas').waitFor({ state: 'visible' });

      const layout = await getLayout(page);
      const formatMenu = await openFormatMenu(page, layout.columns['value']);
      await formatMenu.locator('select').first().selectOption('currency');
      await formatMenu.locator('select').nth(1).selectOption(DECIMALS);
      await page.waitForTimeout(WAIT_FORMAT);
      await closeMenu(page);

      const l = await getLayout(page);
      const { values: vals, visibleRows } = await copyColumn(page, l.columns['value'], l.rows, context, l.containerBounds);
      expect(vals).toEqual(sampleValues.slice(visibleRows[0], visibleRows.at(-1)! + 1).map(v => expectedCurrency(v, 2)));
      expect(errors).toEqual([]);
    });

    test('accounting (no $ in copy)', async ({ page, context }) => {
      const errors = setupErrorTracking(page);
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto('/?testcopy=1');
      await page.getByTestId('data-grid-canvas').waitFor({ state: 'visible' });

      const layout = await getLayout(page);
      const formatMenu = await openFormatMenu(page, layout.columns['value']);
      await formatMenu.locator('select').first().selectOption('accounting');
      await formatMenu.locator('select').nth(1).selectOption(DECIMALS);
      await page.waitForTimeout(WAIT_FORMAT);
      await closeMenu(page);

      const l = await getLayout(page);
      const { values: vals, visibleRows } = await copyColumn(page, l.columns['value'], l.rows, context, l.containerBounds);
      expect(vals).toEqual(sampleValues.slice(visibleRows[0], visibleRows.at(-1)! + 1).map(v => expectedAccounting(v, 2)));
      expect(errors).toEqual([]);
    });

    test('percentage', async ({ page, context }) => {
      const errors = setupErrorTracking(page);
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto('/?testcopy=1');
      await page.getByTestId('data-grid-canvas').waitFor({ state: 'visible' });

      const layout = await getLayout(page);
      const formatMenu = await openFormatMenu(page, layout.columns['value']);
      await formatMenu.locator('select').first().selectOption('percentage');
      await page.waitForTimeout(WAIT_FORMAT);
      await closeMenu(page);

      const l = await getLayout(page);
      const { values: vals, visibleRows } = await copyColumn(page, l.columns['value'], l.rows, context, l.containerBounds);
      expect(vals).toEqual(sampleValues.slice(visibleRows[0], visibleRows.at(-1)! + 1).map(v => expectedPercentage(v)));
      expect(errors).toEqual([]);
    });

    test('scientific', async ({ page, context }) => {
      const errors = setupErrorTracking(page);
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto('/?testcopy=1');
      await page.getByTestId('data-grid-canvas').waitFor({ state: 'visible' });

      const layout = await getLayout(page);
      const formatMenu = await openFormatMenu(page, layout.columns['value']);
      await formatMenu.locator('select').first().selectOption('scientific');
      await page.waitForTimeout(WAIT_FORMAT);
      await closeMenu(page);

      const l = await getLayout(page);
      const { values: vals, visibleRows } = await copyColumn(page, l.columns['value'], l.rows, context, l.containerBounds);
      expect(vals).toEqual(sampleValues.slice(visibleRows[0], visibleRows.at(-1)! + 1).map(v => expectedScientific(v)));
      expect(errors).toEqual([]);
    });
  });

  test.describe('date formats', () => {
    test('iso', async ({ page, context }) => {
      const errors = setupErrorTracking(page);
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto('/?testcopy=1');
      await page.getByTestId('data-grid-canvas').waitFor({ state: 'visible' });

      const layout = await getLayout(page);
      const formatMenu = await openFormatMenu(page, layout.columns['date']);
      await formatMenu.locator('select').selectOption('iso');
      await page.waitForTimeout(WAIT_FORMAT);
      await closeMenu(page);

      const l = await getLayout(page);
      const { values: vals, visibleRows } = await copyColumn(page, l.columns['date'], l.rows, context, l.containerBounds);
      expect(vals).toEqual(sampleDates.slice(visibleRows[0], visibleRows.at(-1)! + 1).map(d => expectedIso(d)));
      expect(errors).toEqual([]);
    });

    test('mm-dd-yyyy', async ({ page, context }) => {
      const errors = setupErrorTracking(page);
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto('/?testcopy=1');
      await page.getByTestId('data-grid-canvas').waitFor({ state: 'visible' });

      const layout = await getLayout(page);
      const formatMenu = await openFormatMenu(page, layout.columns['date']);
      await formatMenu.locator('select').selectOption('mm-dd-yyyy');
      await page.waitForTimeout(WAIT_FORMAT);
      await closeMenu(page);

      const l = await getLayout(page);
      const { values: vals, visibleRows } = await copyColumn(page, l.columns['date'], l.rows, context, l.containerBounds);
      expect(vals).toEqual(sampleDates.slice(visibleRows[0], visibleRows.at(-1)! + 1).map(d => expectedMmDdYyyy(d)));
      expect(errors).toEqual([]);
    });

    test('mmm-dd-yyyy', async ({ page, context }) => {
      const errors = setupErrorTracking(page);
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto('/?testcopy=1');
      await page.getByTestId('data-grid-canvas').waitFor({ state: 'visible' });

      const layout = await getLayout(page);
      const formatMenu = await openFormatMenu(page, layout.columns['date']);
      await formatMenu.locator('select').selectOption('mmm-dd-yyyy');
      await page.waitForTimeout(WAIT_FORMAT);
      await closeMenu(page);

      const l = await getLayout(page);
      const { values: vals, visibleRows } = await copyColumn(page, l.columns['date'], l.rows, context, l.containerBounds);
      expect(vals).toEqual(sampleDates.slice(visibleRows[0], visibleRows.at(-1)! + 1).map(d => expectedMmmDdYyyy(d)));
      expect(errors).toEqual([]);
    });

    test('mm-dd-yyyy-hh-mm', async ({ page, context }) => {
      const errors = setupErrorTracking(page);
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto('/?testcopy=1');
      await page.getByTestId('data-grid-canvas').waitFor({ state: 'visible' });

      const layout = await getLayout(page);
      const formatMenu = await openFormatMenu(page, layout.columns['date']);
      await formatMenu.locator('select').selectOption('mm-dd-yyyy-hh-mm');
      await page.waitForTimeout(WAIT_FORMAT);
      await closeMenu(page);

      const l = await getLayout(page);
      const { values: vals, visibleRows } = await copyColumn(page, l.columns['date'], l.rows, context, l.containerBounds);
      expect(vals).toEqual(sampleDates.slice(visibleRows[0], visibleRows.at(-1)! + 1).map(d => expectedMmDdYyyyHhMm(d)));
      expect(errors).toEqual([]);
    });
  });

  test.describe('boolean formats', () => {
    test('words', async ({ page, context }) => {
      const errors = setupErrorTracking(page);
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto('/?testcopy=1');
      await page.getByTestId('data-grid-canvas').waitFor({ state: 'visible' });

      const layout = await getLayout(page);
      const formatMenu = await openFormatMenu(page, layout.columns['active']);
      await formatMenu.locator('select').selectOption('words');
      await page.waitForTimeout(WAIT_FORMAT);
      await closeMenu(page);

      const l = await getLayout(page);
      const { values: vals, visibleRows } = await copyColumn(page, l.columns['active'], l.rows, context, l.containerBounds);
      expect(vals).toEqual(sampleBooleans.slice(visibleRows[0], visibleRows.at(-1)! + 1).map(b => b ? 'true' : 'false'));
      expect(errors).toEqual([]);
    });
  });
});
