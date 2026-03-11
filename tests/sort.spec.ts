import { test, expect } from '@playwright/test';
import { getLayout, testSortForColumn, setupErrorTracking } from './helpers';

test('sort asc and desc works for all columns', async ({ page, context }) => {
  const errors = setupErrorTracking(page);

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByTestId('data-grid-canvas').waitFor({ state: 'visible' });

  const layout = await getLayout(page);
  for (const [colId, col] of Object.entries(layout.columns)) {
    await testSortForColumn(page, col, colId, layout.rows, context);
  }

  expect(errors).toEqual([]);
});
