import { expect, test, type Page } from '@playwright/test';
import type { HarnessFixture, HarnessPaper } from '../src/demo/harness';

/**
 * Browser tests against a bare canvas (harness.html) with papers chosen per test: what jsdom
 * cannot show — real frames, CSP, DOM clobbering, navigation, pointer routing into iframes.
 */

const contentFrame = (page: Page, id: string) => page.frameLocator(`iframe[data-paper-content-id="${id}"]`);
const paper = (page: Page, id: string) => page.locator(`[data-paper-id-frame="${id}"]`);
const header = (page: Page, id: string) => paper(page, id).locator('> div').first();

/** The open children of a paper in layout order (their DOM order is stable on purpose). */
const layoutOrder = (page: Page, id: string) =>
  page.locator(`[data-paper-id-frame="${id}"] > div:last-child > [data-child-id]`).evaluateAll((els) => els
    .map((el) => ({ id: el.getAttribute('data-child-id'), index: Number(el.getAttribute('data-child-index')) }))
    .sort((a, b) => a.index - b.index)
    .map((child) => child.id));

const ROOT_LINKS = '<p><a data-paper-id="a">Alpha link</a> <a data-paper-id="b">Beta link</a> <a data-paper-id="c">Gamma link</a></p>';

function fixture({ root = ROOT_LINKS, open = {}, labels }: { root?: string } & Omit<Partial<HarnessFixture>, 'papers'> = {}): HarnessFixture {
  const papers: HarnessPaper[] = [
    { id: 'root', title: 'Root', content: `<h1>Root</h1>${root}`, parentId: null, childIds: ['a', 'b', 'c'] },
    { id: 'a', title: 'Alpha', content: '<p>Alpha body. <a data-paper-id="a1">open a1</a></p>', parentId: 'root', childIds: ['a1'] },
    { id: 'a1', title: 'Alpha one', content: '<p>a1 body</p>', parentId: 'a', childIds: [] },
    { id: 'b', title: 'Beta', content: '<p>Beta body. <a data-paper-id="b1">open b1</a></p>', parentId: 'root', childIds: ['b1'] },
    { id: 'b1', title: 'Beta one', content: '<p>b1 body</p>', parentId: 'b', childIds: [] },
    { id: 'c', title: 'Gamma', content: '<p>Gamma body</p>', parentId: 'root', childIds: [] },
  ];
  return { papers, open, labels };
}

async function load(page: Page, data: HarnessFixture, { strict = true } = {}) {
  await page.addInitScript((value) => {
    window.__PIP_FIXTURE__ = value;
  }, data);
  await page.goto(`/harness.html${strict ? '' : '?strict=0'}`);
  await expect(contentFrame(page, 'root').locator('h1')).toHaveText('Root');
}

let consoleProblems: string[] = [];
test.beforeEach(async ({ page }) => {
  consoleProblems = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') consoleProblems.push(message.text());
  });
  page.on('pageerror', (error) => consoleProblems.push(error.message));
});

test.afterEach(() => {
  expect(consoleProblems).toEqual([]);
});

test('content that clobbers DOM properties cannot break its links', async ({ page }) => {
  await load(page, fixture({
    root: `<img name="addEventListener"><img name="documentElement"><img name="querySelectorAll">
      <img name="baseURI"><form name="getElementsByTagName"></form>
      <p><a data-paper-id="a">open alpha</a> <a href="https://example.com/x">out</a></p>`,
  }));
  await contentFrame(page, 'root').getByText('open alpha').click();
  await expect(paper(page, 'a')).toBeVisible();
  await contentFrame(page, 'root').getByText('out').click();
  await expect.poll(() => page.evaluate(() => window.__pipExternal)).toEqual(['https://example.com/x']);
});

test('content scripts and inline handlers do not run; the bootstrap does', async ({ page }) => {
  await load(page, fixture({
    root: `<script>document.body.dataset.script = 'ran'</script>
      <img src="data:," onerror="document.body.dataset.handler = 'ran'">
      <p><a data-paper-id="a">open alpha</a></p>`,
  }));
  const body = contentFrame(page, 'root').locator('body');
  await expect(body).not.toHaveAttribute('data-script', 'ran');
  await expect(body).not.toHaveAttribute('data-handler', 'ran');
  await contentFrame(page, 'root').getByText('open alpha').click();
  await expect(paper(page, 'a')).toBeVisible();
  consoleProblems = consoleProblems.filter((text) => !/Content Security Policy/.test(text));
});

test('a frame that navigates away is replaced by a notice', async ({ page, context }) => {
  await context.route('https://evil.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Please sign in</h1><input type="password">' }));
  await load(page, fixture({
    root: '<meta http-equiv="refresh" content="0;url=https://evil.test/static"><p><a data-paper-id="a">open alpha</a></p>',
    open: { root: ['a'] },
    labels: { contentBlocked: 'Stopped: this content left its page.' },
  }));
  // The meta refresh in the content was removed: the content stays and works.
  await page.waitForTimeout(300);
  await contentFrame(page, 'root').getByText('open alpha').click();
  await expect(header(page, 'a').getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-current', 'true');

  // A navigation that gets past that (here, a refresh added at run time) is caught.
  await contentFrame(page, 'root').locator('body').evaluate(() => {
    const meta = document.createElement('meta');
    meta.httpEquiv = 'refresh';
    meta.content = '0;url=https://evil.test/dynamic';
    document.head.appendChild(meta);
  });
  await expect(page.locator('[data-paper-content-blocked="root"]')).toHaveText('Stopped: this content left its page.');
  await expect(page.locator('iframe[data-paper-content-id="root"]')).toHaveCount(0);
  // The rest of the canvas keeps working.
  await contentFrame(page, 'a').getByText('open a1').click();
  await expect(paper(page, 'a1')).toBeVisible();
});

