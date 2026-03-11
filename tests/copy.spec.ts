import { test, expect } from '@playwright/test';
import {
  getLayout, copyColumn, openFormatMenu, setupErrorTracking,
  sampleRows, SAMPLE_DATA, WAIT_SHORT, WAIT_FORMAT,
} from './helpers';

test('copy full data range matches source data', async ({ page, context }) => {
  const errors = setupErrorTracking(page);

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByTestId('data-grid-canvas').waitFor({ state: 'visible' });

  const layout = await getLayout(page);
  const cols = Object.values(layout.columns);
  const rows = layout.rows;

  await page.mouse.click(cols[0].centerX, rows[0].centerY);
  await page.keyboard.press('Control+Shift+End');
  await page.waitForTimeout(WAIT_SHORT);

  await page.keyboard.press('Control+C');
  await page.waitForTimeout(WAIT_SHORT);

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  const parsed = clipboardText.split('\n').map(row => row.split('\t'));

  expect(parsed).toEqual(SAMPLE_DATA);
  expect(errors).toEqual([]);
});

test('number currency format: copy returns raw values', async ({ page, context }) => {
  const errors = setupErrorTracking(page);

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByTestId('data-grid-canvas').waitFor({ state: 'visible' });

  const layout = await getLayout(page);
  const valueCol = layout.columns['value'];

  const formatMenu = await openFormatMenu(page, valueCol);
  await formatMenu.locator('select').first().selectOption('currency');
  await formatMenu.locator('select').nth(1).selectOption('2');
  await page.waitForTimeout(WAIT_FORMAT);

  const layout2 = await getLayout(page);
  const values = await copyColumn(page, layout2.columns['value'], layout2.rows, context);

  const expectedValues = sampleRows.map(r => String(r.value));
  expect(values).toEqual(expectedValues);
  expect(errors).toEqual([]);
});

test('all number formats: copy returns raw values without corruption', async ({ page, context }) => {
  const errors = setupErrorTracking(page);

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByTestId('data-grid-canvas').waitFor({ state: 'visible' });

  const formats = ['general', 'decimal', 'currency', 'accounting', 'percentage', 'scientific'];

  for (const format of formats) {
    const l0 = await getLayout(page);
    const formatMenu = await openFormatMenu(page, l0.columns['value']);
    await formatMenu.locator('select').first().selectOption(format);
    const needsDecimals = format === 'decimal' || format === 'currency' || format === 'accounting';
    if (needsDecimals) {
      await formatMenu.locator('select').nth(1).selectOption('2');
    }
    await page.waitForTimeout(WAIT_FORMAT);

    const l = await getLayout(page);
    const vals = await copyColumn(page, l.columns['value'], l.rows, context);

    expect(vals.every(v => !v.includes('\u0000')), `format=${format} contains null bytes`).toBe(true);

    const aliceRaw = sampleRows[0].value;
    const alice = vals.find(v => Number(v) === aliceRaw);
    expect(alice, `format=${format}: copy should return raw value ${aliceRaw}, got: ${vals.join(',')}`).toBeDefined();
  }

  expect(errors).toEqual([]);
});
