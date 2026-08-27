import { expect, test } from '@playwright/test';

test('initial interactive shell stays within its local performance budget', async ({
  page,
}) => {
  const failedRequests = [];
  page.on('requestfailed', (request) => failedRequests.push(request.url()));

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#btnToggleCamera')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    const sizes = resources.map((resource) => ({
      name: new URL(resource.name).pathname,
      type: resource.initiatorType,
      bytes: resource.encodedBodySize || resource.transferSize || 0,
    }));
    return {
      domContentLoadedMs:
        navigation.domContentLoadedEventEnd - navigation.startTime,
      loadMs: navigation.loadEventEnd - navigation.startTime,
      totalBytes: sizes.reduce((total, resource) => total + resource.bytes, 0),
      scriptBytes: sizes
        .filter((resource) => resource.type === 'script')
        .reduce((total, resource) => total + resource.bytes, 0),
      largestResourceBytes: Math.max(0, ...sizes.map(({ bytes }) => bytes)),
    };
  });

  expect(failedRequests).toEqual([]);
  expect(metrics.domContentLoadedMs).toBeLessThan(2_000);
  expect(metrics.loadMs).toBeLessThan(4_000);
  expect(metrics.totalBytes).toBeLessThan(1_500_000);
  expect(metrics.scriptBytes).toBeLessThan(500_000);
  expect(metrics.largestResourceBytes).toBeLessThan(700_000);
});
