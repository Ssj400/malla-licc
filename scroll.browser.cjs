// Start the site first with npm start. Override BASE_URL to test GitHub Pages.
const { chromium, devices } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:4173');
    const source = page.locator('[data-id="base-0-0"]');
    await source.scrollIntoViewIfNeeded();
    const box = await source.boundingBox();
    await page.mouse.move(box.x + 35, box.y + 35);
    await page.mouse.down();
    await page.mouse.move(box.x + 45, box.y + 40);
    assert.equal(await page.locator('.drag-ghost').count(), 1);

    // Wheel stays available while the button is held.
    await page.mouse.move(200, 400);
    const beforeWheel = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 350);
    await page.waitForTimeout(350);
    assert.ok(await page.evaluate(() => scrollY) > beforeWheel + 200, 'wheel must scroll during a drag');
    assert.equal(await page.locator('.drag-ghost').count(), 1);

    // A stationary pointer near the edge keeps scrolling; moving to the
    // middle stops it. This must not depend on repeated pointermove events.
    await page.mouse.move(200, 785);
    const beforeEdge = await page.evaluate(() => scrollY);
    await page.waitForTimeout(550);
    assert.ok(await page.evaluate(() => scrollY) > beforeEdge + 150, 'bottom edge must scroll');
    await page.mouse.move(200, 400);
    await page.waitForTimeout(80);
    const stopped = await page.evaluate(() => scrollY);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => scrollY), stopped, 'middle must stop edge scrolling');

    await page.mouse.move(200, 15);
    const beforeTop = await page.evaluate(() => scrollY);
    await page.waitForTimeout(450);
    assert.ok(await page.evaluate(() => scrollY) < beforeTop - 150, 'top edge must scroll up');

    // Cancel does not move a block and cannot leave a running scroll loop.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);
    const cancelled = await page.evaluate(() => scrollY);
    await page.waitForTimeout(180);
    assert.equal(await page.evaluate(() => scrollY), cancelled);
    assert.equal(await page.locator('.drag-ghost').count(), 0);
    assert.equal(await page.locator('[data-zone="s1"] [data-id="base-0-0"]').count(), 1);
    await page.mouse.up();

    // Touch long-press uses the same loop and can reach offscreen semesters.
    const phoneContext = await browser.newContext({ ...devices['iPhone 13'] });
    const phone = await phoneContext.newPage();
    phone.on('pageerror', error => errors.push(error.message));
    await phone.goto(process.env.BASE_URL || 'http://127.0.0.1:4173');
    const touchSource = phone.locator('[data-id="base-0-0"]');
    await touchSource.scrollIntoViewIfNeeded();
    const touchBox = await touchSource.boundingBox();
    const cdp = await phoneContext.newCDPSession(phone);
    const start = { x: touchBox.x + 30, y: touchBox.y + 30 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await phone.waitForTimeout(300);
    assert.equal(await phone.locator('.drag-ghost').count(), 1);
    const height = await phone.evaluate(() => innerHeight);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x, y: height - 20 }] });
    const beforeTouch = await phone.evaluate(() => scrollY);
    await phone.waitForTimeout(500);
    assert.ok(await phone.evaluate(() => scrollY) > beforeTouch + 150, 'touch edge must scroll during long-press drag');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    assert.equal(await phone.locator('.drag-ghost').count(), 0);
    const afterTouch = await phone.evaluate(() => scrollY);
    await phone.waitForTimeout(150);
    assert.equal(await phone.evaluate(() => scrollY), afterTouch, 'touch cancellation must stop scrolling');
    assert.deepEqual(errors, []);
    console.log('PASS: wheel, stationary bottom/top autoscroll, middle stop, Escape cleanup, touch edge scrolling and touch cancellation.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
