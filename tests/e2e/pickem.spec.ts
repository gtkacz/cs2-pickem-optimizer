import { expect, test } from '@playwright/test';

test('fans the desktop bracket out around a shared center line', async ({ page }) => {
  await page.route('https://img-cdn.hltv.org/**', route => route.abort());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?major=budapest-2025&stage=stage-3');
  const rounds = page.locator('.round');
  await expect(rounds).toHaveCount(5);
  const left = await rounds.nth(0).locator('.round-lane--middle .record').boundingBox();
  const upper = await rounds.nth(1).locator('.round-lane--upper .record').boundingBox();
  const lower = await rounds.nth(1).locator('.round-lane--lower .record').boundingBox();
  const center = left!.y + left!.height / 2;
  expect(upper!.y + upper!.height).toBeLessThan(center);
  expect(lower!.y).toBeGreaterThan(center);
  await expect(rounds.nth(3).locator('.round-lane--upper .finish')).toContainText('3–0 · Qualified');
  await expect(rounds.nth(3).locator('.round-lane--lower .finish')).toContainText('0–3 · Eliminated');
});

test('scores a completed stage, replays an edit, and passes qualifiers forward', async ({ page }) => {
  await page.route('https://img-cdn.hltv.org/**', route => route.abort());
  await page.goto('/?major=austin-2025&stage=stage-1');
  await expect(page.getByRole('heading', { name: 'BLAST.tv Austin Major 2025' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Add a 3–0 pick' }).fill('hero');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Remove HEROIC from 3–0' })).toBeVisible();
  await page.getByRole('button', { name: 'Run simulation' }).click();
  await expect(page.locator('.score-line')).toContainText('1 / 1 Maximum achievable');
  const firstMatch = page.locator('.round').first().locator('.match').filter({ hasText: 'Chinggis Warriors' }).first();
  await firstMatch.getByRole('button', { name: 'Set Chinggis Warriors as winner' }).click();
  await expect(page.getByText('What-if scenario')).toBeVisible();
  await page.getByRole('button', { name: 'Run simulation' }).click();
  await expect(page.locator('.score-line')).toContainText('0 / 1 Maximum achievable');
  await page.getByRole('button', { name: 'Apply this path' }).click();
  await expect(page.getByText('Stage 2 qualifiers')).toBeVisible();
  await page.getByRole('button', { name: 'Stage 2' }).click();
  await expect(page.getByText('What-if scenario')).toBeVisible();
  await page.getByRole('button', { name: 'Reset to official results' }).click();
  await expect(page.getByText('Official results ·')).toBeVisible();
  await page.getByRole('button', { name: 'Undo reset' }).click();
  await expect(page.getByText('What-if scenario')).toBeVisible();
});

test('opens a historical default with an expandable bracket at 320px', async ({ page }) => {
  await page.route('https://img-cdn.hltv.org/**', route => route.abort());
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Stage 3' })).toHaveAttribute('aria-current', 'page');
  const round = page.locator('.round').first();
  await round.locator('summary').first().focus();
  await page.keyboard.press('Enter');
  await expect(round).not.toHaveAttribute('open');
  await page.keyboard.press('Enter');
  await expect(round).toHaveAttribute('open', '');
  await expect(round.locator('.team-logo img').first()).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test('keeps the mobile interface responsive during an early-stage search', async ({ page }) => {
  await page.route('https://img-cdn.hltv.org/**', route => route.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto('/?major=budapest-2025&stage=stage-1');
  const opener = page.locator('.round').first();
  await expect(opener.locator('.match')).toHaveCount(8);
  for (const match of await opener.locator('.match').all()) {
    await match.getByRole('button', { name: 'Clear result' }).click();
  }
  await expect(page.getByText('What-if scenario')).toBeVisible();
  for (const [slot, team] of [['3–0', 'Legacy'], ['0–3', 'Rare Atom'], ['3–1 / 3–2', 'FaZe']]) {
    await page.getByRole('combobox', { name: `Add a ${slot} pick` }).click();
    await page.getByRole('option', { name: new RegExp(`^${team}`) }).click();
  }
  await page.getByRole('button', { name: 'Run simulation' }).click();
  await expect(page.locator('.score')).toContainText(/Maximum achievable|Best found/);
  await expect(page.getByRole('button', { name: 'Apply this path' })).toBeEnabled();
  await page.getByRole('button', { name: 'Apply this path' }).click();
  await expect(page.getByText('Stage 2 qualifiers')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('switches the odds to record weighting and remembers the choice', async ({ page }) => {
  await page.route('https://img-cdn.hltv.org/**', route => route.abort());
  await page.goto('/?major=austin-2025&stage=stage-1');
  await page.getByRole('combobox', { name: 'Add a 3–0 pick' }).fill('hero');
  await page.keyboard.press('Enter');
  const weigh = page.getByRole('switch', { name: 'Weigh by current record' });
  await expect(weigh).toHaveCount(0);
  await page.getByRole('button', { name: 'Run simulation' }).click();
  await expect(weigh).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.score-line')).toContainText('of scenarios give 5+ correct');
  await expect(page.locator('.score-line')).not.toContainText('weighted by current record');
  await weigh.click();
  await expect(weigh).toHaveAttribute('aria-checked', 'true');
  await expect(weigh).toBeFocused();
  await expect(page.locator('.score-line')).toContainText('of scenarios give 5+ correct, weighted by current record');
  await page.reload();
  await page.getByRole('button', { name: 'Run simulation' }).click();
  await expect(weigh).toHaveAttribute('aria-checked', 'true');
});
