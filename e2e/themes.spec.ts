import { expect, test } from '@playwright/test';
import { login, sql } from './helpers';

const THEMES = [
  ['midnight-indigo', 'Midnight Indigo'],
  ['ocean-breeze', 'Ocean Breeze'],
  ['emerald-focus', 'Emerald Focus'],
  ['royal-purple', 'Royal Purple'],
  ['light-minimal', 'Light Minimal'],
] as const;
const SHOTS = process.env.E2E_SCREENSHOTS;

test('all five themes apply across pages and survive a reload', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  const bodyBg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const seen = new Set<string>();
  for (const [id, name] of THEMES) {
    await page.getByTestId('theme-switcher').first().click();
    await page.getByRole('dialog', { name: 'Theme' }).getByRole('radio', { name: new RegExp(name) }).click();
    await expect(html).toHaveAttribute('data-theme', id);
    seen.add(await bodyBg());
    await page.keyboard.press('Escape');
    for (const path of ['/', '/student/login', '/teacher/login', '/search?q=regression']) {
      await page.goto(path);
      await expect(html).toHaveAttribute('data-theme', id);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/desktop-${id}-${path.split(/[/?]/)[1] || 'landing'}.png` });
    }
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', id);
  }
  expect(seen.size).toBeGreaterThanOrEqual(4); // each palette really changes the page
});

test('dark/light toggle works and a signed-in user keeps their theme on their profile', async ({ page }) => {
  await login(page, 'student');
  await page.getByTestId('theme-switcher').first().click();
  const popover = page.getByRole('dialog', { name: 'Theme' });
  await popover.getByRole('radio', { name: /Ocean Breeze/ }).click();
  await popover.getByRole('radio', { name: 'Light', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  await expect.poll(() => sql(`select preferred_theme from profiles where email = 'student@macro.test'`)).toBe('ocean-breeze:light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean-breeze');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  for (const path of ['/student/dashboard', '/student/courses', '/student/tutor', '/student/quizzes', '/student/progress', '/settings']) {
    await page.goto(path);
    await expect(page.getByRole('heading').first()).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/desktop-ocean-light-${path.replace(/\//g, '_')}.png`, fullPage: true });
  }
});

test.describe('@mobile layout', () => {
  test('@mobile pages fit the screen without sideways scrolling, and the menu works', async ({ page }) => {
    const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    for (const path of ['/', '/student/login', '/teacher/login', '/student/register', '/teacher/onboarding', '/search?q=gradient']) {
      await page.goto(path);
      await expect(page.locator('body')).toBeVisible();
      await noOverflow();
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/mobile${path.replace(/[/?=]/g, '_') || '_landing'}.png`, fullPage: true });
    }
    await login(page, 'student');
    for (const path of ['/student/dashboard', '/student/tutor', '/student/quizzes', '/student/progress']) {
      await page.goto(path);
      await expect(page.getByRole('heading').first()).toBeVisible();
      await noOverflow();
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/mobile${path.replace(/\//g, '_')}.png`, fullPage: true });
    }
    await page.getByTestId('open-menu').click();
    await page.getByRole('link', { name: 'Progress' }).last().click();
    await expect(page).toHaveURL(/\/student\/progress/);
  });

  test('@mobile teacher dashboard fits on a phone', async ({ page }) => {
    await login(page, 'teacher');
    for (const path of ['/teacher/dashboard', '/teacher/courses', '/teacher/students']) {
      await page.goto(path);
      await expect(page.getByRole('heading').first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/mobile${path.replace(/\//g, '_')}.png`, fullPage: true });
    }
  });
});
