import { expect, test, type Page } from '@playwright/test';

/** The content frame of a paper (papers whose content is an HTML string render in a frame). */
const contentFrame = (page: Page, id: string) => page.frameLocator(`iframe[data-paper-content-id="${id}"]`);
const paper = (page: Page, id: string) => page.locator(`[data-paper-id-frame="${id}"]`);
const header = (page: Page, id: string) => paper(page, id).locator('> div').first();

async function openFromContent(page: Page, from: string, to: string) {
  await contentFrame(page, from).locator(`a[data-paper-id="${to}"]`).first().click();
  await expect(paper(page, to)).toBeVisible();
}

/** A paper's open children in layout order. Their DOM order stays put, so frames never reload. */
const layoutOrder = (page: Page, id: string) =>
  page.locator(`[data-paper-id-frame="${id}"] > div:last-child > [data-child-id]`).evaluateAll((els) => els
    .map((el) => ({ id: el.getAttribute('data-child-id'), index: Number(el.getAttribute('data-child-index')) }))
    .sort((a, b) => a.index - b.index)
    .map((child) => child.id));

async function dragHeader(page: Page, id: string, to: { x: number; y: number }, release = true) {
  const box = (await header(page, id).boundingBox())!;
  // The middle of the bar: the title button on the left is a valid handle too, but not the
  // buttons on the right.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 10, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  if (release) await page.mouse.up();
}

let consoleProblems: string[] = [];
test.beforeEach(async ({ page }) => {
  consoleProblems = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') consoleProblems.push(message.text());
  });
  page.on('pageerror', (error) => consoleProblems.push(error.message));
  await page.goto('/');
  await expect(contentFrame(page, 'root').locator('a[data-paper-id="concept"]').first()).toBeVisible();
});

test.afterEach(() => {
  expect(consoleProblems).toEqual([]);
});

test('opens papers from links inside content and marks the open links', async ({ page }) => {
  await openFromContent(page, 'root', 'concept');
  await openFromContent(page, 'concept', 'focus');
  await expect(contentFrame(page, 'root').locator('a[data-paper-id="concept"]').first()).toHaveAttribute('data-open', '');
  await expect(header(page, 'focus').getByRole('button', { name: 'Focused Reading' })).toHaveAttribute('aria-current', 'true');
});

test('a link to an ancestor focuses it instead of breaking the canvas', async ({ page }) => {
  await openFromContent(page, 'root', 'concept');
  await contentFrame(page, 'concept').locator('body').evaluate((body) => {
    body.insertAdjacentHTML('beforeend', '<p>Back to the <a data-paper-id="root">overview</a></p>');
  });
  await contentFrame(page, 'concept').locator('a[data-paper-id="root"]').click();
  await expect(paper(page, 'concept')).toBeVisible();
  await expect(header(page, 'root').getByRole('button', { name: 'Paper in Paper' })).toHaveAttribute('aria-current', 'true');
});

test('scripts inside content do not run', async ({ page }) => {
  const frame = page.frames().find((f) => f.url() === 'about:srcdoc')!;
  await contentFrame(page, 'root').locator('body').evaluate((body) => {
    body.insertAdjacentHTML('beforeend', '<img src="data:," onerror="document.body.dataset.ran = \'yes\'">');
  });
  await page.waitForTimeout(200);
  expect(await frame.evaluate(() => document.body.dataset.ran ?? 'no')).toBe('no');
  // The canvas's own bootstrap still works: links open papers.
  await openFromContent(page, 'root', 'architecture');
  consoleProblems = consoleProblems.filter((text) => !/Content Security Policy/.test(text));
});

test('regular links inside content open in a new tab', async ({ page, context }) => {
  await contentFrame(page, 'root').locator('body').evaluate((body) => {
    body.insertAdjacentHTML('beforeend', '<p><a href="https://example.com/doc">external</a></p>');
  });
  await context.route('https://example.com/**', (route) => route.fulfill({ body: 'ok' }));
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    contentFrame(page, 'root').getByText('external').click(),
  ]);
  expect(popup.url()).toBe('https://example.com/doc');
});

