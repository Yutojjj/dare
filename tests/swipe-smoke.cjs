// Run with Playwright available; optional PLAYWRIGHT_BROWSER_PATH selects a local Chromium browser.
// All external requests are blocked. Fixtures and saved edits stay in an isolated browser profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const fixture = {
  customerDirectoryVersion: 1,
  members: [{ id: 'test-member', name: 'スワイプ検証', rank: { text: 'A', color: '#7c4c3b' },
    months: { '2026-10': { nominations: 0, freebacks: 4 } },
    dailyMetrics: { '2026-10-18': { freebacks: 1 } }, customerIds: ['test-customer'] }],
  customers: [{ id: 'test-customer', name: 'お客様検証', fieldValues: {} }]
};
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (pathname === '/' ? '/dare.html' : pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404); response.end(); return;
  }
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
  response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  response.end(fs.readFileSync(file));
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || undefined });
    async function open({ installed = false, standalone = false, dismissInstall = true, width = 390, height = 844 } = {}) {
      const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, serviceWorkers: 'block' });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.fulfill({ body: '', contentType: 'application/javascript' }));
      await context.addInitScript(({ fixture, installed, standalone, dismissInstall }) => {
        if (!localStorage.getItem('member-management-v1')) localStorage.setItem('member-management-v1', JSON.stringify(fixture));
        if (installed) localStorage.setItem('dare-pwa-installed', '1');
        if (standalone) Object.defineProperty(navigator, 'standalone', { value: true });
        if (dismissInstall) sessionStorage.setItem('dare-pwa-install-dismissed', '1');
      }, { fixture, installed, standalone, dismissInstall });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.clock.install({ time: new Date('2026-10-18T03:00:00Z') });
      await page.goto(origin);
      await page.locator('#memberGrid .member-card').waitFor();
      assert.deepEqual(errors, [], 'App startup must complete without an uncaught exception');
      const session = await context.newCDPSession(page);
      return { context, page, session };
    }
    const { context, page, session } = await open();
    async function activeMain(id) {
      await page.waitForTimeout(310);
      const geometry = await page.locator('#' + id).evaluate(element => {
        const page = element.getBoundingClientRect(), viewport = element.parentElement.getBoundingClientRect();
        return { inert: element.inert, x: page.x - viewport.x, width: page.width, viewportWidth: viewport.width };
      });
      assert.equal(geometry.inert, false, id + ' must be active');
      assert.ok(Math.abs(geometry.x) < 1, id + ' must align with its viewport');
      assert.ok(Math.abs(geometry.width - geometry.viewportWidth) < 1, id + ' must fill its viewport');
    }
    async function touch(x, y, type) {
      await session.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
    }
    async function swipe(viewportSelector, currentSelector, direction, { distance = 220, duration = 210, commit = true, screenshot = false } = {}) {
      const box = await page.locator(viewportSelector).boundingBox();
      const startX = box.x + (direction > 0 ? box.width * .82 : box.width * .18);
      const startY = box.y + Math.min(280, box.height * .55);
      const signed = direction > 0 ? -distance : distance;
      const initial = await page.locator(currentSelector).boundingBox();
      await touch(startX, startY, 'touchStart');
      for (let step = 1; step <= 8; step++) {
        await touch(startX + signed * step / 8, startY + 1, 'touchMove');
        await page.waitForTimeout(duration / 8);
        if (step === 4 && commit) {
          const during = await page.locator(currentSelector).boundingBox();
          assert.ok(direction > 0 ? during.x < initial.x - 40 : during.x > initial.x + 40, 'The current page must follow the finger before release');
          const next = await page.locator(currentSelector).evaluate((element, direction) => {
            const pages = [...element.parentElement.querySelectorAll(':scope > section')];
            const target = pages[pages.indexOf(element) + direction];
            if (!target) return null;
            const r = target.getBoundingClientRect(), parent = target.parentElement.getBoundingClientRect();
            return { left: r.left, right: r.right, parentLeft: parent.left, parentRight: parent.right };
          }, direction);
          assert.ok(next && next.left < next.parentRight && next.right > next.parentLeft, 'The adjacent page must be visible while dragging');
          if (screenshot && process.env.SWIPE_SCREENSHOT_DIR) {
            fs.mkdirSync(process.env.SWIPE_SCREENSHOT_DIR, { recursive: true });
            await page.screenshot({ path: path.join(process.env.SWIPE_SCREENSHOT_DIR, viewportSelector === '#main' ? 'main-drag.png' : 'detail-drag.png') });
          }
        }
      }
      await touch(0, 0, 'touchEnd');
      await page.waitForTimeout(360);
    }
    await activeMain('view-members');
    const views = ['view-members', 'view-overview-calendar', 'view-all-customers', 'view-overview-analysis'];
    for (let index = 0; index < 3; index++) {
      await swipe('#main', '#' + views[index], 1, { screenshot: index === 0 });
      await activeMain(views[index + 1]);
    }
    for (let index = 3; index > 0; index--) {
      await swipe('#main', '#' + views[index], -1);
      await activeMain(views[index - 1]);
    }
    await swipe('#main', '#view-members', 1, { distance: 35, duration: 400, commit: false });
    await activeMain('view-members');
    await swipe('#main', '#view-members', -1, { distance: 100, commit: false });
    await activeMain('view-members');
    console.log('PASS: main pages follow the finger in both directions; short and edge swipes snap back');

    await page.locator('#showOverviewAnalysis').click();
    await activeMain('view-overview-analysis');
    await page.locator('#overviewAnalysisCards .overview-card').click();
    await page.locator('#analysisCards .analysis-card').first().waitFor();
    assert.equal(await page.locator('.detail-nav [aria-current="page"]').getAttribute('data-target'), 'analysis');
    const detailIds = ['detail-basic', 'detail-calendar', 'detail-customers', 'detail-analysis'];
    for (let index = 3; index > 0; index--) {
      await swipe('#detailContent', '#' + detailIds[index], -1, { screenshot: index === 3 });
      assert.equal(await page.locator('.detail-nav [aria-current="page"]').getAttribute('data-target'), detailIds[index - 1].replace('detail-', ''));
    }
    const detailBox = await page.locator('#detailContent').boundingBox();
    await page.mouse.move(detailBox.x + detailBox.width / 2, detailBox.y + detailBox.height / 2);
    await page.mouse.wheel(0, 450);
    await page.waitForTimeout(160);
    assert.ok(await page.locator('#detail-basic').evaluate(element => element.scrollTop) > 0, 'Vertical scrolling must remain available');
    for (let index = 0; index < 3; index++) {
      await swipe('#detailContent', '#' + detailIds[index], 1);
      assert.equal(await page.locator('.detail-nav [aria-current="page"]').getAttribute('data-target'), detailIds[index + 1].replace('detail-', ''));
    }
    await page.locator('#closeDetail').click();
    assert.equal(await page.locator('#detail').evaluate(element => element.open), false);
    console.log('PASS: analysis cards open member analysis; all four popup pages swipe both ways and scroll vertically');

    await page.locator('#showOverviewCalendar').click();
    await activeMain('view-overview-calendar');
    await page.locator('#overviewCalendarGrid [data-date="2026-10-18"]').click();
    await page.locator('#overviewDayMembers .overview-day-selected').click();
    assert.equal(await page.locator('#detail').evaluate(element => element.open), false, 'Daily entry must not open basic member information');
    assert.equal(await page.locator('#overviewDayEntryDialog').evaluate(element => element.open), true);
    assert.match(await page.locator('#overviewDayEntryTitle').textContent(), /2026年10月18日/);
    assert.equal(await page.locator('#overviewDayEntryMembers .overview-day-row').count(), 1);
    const input = page.locator('#overviewDayEntryMembers input').nth(1);
    await input.fill('3');
    await page.locator('#saveOverviewDayMetrics').click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('member-management-v1')).members[0].dailyMetrics['2026-10-18'].freebacks), 3);
    console.log('PASS: selected date/member opens daily entry directly and saves the correct date');
    await page.locator('#closeOverviewDay').click();

    await page.setViewportSize({ width: 844, height: 390 });
    await activeMain('view-overview-calendar');
    await page.setViewportSize({ width: 390, height: 844 });
    await activeMain('view-overview-calendar');
    assert.equal(await page.locator('#main').evaluate(element => element.getBoundingClientRect().bottom <= document.querySelector('.directory-nav').getBoundingClientRect().top + 1), true);
    await context.close();
    console.log('PASS: rotation preserves page alignment and clears the bottom navigation');

    for (const options of [{ installed: true }, { standalone: true }]) {
      const app = await open({ ...options, dismissInstall: false });
      await app.page.waitForTimeout(1500);
      assert.equal(await app.page.locator('#pwaInstallDialog').evaluate(element => element.open), false);
      await app.context.close();
    }
    const fresh = await open({ dismissInstall: false });
    await fresh.page.waitForTimeout(1500);
    assert.equal(await fresh.page.locator('#pwaInstallDialog').evaluate(element => element.open), true);
    await fresh.page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    assert.equal(await fresh.page.locator('#pwaInstallDialog').evaluate(element => element.open), false);
    await fresh.page.reload();
    await fresh.page.waitForTimeout(1500);
    assert.equal(await fresh.page.locator('#pwaInstallDialog').evaluate(element => element.open), false);
    await fresh.context.close();
    assert.deepEqual(errors, [], 'No uncaught errors should occur during navigation');
    console.log('PASS: installed/standalone apps suppress the install dialog, including after reload');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
