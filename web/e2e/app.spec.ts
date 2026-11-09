import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Any uncaught error in the page fails the test that caused it (tests in one worker run one at a time)
let pageErrors: string[] = [];
test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
});
test.afterEach(() => {
    expect(pageErrors, "errors in the page").toEqual([]);
});

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

/** The element is what a person would click at its centre: not hidden behind a panel or clipped by a container. */
async function expectOnTop(page: Page, name: string) {
    const item = page.getByRole("menuitem", { name, exact: true });
    await expect(item).toBeVisible();
    const box = (await item.boundingBox())!;
    const onTop = await item.evaluate((element, [x, y]) => element.contains(document.elementFromPoint(x!, y!)), [box.x + box.width / 2, box.y + box.height / 2]);
    expect(onTop, `${name} is covered or clipped`).toBe(true);
}

type Point = { x: number; y: number };

/** A real finger: touch, hold a moment, move, lift (Playwright's mouse would be a mouse even on a phone). */
async function touchDrag(page: Page, from: Point, to: Point) {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", at?: Point) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: at ? [at] : [] });
    await touch("touchStart", from);
    await page.waitForTimeout(400);
    for (let i = 1; i <= 10; i++) await touch("touchMove", { x: from.x + ((to.x - from.x) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10 });
    await touch("touchEnd");
    await cdp.detach();
}

async function mouseDrag(page: Page, from: Point, to: Point) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
}

const centreOf = async (locator: Locator): Promise<Point> => {
    const box = (await locator.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** Each element's symbol and label area on the screen. */
const elementBoxes = (page: Page) => page.locator("[data-node] .hit").evaluateAll((hits) => hits.map((hit) => hit.getBoundingClientRect().toJSON() as DOMRect));

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
    for (const item of ["New diagram", "Open…", "Save", "Export SVG", "Export PNG", "Print or save as PDF"]) await expectOnTop(page, item);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Save", exact: true }).click()]);
    expect(download.suggestedFilename()).toBe("diagram.plantline.json");
    const file = JSON.parse(await readFile((await download.path())!, "utf8"));
    expect(file).toMatchObject({ format: "plantline", version: 2, diagram: { plantType: "solar" } });
    expect(file.diagram.nodes).toHaveLength(3);
    expect(file.diagram.links).toHaveLength(2);
    await expectNoSidewaysScroll(page);
});

test("drags an element from the palette onto the drawing; tapped elements never land on each other", async ({ page }) => {
    await start(page, "Solar PV");
    const canvas = await page.locator(".canvas").boundingBox();
    const target = { x: canvas!.x + canvas!.width / 2 - 60, y: canvas!.y + 80 };
    if (isPhone(page)) {
        await page.getByRole("navigation").getByRole("button", { name: "Add" }).click();
        await touchDrag(page, await centreOf(page.getByRole("button", { name: "Inverter", exact: true })), target);
    } else {
        await mouseDrag(page, await centreOf(page.getByRole("button", { name: "Inverter", exact: true })), target);
        // Dropped back on the palette: nothing is added
        await mouseDrag(page, await centreOf(page.getByRole("button", { name: "Busbar", exact: true })), await centreOf(page.getByRole("button", { name: "Fuse", exact: true })));
    }
    await expect(page.locator("[data-node]")).toHaveCount(1);
    const [dropped] = await elementBoxes(page);
    // The symbol (at the start of its box) is centred on the grid point under the pointer
    expect(Math.abs(dropped!.x + 24 - target.x)).toBeLessThanOrEqual(15);
    expect(Math.abs(dropped!.y + 24 - target.y)).toBeLessThanOrEqual(15);

    for (const element of ["Inverter", "Busbar", "Transformer"]) await add(page, element);
    const boxes = await elementBoxes(page);
    expect(boxes).toHaveLength(4);
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => expect(a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom, "two elements overlap").toBe(false)));
});

