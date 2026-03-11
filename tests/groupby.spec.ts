import { test, expect } from '@playwright/test';
import { getLayout, copyColumn, setupErrorTracking, WAIT_MEDIUM, WAIT_SHORT } from './helpers';

test('boolean column count and distinct aggregates return numbers in groupBy mode', async ({ page, context }) => {
  const errors = setupErrorTracking(page);

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByTestId('data-grid-canvas').waitFor({ state: 'visible' });

  const layout = await getLayout(page);

  await page.mouse.click(layout.columns['category'].header.menuX, layout.columns['category'].header.menuY);
  await page.getByText('Group by column').waitFor({ state: 'visible' });
  await page.getByText('Group by column').click();
  await page.waitForTimeout(WAIT_MEDIUM);

  const layout2 = await getLayout(page);
  const activeColKey = Object.keys(layout2.columns).find(k => k.startsWith('active') || k.includes('active'));
  expect(activeColKey, `No active column found in: ${Object.keys(layout2.columns).join(',')}`).toBeDefined();
  const activeCol = layout2.columns[activeColKey!];
  await page.mouse.click(activeCol.header.menuX, activeCol.header.menuY);
  const menu1 = page.locator('div[style*="z-index"]', { hasText: 'count' });
  await menu1.getByText('count').waitFor({ state: 'visible' });
  await menu1.getByText('count').click();
  await page.waitForTimeout(WAIT_MEDIUM);

  const layout3 = await getLayout(page);
  const countColId = Object.keys(layout3.columns).find(k => k.includes('count'));
  expect(countColId).toBeDefined();

  const countVals = await copyColumn(page, layout3.columns[countColId!], layout3.rows, context);
  expect(countVals.every(v => !isNaN(Number(v)) && v !== 'true' && v !== 'false'),
    `count aggregate returned non-numeric: ${countVals.join(',')}`).toBe(true);
  expect(countVals.every(v => Number(v) > 0)).toBe(true);

  const activeColKey2 = Object.keys(layout3.columns).find(k => k.startsWith('active') || k.includes('active'));
  const activeCol2 = layout3.columns[activeColKey2!];
  await page.mouse.click(activeCol2.header.menuX, activeCol2.header.menuY);
  await page.waitForTimeout(WAIT_SHORT);
  const distinctItem = page.locator('div[style*="cursor: pointer"]', { hasText: /^(✓ )?distinct$/ }).last();
  await distinctItem.waitFor({ state: 'visible' });
  await distinctItem.click();
  await page.waitForTimeout(WAIT_MEDIUM);

  const layout4 = await getLayout(page);
  const distinctColId = Object.keys(layout4.columns).find(k => k.includes('distinct'));
  expect(distinctColId).toBeDefined();

  const distinctVals = await copyColumn(page, layout4.columns[distinctColId!], layout4.rows, context);
  expect(distinctVals.every(v => !isNaN(Number(v)) && v !== 'true' && v !== 'false'),
    `distinct aggregate returned non-numeric: ${distinctVals.join(',')}`).toBe(true);

  expect(errors).toEqual([]);
});