test('a paper cannot be dropped into its own child', async ({ page }) => {
  await openFromContent(page, 'root', 'concept');
  await openFromContent(page, 'concept', 'focus');
  const child = (await paper(page, 'focus').boundingBox())!;
  await dragHeader(page, 'concept', { x: child.x + child.width / 2, y: child.y + child.height * 0.75 });
  await expect(paper(page, 'concept')).toBeVisible();
  await expect(paper(page, 'focus')).toBeVisible();
  // Concept is still the root's child: its link in the root content is still marked open.
  await expect(contentFrame(page, 'root').locator('a[data-paper-id="concept"]').first()).toHaveAttribute('data-open', '');
});

test('dropping a paper on a sibling title bar reorders the room; on its body moves it inside', async ({ page }) => {
  await openFromContent(page, 'root', 'concept');
  await openFromContent(page, 'root', 'architecture');
  const order = () => layoutOrder(page, 'root');
  expect(await order()).toEqual(['concept', 'architecture']);
  // Over a sibling's title bar the drop lands next to it (its body would mean "move inside").
  const target = (await header(page, 'concept').boundingBox())!;
  await dragHeader(page, 'architecture', { x: target.x + 12, y: target.y + target.height / 2 });
  await expect.poll(order).toEqual(['architecture', 'concept']);
  await expect(contentFrame(page, 'root').locator('a[data-paper-id="architecture"]').first()).toHaveAttribute('data-open', '');

  const body = (await paper(page, 'concept').boundingBox())!;
  await dragHeader(page, 'architecture', { x: body.x + body.width / 2, y: body.y + body.height * 0.7 });
  await expect(paper(page, 'concept').locator('[data-paper-id-frame="architecture"]')).toBeVisible();
  expect(await order()).toEqual(['concept']);
});

test('Escape cancels a drag', async ({ page }) => {
  await openFromContent(page, 'root', 'concept');
  await openFromContent(page, 'root', 'architecture');
  const target = (await paper(page, 'architecture').boundingBox())!;
  await dragHeader(page, 'concept', { x: target.x + target.width / 2, y: target.y + target.height / 2 }, false);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(contentFrame(page, 'root').locator('a[data-paper-id="concept"]').first()).toHaveAttribute('data-open', '');
  await expect(paper(page, 'architecture').locator('[data-paper-id-frame="concept"]')).toHaveCount(0);
});

test('keyboard: focus a paper with Enter and move it with Alt + arrow keys', async ({ page }) => {
  await openFromContent(page, 'root', 'concept');
  await openFromContent(page, 'root', 'architecture');
  const title = header(page, 'architecture').getByRole('button', { name: 'Architecture' });
  await title.focus();
  await page.keyboard.press('Enter');
  await expect(title).toHaveAttribute('aria-current', 'true');
  const order = () => layoutOrder(page, 'root');
  expect(await order()).toEqual(['concept', 'architecture']);
  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(order).toEqual(['architecture', 'concept']);
  await expect(title).toBeFocused();
});

test('a small viewport indexes papers instead of squeezing them, without errors', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 440 });
  for (const id of ['concept', 'architecture', 'interaction']) {
    await contentFrame(page, 'root').locator(`a[data-paper-id="${id}"]`).first().click();
  }
  // Interactions elsewhere end the protection of the papers just opened.
  for (let i = 0; i < 4; i += 1) await header(page, 'root').click({ position: { x: 200, y: 10 } });
  await contentFrame(page, 'root').locator('a[data-paper-id="notes"]').first().click();
  await expect(page.locator('[data-index-label]').first()).toBeVisible();
  await page.locator('[data-index-label]').first().click();
  await expect(page.locator('[data-paper-id-frame]').first()).toBeVisible();
});
