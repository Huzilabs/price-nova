/**
 * Log in and capture every page, asserting no horizontal overflow and no
 * console errors along the way. This is the smoke test for the whole app.
 *
 * Usage: node scripts/tour.mjs [outDir] [width] [height]
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE ?? "http://localhost:3000";
const [outDir = "/tmp/pn-shots", w = "1500", h = "1000"] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const PUBLIC = [
  ["home-guest", "/"],
  ["signup", "/signup"],
  ["draws-guest", "/draws"],
  ["forgot", "/forgot"],
  ["admin-login", "/admin/login"],
];

const PAGES = [
  ["home", "/"],
  ["draws", "/draws"],
  ["referrals", "/referrals"],
  ["wallet", "/wallet"],
  ["activity", "/activity"],
  ["entries", "/entries"],
  ["rewards", "/rewards"],
  ["profile", "/profile"],
  ["join", "/join"],
  ["design", "/design"],
  ["admin", "/admin"],
  ["admin-payment-accounts", "/admin/payment-accounts"],
  ["admin-deposits", "/admin/deposits"],
  ["admin-withdrawals", "/admin/withdrawals"],
  ["admin-users", "/admin/users"],
  ["admin-draws", "/admin/draws"],
  ["admin-bumper", "/admin/bumper"],
  ["admin-referrals", "/admin/referrals"],
  ["admin-ledger", "/admin/ledger"],
  ["admin-audit", "/admin/audit"],
  ["admin-plans", "/admin/plans"],
  ["admin-settings", "/admin/settings"],
];

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  args: ["--hide-scrollbars", "--disable-gpu"],
});
const page = await browser.newPage();
await page.setViewport({ width: Number(w), height: Number(h), deviceScaleFactor: 2 });

const errors = [];
page.on("console", (m) => {
  const t = m.text();
  if (m.type() === "error" && !t.includes("favicon") && !t.includes("404")) errors.push(t);
});
page.on("pageerror", (e) => errors.push(String(e)));

// --- Public pages, signed out ----------------------------------------------
for (const [name, path] of PUBLIC) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0", timeout: 90000 });
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  console.log(`${res.status() === 200 ? "ok  " : "FAIL"} guest ${path} ${res.status()}`);
}

// --- Sign in ---------------------------------------------------------------
// Admin surface has its own sign-in now, and it is the one that grants the
// console. Signing in there also yields a session valid for the member pages.
await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle0" });
await page.type('input[name="email"]', "johntest@gmail.com");
await page.type('input[name="password"]', "johntest123");
await page.click('button[type="submit"]');
for (let i = 0; i < 40 && page.url().includes("/admin/login"); i++) {
  await new Promise((r) => setTimeout(r, 250));
}
await new Promise((r) => setTimeout(r, 600));
console.log(`signed in -> ${page.url()}`);
if (page.url().includes("/admin/login")) {
  const msg = await page.$eval('[role="alert"]', (el) => el.textContent).catch(() => "no alert");
  console.log(`LOGIN FAILED: ${msg}`);
  await browser.close();
  process.exit(1);
}

// --- Tour ------------------------------------------------------------------
let failures = 0;
for (const [name, path] of PAGES) {
  const before = errors.length;
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0", timeout: 90000 });
  await new Promise((r) => setTimeout(r, 250));

  const audit = await page.evaluate((vw) => {
    const doc = document.documentElement;
    const wide = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= vw + 1) continue;
      let scroller = null;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll" || ox === "hidden") { scroller = p; break; }
      }
      if (!scroller) wide.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 50)}`);
    }
    return { over: doc.scrollWidth - doc.clientWidth, wide: wide.slice(0, 3), title: document.title };
  }, Number(w));

  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });

  const newErrors = errors.slice(before);
  const bad = res.status() >= 400 || audit.over > 0 || newErrors.length > 0;
  if (bad) failures += 1;
  console.log(
    `${bad ? "FAIL" : "ok  "} ${path.padEnd(22)} ${res.status()} ` +
    `${audit.over > 0 ? `overflow +${audit.over}px ${audit.wide.join(", ")}` : ""}` +
    `${newErrors.length ? ` errors: ${newErrors[0].slice(0, 90)}` : ""}`,
  );
}

await browser.close();
console.log(failures === 0 ? "\nAll pages clean." : `\n${failures} page(s) with problems.`);
