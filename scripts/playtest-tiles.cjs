/**
 * Playwright: verify tile swaps (mouse path). Valid swaps deal damage → HP changes.
 * Run: node scripts/playtest-tiles.cjs (with serve.mjs on :8080)
 */
const { chromium } = require("playwright");

const URL = process.env.RH_URL || "http://127.0.0.1:8080/";

function firstHpNumber(text) {
  if (!text) return NaN;
  const m = String(text).trim().match(/^(\d+)/);
  return m ? +m[1] : NaN;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const logs = [];
  page.on("console", (msg) => {
    logs.push({ type: msg.type(), text: msg.text() });
  });
  page.on("pageerror", (e) => logs.push({ type: "pageerror", text: String(e) }));

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector(".tile", { timeout: 15000 });

  const hpBeforeDrag = await page.locator("#monsterHpText").textContent();
  const hpNumBefore = firstHpNumber(hpBeforeDrag);

  const pair = await page.evaluate(() => {
    const RG = window.RH_GRID;
    function buildGridFromDOM() {
      const grid = [];
      for (let r = 0; r < RG.ROWS; r++) {
        grid[r] = [];
        for (let c = 0; c < RG.COLS; c++) {
          const el = document.querySelector(
            '.tile[data-r="' + r + '"][data-c="' + c + '"]'
          );
          if (!el || !el.dataset.type) {
            grid[r][c] = RG.createCell(null, null);
          } else {
            grid[r][c] = RG.createCell(
              el.dataset.type,
              el.dataset.special || null
            );
          }
        }
      }
      return grid;
    }
    const grid = buildGridFromDOM();
    for (let r = 0; r < RG.ROWS; r++) {
      for (let c = 0; c < RG.COLS; c++) {
        const pairs = [
          [r, c + 1],
          [r + 1, c],
        ];
        for (let p = 0; p < pairs.length; p++) {
          const r2 = pairs[p][0];
          const c2 = pairs[p][1];
          if (r2 >= RG.ROWS || c2 >= RG.COLS) continue;
          if (RG.wouldSwapCreateMatch(grid, r, c, r2, c2)) {
            return {
              r1: r,
              c1: c,
              r2: r2,
              c2: c2,
              t1: grid[r][c].type,
              t2: grid[r2][c2].type,
            };
          }
        }
      }
    }
    return null;
  });

  console.log("Valid swap pair (RH_GRID):", JSON.stringify(pair, null, 2));
  console.log("Monster HP before:", hpBeforeDrag, "(parsed:", hpNumBefore + ")");

  if (!pair) {
    console.log("No valid swap in initial grid.");
    await browser.close();
    process.exit(1);
  }

  const tileA = page.locator(
    '.tile[data-r="' + pair.r1 + '"][data-c="' + pair.c1 + '"]'
  );
  const tileB = page.locator(
    '.tile[data-r="' + pair.r2 + '"][data-c="' + pair.c2 + '"]'
  );

  const a = await tileA.boundingBox();
  const b = await tileB.boundingBox();
  if (!a || !b) {
    console.log("No bounding boxes", { a, b });
    await browser.close();
    process.exit(1);
  }

  const x0 = a.x + a.width / 2;
  const y0 = a.y + a.height / 2;
  const x1 = b.x + b.width / 2;
  const y1 = b.y + b.height / 2;

  console.log("Mouse drag", { x0, y0 }, "→", { x1, y1 });

  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 10 });
  await page.mouse.up();

  await page.waitForTimeout(700);

  const hpAfterDrag = await page.locator("#monsterHpText").textContent();
  const hpNumAfter = firstHpNumber(hpAfterDrag);

  console.log("Monster HP after:", hpAfterDrag, "(parsed:", hpNumAfter + ")");

  const damageDealt =
    !isNaN(hpNumBefore) &&
    !isNaN(hpNumAfter) &&
    hpNumAfter < hpNumBefore;

  console.log(
    "Interpretation: a valid swap clears matches and refills tiles — " +
      "do NOT expect only two tiles to swap colors. " +
      "Damage dealt (monster HP dropped):",
    damageDealt
  );

  if (!damageDealt) {
    console.log("Possible issue: pointer/mouse did not complete a swap.");
    console.log("Sample console:", logs.slice(0, 15));
  }

  await browser.close();
  process.exit(damageDealt ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
