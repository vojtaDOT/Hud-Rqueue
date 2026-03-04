import { expect, test } from '@playwright/test';

test('/infra smoke renders core sections', async ({ page }) => {
    await page.goto('/infra');

    await expect(page.getByText('Object Storage')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Interaction with Blob Storage' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Cleanup Process' })).toBeVisible();
    await expect(page.getByText('Blob Object Explorer')).toBeVisible();

    await page.getByRole('tab', { name: 'Cleanup Process' }).click();
    await expect(page.getByText('R2 Documents Health')).toBeVisible();
    await expect(page.getByText('Duplicate Audit')).toBeVisible();
    await expect(page.getByText('Cleanup by UUID / Document')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create dry-run preview' })).toBeVisible();
});
