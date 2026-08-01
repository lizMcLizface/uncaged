#!/usr/bin/env node
// Reusable Playwright driver for visual verification against the CRA dev
// server. Lives at a fixed repo path (not the session scratch directory) so
// its Bash invocation is stable across sessions and can be allowlisted once
// (Bash(node scripts/screenshot.js *)) instead of re-approved every time a
// new scratch-dir UUID made the old ad-hoc scripts unrecognizable.
//
// Since this file lives inside the repo, `require('playwright')` resolves
// through the repo's own node_modules - no NODE_PATH workaround needed,
// unlike a script written outside the tree.
//
// Usage:
//   node scripts/screenshot.js --out <dir> [--url http://localhost:3000]
//     [--wait-for ".fretboard"] [--tabs "Tab A,Tab B,Tab C"]
//     [--width 1600] [--height 1200]
//
// Writes <out>/00-default.png, then one <out>/NN-<slug>.png per tab clicked
// (exact-text match against the tab bar), plus <out>/errors.json (page
// errors and console.error calls collected across the whole run). Exits 1
// if any errors were collected, so a calling script can check $? without
// re-parsing errors.json.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
    const args = { url: 'http://localhost:3000', waitFor: '.fretboard', width: 1600, height: 1200, tabs: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--out') args.out = argv[++i];
        else if (a === '--url') args.url = argv[++i];
        else if (a === '--wait-for') args.waitFor = argv[++i];
        else if (a === '--width') args.width = parseInt(argv[++i], 10);
        else if (a === '--height') args.height = parseInt(argv[++i], 10);
        else if (a === '--tabs') args.tabs = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
        else if (a === '--help' || a === '-h') { args.help = true; }
    }
    return args;
}

function slugify(label) {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help || !args.out) {
        console.log(__filename.split(path.sep).pop() + ' --out <dir> [--url URL] [--wait-for SELECTOR] [--tabs "A,B,C"] [--width N] [--height N]');
        process.exit(args.help ? 0 : 1);
    }

    fs.mkdirSync(args.out, { recursive: true });

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: args.width, height: args.height } });
    const errors = [];
    page.on('pageerror', e => errors.push({ type: 'pageerror', message: e.message }));
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push({ type: 'console.error', message: msg.text() });
    });

    await page.goto(args.url, { waitUntil: 'networkidle', timeout: 30000 });
    if (args.waitFor) {
        await page.waitForSelector(args.waitFor, { timeout: 15000 });
    }
    await page.waitForTimeout(1200);

    await page.screenshot({ path: path.join(args.out, '00-default.png'), fullPage: false });

    let n = 1;
    for (const tab of args.tabs) {
        const locator = page.getByText(tab, { exact: true }).first();
        try {
            await locator.click({ timeout: 10000 });
            await page.waitForTimeout(900);
            const file = `${String(n).padStart(2, '0')}-${slugify(tab)}.png`;
            await page.screenshot({ path: path.join(args.out, file), fullPage: false });
        } catch (e) {
            errors.push({ type: 'tab-click-failed', tab, message: e.message });
        }
        n++;
    }

    fs.writeFileSync(path.join(args.out, 'errors.json'), JSON.stringify(errors, null, 2));
    console.log(`Screenshots written to ${args.out}`);
    console.log(`Errors: ${errors.length}`);
    if (errors.length) {
        console.log(JSON.stringify(errors, null, 2));
    }

    await browser.close();
    process.exit(errors.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