test('a navigation to a page that never finishes loading is caught too', async ({ page, context }) => {
  // The foreign page's load event never fires: an image on it never arrives.
  await context.route('https://evil.test/never.png', () => {});
  await context.route('https://evil.test/slow', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Please sign in</h1><img src="https://evil.test/never.png">' }));
  await load(page, fixture({ labels: { contentBlocked: 'Stopped.' } }));
  await contentFrame(page, 'root').locator('body').evaluate(() => {
    const meta = document.createElement('meta');
    meta.httpEquiv = 'refresh';
    meta.content = '0;url=https://evil.test/slow';
    document.head.appendChild(meta);
  });
  await expect(page.locator('[data-paper-content-blocked="root"]')).toHaveText('Stopped.');
});

async function dragLink(page: Page, from: string, to: string, target: { x: number; y: number }) {
  const link = contentFrame(page, from).locator(`a[data-paper-id="${to}"]`).first();
  const box = (await link.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 10, { steps: 4 });
  await page.mouse.move(target.x, target.y, { steps: 12 });
}

test('a child dragged out of the content drops where it is released, and the drag ends', async ({ page }) => {
  await load(page, fixture({ open: { root: ['a'] } }));
  const alpha = (await paper(page, 'a').boundingBox())!;
  await dragLink(page, 'root', 'b', { x: alpha.x + alpha.width / 2, y: alpha.y + alpha.height * 0.7 });
  await expect(page.locator('[aria-hidden="true"]', { hasText: 'Beta' })).toBeVisible();
  await page.mouse.up();
  // Released over Alpha's body: Beta moves inside Alpha.
  await expect(paper(page, 'a').locator('[data-paper-id-frame="b"]')).toBeVisible();
  await expect(page.locator('[aria-hidden="true"]', { hasText: 'Beta' })).toHaveCount(0);
  // The drag is over: frames take the pointer again and links work.
  await expect(page.locator('iframe[data-paper-content-id="root"]')).toHaveCSS('pointer-events', 'auto');
  await contentFrame(page, 'b').getByText('open b1').click();
  await expect(paper(page, 'b1')).toBeVisible();
});

test('Escape inside the frame cancels a content-link drag', async ({ page }) => {
  await load(page, fixture({ open: { root: ['a'] } }));
  const alpha = (await paper(page, 'a').boundingBox())!;
  await dragLink(page, 'root', 'b', { x: alpha.x + alpha.width / 2, y: alpha.y + alpha.height * 0.7 });
  await expect(page.locator('[aria-hidden="true"]', { hasText: 'Beta' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[aria-hidden="true"]', { hasText: 'Beta' })).toHaveCount(0);
  await page.mouse.up();
  await expect(paper(page, 'b')).toHaveCount(0);
  expect(await layoutOrder(page, 'root')).toEqual(['a']);
});

test('reordering does not reload content, and links keep working (no StrictMode)', async ({ page }) => {
  await load(page, fixture({ open: { root: ['a', 'b'] } }), { strict: false });
  await contentFrame(page, 'b').locator('body').evaluate((body) => {
    body.dataset.marker = 'same document';
  });
  const title = header(page, 'b').getByRole('button', { name: 'Beta' });
  await title.focus();
  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(() => layoutOrder(page, 'root')).toEqual(['b', 'a']);
  await expect(title).toBeFocused();
  await expect(contentFrame(page, 'b').locator('body')).toHaveAttribute('data-marker', 'same document');
  await contentFrame(page, 'b').getByText('open b1').click();
  await expect(paper(page, 'b1')).toBeVisible();
  await contentFrame(page, 'a').getByText('open a1').click();
  await expect(paper(page, 'a1')).toBeVisible();
});

test('a paper moved to another parent gets a new frame that works (no StrictMode)', async ({ page }) => {
  await load(page, fixture({ open: { root: ['a', 'b'] } }), { strict: false });
  const bar = (await header(page, 'b').boundingBox())!;
  const alpha = (await paper(page, 'a').boundingBox())!;
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + bar.width / 2 + 30, bar.y + bar.height / 2 + 10, { steps: 4 });
  await page.mouse.move(alpha.x + alpha.width / 2, alpha.y + alpha.height * 0.7, { steps: 12 });
  await page.mouse.up();
  await expect(paper(page, 'a').locator('[data-paper-id-frame="b"]')).toBeVisible();
  await contentFrame(page, 'b').getByText('open b1').click();
  await expect(paper(page, 'b1')).toBeVisible();
});
