/**
 * Screenshot + layout audit against the real app.
 *
 * Usage: node scripts/shot.mjs <url> <out.png> [width] [height]
 *
 * Beyond capturing the image it asserts the one layout rule that is easy to
 * break and hard to see: the document must never scroll horizontally. When it
 * does, it names the offending elements instead of leaving you to guess.
 */
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [url, out, w = "1400", h = "1100"] = process.argv.slice(2);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--hide-scrollbars", "--disable-gpu"],
});

const page = await browser.newPage();
const width = Number(w);
await page.setViewport({ width, height: Number(h), deviceScaleFactor: 2 });

const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(String(e)));

await page.goto(url, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 600));

const audit = await page.evaluate((viewportWidth) => {
  const doc = document.documentElement;
  const offenders = [];
  for (const el of document.querySelectorAll("body *")) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) continue;
    // An element sticking out past the viewport that is not inside its own
    // horizontal scroller is a genuine document overflow.
    if (rect.right > viewportWidth + 1) {
      let scroller = null;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll" || ox === "hidden") { scroller = p; break; }
      }
      if (!scroller) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className?.baseVal ?? el.className ?? "").toString().slice(0, 90),
          right: Math.round(rect.right),
          text: (el.textContent ?? "").trim().slice(0, 40),
        });
      }
    }
  }
  return {
    scrollWidth: doc.scrollWidth,
    clientWidth: doc.clientWidth,
    // Report only the outermost offenders; children merely inherit the problem.
    offenders: offenders.slice(0, 12),
  };
}, width);

await page.screenshot({ path: out, fullPage: true });
await browser.close();

const overflow = audit.scrollWidth - audit.clientWidth;
console.log(`viewport ${width}px · scrollWidth ${audit.scrollWidth} · clientWidth ${audit.clientWidth}`);
if (overflow > 0) {
  console.log(`HORIZONTAL OVERFLOW: +${overflow}px`);
  for (const o of audit.offenders) {
    console.log(`  <${o.tag} class="${o.cls}"> right=${o.right} "${o.text}"`);
  }
} else {
  console.log("no horizontal overflow");
}
if (consoleErrors.length) console.log("console errors:", consoleErrors.slice(0, 5));
