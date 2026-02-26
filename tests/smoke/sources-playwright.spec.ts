import { expect, test } from '@playwright/test';

test('sources page smoke renders key controls', async ({ page }) => {
    await page.goto('/sources');

    await expect(page.getByLabel('Nazev')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Vybrat' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lupa' })).toBeVisible();
    await expect(page.getByText('Scraping Workflow')).toBeVisible();

    await page.getByLabel('Base URL').fill('https://example.com');
    await expect(page.getByLabel('Strategie')).toBeVisible();
});