test("draws a line from a connection point and moves its end to another element", async ({ page }) => {
    await start(page, "Solar PV");
    for (const element of ["Busbar", "Grid connection", "Inverter"]) await add(page, element);
    const [busbar, grid, inverter] = [0, 1, 2].map((index) => page.locator("[data-node]").nth(index));
    const drag = (from: Point, to: Point) => (isPhone(page) ? touchDrag(page, from, to) : mouseDrag(page, from, to));
    const links = page.locator("[data-link]");

    // From the grid connection's only connection point (its bottom) to the busbar
    await grid!.click();
    await drag(await centreOf(grid!.locator('[data-port="down"] .port-dot')), await centreOf(busbar!.locator(".hit")));
    await expect(links).toHaveCount(1);
    // Dropped on the empty drawing: no line
    await inverter!.click();
    const canvas = (await page.locator(".canvas").boundingBox())!;
    await drag(await centreOf(inverter!.locator('[data-port="up"] .port-dot')), { x: canvas.x + 20, y: canvas.y + 20 });
    await expect(links).toHaveCount(1);

    // Select the line halfway along it, then drag its busbar end onto the inverter
    await page.getByRole("button", { name: "Arrange automatically" }).click();
    // Again until the view has settled on the arranged diagram
    await expect(async () => {
        const middle = await links.locator("path").first().evaluate((path: SVGPathElement) => {
            const point = path.getPointAtLength(path.getTotalLength() / 2);
            const matrix = path.getScreenCTM()!;
            return { x: point.x * matrix.a + matrix.e, y: point.y * matrix.d + matrix.f };
        });
        await page.mouse.click(middle.x, middle.y);
        await expect(page.locator('[data-end="to"]')).toBeVisible({ timeout: 500 });
    }).toPass();
    await drag(await centreOf(page.locator('[data-end="to"]')), await centreOf(inverter!.locator(".hit")));
    await expect(links).toHaveCount(1);
    if (isPhone(page)) await page.getByRole("navigation").getByRole("button", { name: /Properties/ }).click();
    await expect(page.getByText("Grid connection — Inverter")).toBeVisible();
});

/** A point on the first line, a fraction of the way along it, on the screen. */
const alongLine = (page: Page, fraction: number) =>
    page
        .locator("[data-link] path")
        .first()
        .evaluate((path: SVGPathElement, at) => {
            const point = path.getPointAtLength(path.getTotalLength() * at);
            const matrix = path.getScreenCTM()!;
            return { x: point.x * matrix.a + matrix.e, y: point.y * matrix.d + matrix.f };
        }, fraction);

const bends = (page: Page) => page.locator("[data-link] path").first().getAttribute("d").then((d) => (d ?? "").split("L").length - 1);

