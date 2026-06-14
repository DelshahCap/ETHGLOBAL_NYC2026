import { test, expect } from '@playwright/test'

test('admin panel renders its sections', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Admin / Test Panel' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Lifecycle runner' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Mock violation (shared store)' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Live events' })).toBeVisible()
})

test('tenant view renders', async ({ page }) => {
  await page.goto('/tenant')
  await expect(page.getByRole('heading', { name: 'Your apartment' })).toBeVisible()
})
