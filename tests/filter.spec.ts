import { test, expect } from '@playwright/test';
import {
  getLayout, copyColumn, setupErrorTracking,
  sampleRows, WAIT_SHORT, WAIT_MEDIUM,
} from './helpers';

test('filter value column to some value only shows rows with that value', async ({ page, context }) => {
  const errors = setupErrorTracking(page);

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByTestId('data-grid-canvas').waitFor({ state: 'visible' });

  const layout = await getLayout(page);
  const valueCol = layout.columns['value'];

  await page.mouse.click(valueCol.header.menuX, valueCol.header.menuY);
  await page.getByText('Filter column ▶').waitFor({ state: 'visible' });
  await page.getByText('Filter column ▶').click();
  await page.getByText('Select all').waitFor({ state: 'visible' });

  const filterMenu = page.locator('div[style*="position: absolute"]').last();

  await filterMenu.getByText('Select all').click();
  await page.waitForTimeout(WAIT_SHORT);

  const valueToFilterFor = String(sampleRows[0].value);
  await filterMenu.locator('span', { hasText: valueToFilterFor }).click();
  await page.waitForTimeout(WAIT_MEDIUM);

  const layoutFiltered = await getLayout(page);
  const valueColFiltered = layoutFiltered.columns['value'];
  const filteredValues = await copyColumn(page, valueColFiltered, layoutFiltered.rows, context);
  expect(filteredValues.every(v => v === valueToFilterFor)).toBe(true);
  expect(filteredValues.length).toBeGreaterThan(0);

  // Reopen the filter menu (previous copy action closed it)
  const layoutF2 = await getLayout(page);
  const valueCol2 = layoutF2.columns['value'];
  await page.mouse.click(valueCol2.header.menuX, valueCol2.header.menuY);
  await page.getByText('Filter column ▶').waitFor({ state: 'visible' });
  await page.getByText('Filter column ▶').click();
  await page.getByText('Select all').waitFor({ state: 'visible' });

  // Uncheck the specific value (it's the only checked item)
  const filterMenu2 = page.locator('div[style*="position: absolute"]').last();
  await filterMenu2.locator('span', { hasText: valueToFilterFor }).click();
  await page.waitForTimeout(WAIT_MEDIUM);

  const layoutEmpty = await getLayout(page);
  expect(layoutEmpty.rows.length).toBe(0);

  expect(errors).toEqual([]);
});

test('text filter op does not reset to Contains when input is cleared', async ({ page, context }) => {
  const errors = setupErrorTracking(page);

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByTestId('data-grid-canvas').waitFor({ state: 'visible' });

  const layout = await getLayout(page);
  const nameCol = layout.columns['name'];

  await page.mouse.click(nameCol.header.menuX, nameCol.header.menuY);
  await page.getByText('Filter column ▶').waitFor({ state: 'visible' });
  await page.getByText('Filter column ▶').click();

  const filterMenu = page.locator('div[style*="position: absolute"]').last();
  const select = filterMenu.locator('select').last();
  await select.waitFor({ state: 'visible' });

  await select.selectOption('regex');
  expect(await select.inputValue()).toBe('regex');

  const input = filterMenu.locator('input[type="text"]');
  await input.fill('Ali');
  await page.waitForTimeout(WAIT_SHORT);

  await input.fill('');
  await page.waitForTimeout(WAIT_SHORT);

  expect(await select.inputValue()).toBe('regex');

  expect(errors).toEqual([]);
});