test("bends a line by dragging it, undoes and redoes that, and removes the bend with a double click", async ({ page }) => {
    await start(page, "Substation");
    for (const element of ["Busbar", "Circuit breaker"]) await add(page, element);
    const [busbar, breaker] = [0, 1].map((index) => page.locator("[data-node]").nth(index));
    await busbar!.click();
    await mouseDrag(page, await centreOf(busbar!.locator('[data-port="0"] .port-dot')), await centreOf(breaker!));
    await page.getByRole("button", { name: "Arrange automatically" }).click();
    // A straight drop from the bar: three points of the route, the middle one of zero length
    await expect.poll(() => bends(page)).toBe(3);

    // Dragging the end above the breaker sideways steps the line out of its lead and back
    await expect(async () => {
        const grip = await alongLine(page, 0.8);
        await mouseDrag(page, grip, { x: grip.x + 80, y: grip.y });
        expect(await bends(page)).toBe(5);
    }).toPass();
    await page.getByRole("button", { name: "Undo" }).click();
    expect(await bends(page)).toBe(3);
    await page.getByRole("button", { name: "Redo" }).click();
    expect(await bends(page)).toBe(5);

    // A double click on the moved segment removes the bend; the line routes itself again
    const moved = await alongLine(page, 0.6);
    await page.mouse.dblclick(moved.x, moved.y);
    await expect.poll(() => bends(page)).toBe(3);
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

test("moves and turns a drawing on the map with its handles", async ({ page }) => {
    await start(page, "Wind farm");
    await page.getByRole("tab", { name: "Plant layout" }).click();
    await page.getByRole("button", { name: /Try a sample/ }).click();
    const drag = async (handle: Locator, dx: number, dy: number) => {
        await expect(handle).toBeVisible({ timeout: 60_000 });
        const from = await centreOf(handle);
        await mouseDrag(page, from, { x: from.x + dx, y: from.y + dy });
    };
    await drag(page.locator(".map-handle.move"), 60, -40);
    // From straight above the centre to its right: a quarter turn clockwise
    await drag(page.locator(".map-handle.turn"), 72, 72);
    if (isPhone(page)) await page.getByRole("button", { name: "Drawing details" }).click();
    await expect(page.getByText("(-90°)")).toBeVisible();
    expect(Number(await page.getByRole("textbox", { name: "Latitude" }).inputValue())).toBeGreaterThan(38.62);
    expect(Number(await page.getByRole("textbox", { name: "Longitude" }).inputValue())).toBeGreaterThan(27.18);
});

test("reports a reader that cannot start at once, and reads the drawing after trying again", async ({ page }) => {
    await start(page, "Wind farm");
    const runtimeFile = /System\.Linq\.[^/]*\.wasm$/;
    await page.context().route(runtimeFile, (route) => route.abort());
    await page.getByRole("tab", { name: "Plant layout" }).click();
    const clicked = Date.now();
    await page.getByRole("button", { name: /Try a sample/ }).click();
    await expect(page.getByRole("alert")).toHaveText(/could not be loaded/, { timeout: 20_000 });
    expect(Date.now() - clicked).toBeLessThan(20_000);
    // The failed downloads are reported by the browser as errors of the page: expected here
    pageErrors = [];

    await page.context().unroute(runtimeFile);
    await page.getByRole("button", { name: "Try again" }).click();
    if (isPhone(page)) await page.getByRole("button", { name: "Drawing details" }).click();
    await expect(page.locator(".totals tr", { hasText: "Wind turbine" }).locator("td").last()).toHaveText("8", { timeout: 60_000 });
});

test("cancels a reading and ends its worker", async ({ page }) => {
    await start(page, "Wind farm");
    // The reader's start is held, so the reading is still going when Cancel is pressed
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.context().route(/dotnet\.js$/, async (route) => {
        await held;
        await route.continue().catch(() => {});
    });
    await page.getByRole("tab", { name: "Plant layout" }).click();
    const worker = page.waitForEvent("worker");
    await page.getByRole("button", { name: /Try a sample/ }).click();
    const closed = worker.then((started) => new Promise((resolve) => started.on("close", resolve)));
    await expect(page.getByRole("status")).toContainText("Reading the drawing");
    await page.getByRole("button", { name: "Cancel" }).click();
    await closed;
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    release();
});

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

test("shows its own fonts, Estedad for Persian, and has app icons and a link preview", async ({ page, request }) => {
    const loadedFonts = () =>
        page.evaluate(async () => {
            await document.fonts.ready;
            return [...document.fonts].filter((font) => font.status === "loaded").map((font) => font.family.replaceAll('"', ""));
        });
    await start(page, "Solar PV");
    await expect(page.getByRole("link", { name: "plantline" })).toBeVisible();
    await expect.poll(loadedFonts).toContain("Inter Variable");
    await page.getByRole("combobox", { name: "Language" }).selectOption("fa");
    await expect.poll(loadedFonts).toContain("Estedad Variable");

    const href = (selector: string, name: string) => page.locator(selector).getAttribute(name).then((value) => new URL(value!, page.url()));
    const manifestUrl = await href('link[rel="manifest"]', "href");
    const manifest = (await (await request.get(manifestUrl.href)).json()) as { icons: { src: string }[] };
    const previewImage = (await href('meta[property="og:image"]', "content")).pathname.split("/").pop()!;
    const files = [...manifest.icons.map((icon) => new URL(icon.src, manifestUrl)), await href('link[rel="apple-touch-icon"]', "href"), new URL(previewImage, page.url())];
    expect(files).toHaveLength(6);
    for (const file of files) expect((await request.get(file.href)).ok(), file.href).toBe(true);
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
