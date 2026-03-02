import { expect, test } from '@playwright/test';

test('/infra smoke renders core sections', async ({ page }) => {
    await page.goto('/infra');

    await expect(page.getByText('Infra Documents Storage Manager')).toBeVisible();
    await expect(page.getByText('R2 Documents Health')).toBeVisible();
    await expect(page.getByText('Duplicate Audit')).toBeVisible();
    await expect(page.getByText('Cleanup by UUID / Document')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create dry-run preview' })).toBeVisible();
});
