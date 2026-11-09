// Renders the app icons, the link preview image and the README header from the mark in public/favicon.svg, with Inter
// for the words. After changing the mark or the colours: `pnpm brand`, then commit the images.
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const mark = `data:image/svg+xml;base64,${(await readFile(new URL("public/favicon.svg", root))).toString("base64")}`;
const inter = (await readFile(new URL("node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2", root))).toString("base64");
const LIGHT = { ink: "#111827", muted: "#5b6472", accent: "#15803d", bg: "#f6f7f9", dot: "#c3cad3" };
const DARK = { ink: "#e6eaef", accent: "#4ade80" };

const browser = await chromium.launch();

/** Saves a picture of `html`'s single root element; in the dark scheme the mark takes its dark colours. */
async function render(file, html, { scale = 1, dark = false } = {}) {
    const page = await browser.newPage({ deviceScaleFactor: scale, colorScheme: dark ? "dark" : "light" });
    await page.setContent(`<!doctype html><style>
        @font-face { font-family: Inter; font-weight: 100 900; src: url(data:font/woff2;base64,${inter}) format("woff2"); }
        body { margin: 0; font-family: Inter; } body > * { width: max-content; } img { display: block; }
        </style>${html}`);
    await page.evaluate(() => document.fonts.ready);
    await page.locator("body > *").screenshot({ path: new URL(file, root).pathname, omitBackground: true });
    await page.close();
    console.log(file);
}

const icon = (size) => `<img src="${mark}" width="${size}" height="${size}">`;
// Full-bleed icons: the mark on its own colour, so only the feeders show; a maskable icon keeps them in the middle 80 %
const square = (size, markSize) => `<div style="display: grid; place-items: center; width: ${size}px; height: ${size}px; background: ${LIGHT.accent}">${icon(markSize)}</div>`;
const wordmark = ({ ink, accent }) => `<div style="display: flex; align-items: center; gap: 14px; height: 64px">${icon(52)}
    <span style="font-size: 44px; font-weight: 700; letter-spacing: -0.02em; color: ${ink}">plant<span style="color: ${accent}">line</span></span></div>`;

await render("public/icon-192.png", icon(192));
await render("public/icon-512.png", icon(512));
await render("public/icon-maskable.png", square(512, 400));
await render("public/apple-touch-icon.png", square(180, 180));
await render("../docs/images/logo-light.png", wordmark(LIGHT), { scale: 2 });
await render("../docs/images/logo-dark.png", wordmark(DARK), { scale: 2, dark: true });
await render(
    "public/social.png",
    `<div style="box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; width: 1200px; height: 630px; padding: 0 96px;
        color: ${LIGHT.ink}; background: ${LIGHT.bg} radial-gradient(${LIGHT.dot} 1.5px, transparent 1.5px) 0 0 / 28px 28px">
        <div style="display: flex; align-items: center; gap: 28px">${icon(124)}
            <span style="font-size: 112px; font-weight: 700; letter-spacing: -0.03em">plant<span style="color: ${LIGHT.accent}">line</span></span></div>
        <p style="margin: 44px 0 0; font-size: 46px; font-weight: 600; line-height: 1.2">Single-line diagrams and DWG/DXF plant layouts in your browser</p>
        <p style="margin: 24px 0 0; font-size: 30px; font-weight: 600; color: ${LIGHT.accent}">Solar · Wind · Storage · Hydro · Substations · Transmission</p>
        <p style="margin: 52px 0 0; font-size: 26px; color: ${LIGHT.muted}">Free and open source · araminix.github.io/plantline</p></div>`,
);
await browser.close();
