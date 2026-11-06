import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

/** Starts as a first-time visitor in English and picks the plant type. */
async function start(page: Page, plant: string) {
    await page.addInitScript(() => {
        if (!sessionStorage.getItem("started")) {
            localStorage.clear();
            localStorage.setItem("plantline.lang", '"en"');
            sessionStorage.setItem("started", "1");
        }
    });
    await page.goto("/");
    await page.getByRole("dialog").getByRole("button", { name: plant }).click();
}

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024;

async function add(page: Page, element: string) {
    if (isPhone(page)) await page.getByRole("navigation").getByRole("button", { name: "Add" }).click();
    await page.getByRole("complementary", { name: "Elements" }).getByRole("button", { name: element, exact: true }).click();
}

async function expectNoSidewaysScroll(page: Page) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
}

test("builds, connects, checks and saves a single-line diagram", async ({ page }) => {
    await start(page, "Solar PV");
    for (const element of ["Grid connection", "Busbar", "Inverter"]) await add(page, element);
    await page.getByRole("button", { name: "Arrange automatically" }).click();
    await page.getByRole("button", { name: "Fit to screen" }).click();

    const nodes = page.locator("[data-node]");
    await expect(nodes).toHaveCount(3);
    // Nothing selected, so Connect waits for the first element (with one selected, it starts from that one)
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Connect elements" }).click();
    await nodes.nth(0).click();
    await nodes.nth(1).click();
    await nodes.nth(1).click();
    await nodes.nth(2).click();
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-link]")).toHaveCount(2);

    if (isPhone(page)) await page.getByRole("navigation").getByRole("button", { name: /Properties/ }).click();
    await expect(page.getByText("No problems found.")).toBeVisible();

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator("[data-link]")).toHaveCount(1);
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(page.locator("[data-link]")).toHaveCount(2);

    await page.getByRole("button", { name: "File" }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Save", exact: true }).click()]);
    expect(download.suggestedFilename()).toBe("diagram.plantline.json");
    const file = JSON.parse(await readFile((await download.path())!, "utf8"));
    expect(file).toMatchObject({ format: "plantline", version: 1, diagram: { plantType: "solar" } });
    expect(file.diagram.nodes).toHaveLength(3);
    expect(file.diagram.links).toHaveLength(2);
    await expectNoSidewaysScroll(page);
});

test("refuses a file that is not a diagram and keeps working", async ({ page }) => {
    await start(page, "Substation");
    await page.getByRole("button", { name: "File" }).click();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("menuitem", { name: "Open…" }).click()]);
    await chooser.setFiles({ name: "evil.plantline.json", mimeType: "application/json", buffer: Buffer.from('{"format":"plantline","version":1,"diagram":{"nodes":"<script>"}}') });
    await expect(page.getByRole("alert")).toHaveText("This file is not a plantline diagram.");
    await add(page, "Circuit breaker");
    await expect(page.locator("[data-node]")).toHaveCount(1);
});

const samples = [
    { plant: "Solar PV", kind: "PV table", count: "40" },
    { plant: "Wind farm", kind: "Wind turbine", count: "8" },
    { plant: "Battery storage", kind: "Battery", count: "12" },
    { plant: "Hydropower", kind: "Generator", count: "3" },
    { plant: "Substation", kind: "Circuit breaker", count: "8" },
    { plant: "Transmission line", kind: "Tower", count: "15" },
];

for (const sample of samples) {
    test(`reads the ${sample.plant} sample drawing and counts it`, async ({ page }) => {
        await start(page, sample.plant);
        await page.getByRole("tab", { name: "Plant layout" }).click();
        await page.getByRole("button", { name: /Try a sample/ }).click();
        if (isPhone(page)) await page.getByRole("button", { name: "Drawing details" }).click();
        const row = page.locator(".totals tr", { hasText: sample.kind }).first();
        await expect(row.locator("td").last()).toHaveText(sample.count, { timeout: 60_000 });
        await expect(page.locator(".leaflet-overlay-pane canvas, .leaflet-overlay-pane svg").first()).toBeAttached();
        await expectNoSidewaysScroll(page);
    });
}

test("opens a DXF chosen by the user, and reports a file that is not a drawing", async ({ page }) => {
    await start(page, "Solar PV");
    await page.getByRole("tab", { name: "Plant layout" }).click();

    const [bad] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Open a drawing" }).click()]);
    await bad.setFiles({ name: "broken.dwg", mimeType: "application/octet-stream", buffer: Buffer.from("AC1032 not really a drawing") });
    await expect(page.getByRole("alert")).toHaveText("This drawing could not be read.", { timeout: 60_000 });

    const [good] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Open a drawing" }).click()]);
    await good.setFiles("public/samples/solar-plant.dxf");
    if (isPhone(page)) await page.getByRole("button", { name: "Drawing details" }).click();
    await expect(page.locator(".totals tr", { hasText: "PV string" }).locator("td").last()).toHaveText("80", { timeout: 60_000 });
    await expect(page.getByText(/Installed capacity/)).toContainText("1.23 MWp");
});

test("mirrors the layout in Persian and keeps it usable", async ({ page }) => {
    await start(page, "Wind farm");
    await page.getByRole("combobox", { name: "Language" }).selectOption("fa");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("tab", { name: "دیاگرام تک‌خطی" })).toBeVisible();
    if (!isPhone(page)) {
        const palette = await page.getByRole("complementary", { name: "اجزا" }).boundingBox();
        const inspector = await page.getByRole("complementary", { name: "ویژگی‌ها" }).boundingBox();
        expect(palette!.x).toBeGreaterThan(inspector!.x);
    }
    await expectNoSidewaysScroll(page);
});
