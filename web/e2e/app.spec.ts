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

/** A toolbar action: its button, or on a phone (whose toolbar keeps the most used ones) an item of the bottom bar's More menu. */
async function act(page: Page, name: string) {
    if (!isPhone(page)) return page.getByRole("button", { name, exact: true }).click();
    await page.getByRole("navigation").getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name, exact: true }).click();
}

/** Opens the file actions: the File menu, or on a phone the bottom bar's More menu that holds them (a sheet closed first). */
async function openFileMenu(page: Page) {
    if (!isPhone(page)) return page.getByRole("button", { name: "File" }).click();
    const sheet = page.locator(".panel.open .sheet-close");
    if (await sheet.count()) await sheet.click();
    await page.getByRole("navigation").getByRole("button", { name: "More" }).click();
}

/** Chooses the language in the header, or on a phone in the settings menu. */
async function chooseLanguage(page: Page, code: string) {
    if (isPhone(page)) await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("combobox", { name: "Language" }).selectOption(code);
}

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
async function touchDrag(page: Page, from: Point, to: Point, holdMs = 400) {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", at?: Point) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: at ? [at] : [] });
    await touch("touchStart", from);
    await page.waitForTimeout(holdMs);
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

    await openFileMenu(page);
    for (const item of ["New diagram", "Open…", "Save", "Export SVG", "Export PNG", "Print or save as PDF"]) await expectOnTop(page, item);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Save", exact: true }).click()]);
    expect(download.suggestedFilename()).toBe("diagram.plantline.json");
    const file = JSON.parse(await readFile((await download.path())!, "utf8"));
    expect(file).toMatchObject({ format: "plantline", version: 3, diagram: { plantType: "solar" } });
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

/** Each element's place on the drawing, from its transform. */
const places = (page: Page) =>
    page.locator("[data-node]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("transform")!.match(/translate\(([-\d.]+) ([-\d.]+)\)/)!.slice(1).map(Number) as [number, number]));

const openProperties = async (page: Page) => {
    if (isPhone(page)) await page.getByRole("navigation").getByRole("button", { name: /Properties/ }).click();
};
const closeSheet = async (page: Page) => {
    if (isPhone(page)) await page.locator(".panel.open .sheet-close").click();
};

test("selects elements by area, aligns, duplicates and turns them", async ({ page }) => {
    await start(page, "Substation");
    for (const element of ["Circuit breaker", "Disconnector", "Energy meter"]) await add(page, element);
    // Around all three, from an empty corner (a finger holds still first)
    const boxes = await elementBoxes(page);
    const from = { x: Math.min(...boxes.map((b) => b.left)) - 30, y: Math.min(...boxes.map((b) => b.top)) - 30 };
    const to = { x: Math.max(...boxes.map((b) => b.right)) + 10, y: Math.max(...boxes.map((b) => b.bottom)) + 10 };
    if (isPhone(page)) await touchDrag(page, from, to, 700);
    else await mouseDrag(page, from, to);
    await openProperties(page);
    await expect(page.getByRole("heading", { name: "3 elements selected" })).toBeVisible();

    await page.getByRole("button", { name: "Align centres" }).click();
    expect(new Set((await places(page)).map(([x]) => x)).size).toBe(1);
    await page.getByRole("button", { name: "Duplicate" }).click();
    await expect(page.locator("[data-node]")).toHaveCount(6);
    const all = await elementBoxes(page);
    all.forEach((a, i) => all.slice(i + 1).forEach((b) => expect(a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom, "two elements overlap").toBe(false)));

    await closeSheet(page);
    await page.locator("[data-node]").first().click();
    await openProperties(page);
    await page.getByRole("button", { name: "Rotate 90°" }).click();
    await expect(page.locator("[data-node]").first().locator("g[transform]").first()).toHaveAttribute("transform", /rotate\(90\)/);
});

test("resizes a busbar by its end and moves a label; copies, pastes and nudges with the keyboard", async ({ page }) => {
    await start(page, "Substation");
    await add(page, "Busbar");
    const drag = (a: Point, b: Point) => (isPhone(page) ? touchDrag(page, a, b) : mouseDrag(page, a, b));
    const end = await centreOf(page.locator('[data-resize="end"]'));
    await drag(end, { x: end.x + 80, y: end.y });
    await openProperties(page);
    await expect(page.getByRole("textbox", { name: "Length" })).toHaveValue("320");
    await closeSheet(page);

    await add(page, "Circuit breaker");
    const label = page.locator("[data-node]").nth(1).locator("[data-label]");
    const before = Number(await label.getAttribute("x"));
    const grip = await centreOf(label);
    await drag(grip, { x: grip.x + 40, y: grip.y - 30 });
    await expect.poll(async () => Number(await label.getAttribute("x"))).toBeGreaterThan(before + 20);

    if (isPhone(page)) return;
    await page.keyboard.press("Control+a");
    await expect(page.getByRole("heading", { name: "2 elements selected" })).toBeVisible();
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await expect(page.locator("[data-node]")).toHaveCount(4);
    const pasted = (await places(page)).slice(2);
    await page.keyboard.press("ArrowRight");
    expect((await places(page)).slice(2)).toEqual(pasted.map(([x, y]) => [x + 20, y]));
});

test("shows and resets the zoom, zooms to the selection, moves by the overview; adds texts and areas; lists the shortcuts", async ({ page }) => {
    await start(page, "Solar PV");
    await add(page, "Inverter");
    const level = page.getByRole("button", { name: "Zoom to 100 %" });
    await expect(level).toHaveText("100%");
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(level).toHaveText("125%");
    await level.click();
    await expect(level).toHaveText("100%");
    await act(page, "Zoom to selection");
    await expect(level).toHaveText("200%");

    const view = () => page.locator(".canvas > g").getAttribute("transform");
    if (!isPhone(page)) {
        const overview = page.getByRole("img", { name: /Overview/ });
        const before = await view();
        const corner = (await overview.boundingBox())!;
        await page.mouse.click(corner.x + 8, corner.y + 8);
        expect(await view()).not.toBe(before);
    } else {
        await expect(page.getByRole("img", { name: /Overview/ })).toBeHidden();
    }

    await act(page, "Add a text");
    await openProperties(page);
    const text = page.getByRole("textbox", { name: "Text" });
    await text.fill("Feeder 1\nto be built");
    await text.blur();
    await expect(page.locator("[data-note] text")).toContainText("to be built");
    await closeSheet(page);

    await act(page, "Add an area");
    await expect(page.locator("[data-note]")).toHaveCount(2);
    // The new area, selected, wholly in view
    await act(page, "Zoom to selection");
    const area = page.locator(".note-area");
    const width = Number(await area.getAttribute("width"));
    const grip = await centreOf(page.locator(".resize.corner"));
    await (isPhone(page) ? touchDrag(page, grip, { x: grip.x + 60, y: grip.y + 40 }) : mouseDrag(page, grip, { x: grip.x + 60, y: grip.y + 40 }));
    await expect.poll(async () => Number(await area.getAttribute("width"))).toBeGreaterThan(width);

    if (isPhone(page)) await act(page, "Shortcuts");
    else await page.keyboard.press("?");
    const sheet = page.getByRole("dialog", { name: "Shortcuts" });
    await expect(sheet.getByRole("row")).toHaveCount(19);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
});

test("describes a transformer with its own fields, shows them on the drawing, and has the same fields in Persian", async ({ page }) => {
    await start(page, "Substation");
    await add(page, "Transformer");
    await openProperties(page);
    const panel = page.getByRole("complementary", { name: "Properties" });
    for (const [name, value] of [
        ["HV voltage", "33"],
        ["LV voltage", "0.4"],
        ["Rated power", "1600"],
    ] as const) {
        const field = panel.getByRole("textbox", { name: new RegExp(`^${name}`) });
        await field.fill(value);
        await field.press("Enter");
    }
    await panel.getByRole("radio", { name: "Planned" }).click();
    await expect(page.locator("[data-node] text")).toContainText("33/0.4 kV · 1600 kVA");
    // Planned equipment is drawn dashed
    await expect(page.locator("[data-node] > g").first()).toHaveAttribute("stroke-dasharray", "4 3");

    const fields = await panel.locator(".field").count();
    expect(fields).toBe(2 + 3 + 5 + 1);
    await chooseLanguage(page, "fa");
    const persian = page.getByRole("complementary", { name: "ویژگی‌ها" });
    await expect(persian.locator(".field")).toHaveCount(fields);
    await expect(persian.getByRole("textbox", { name: /^ولتاژ فشار قوی/ })).toHaveValue("33");
    await expect(persian.getByRole("radio", { name: "برنامه‌ریزی‌شده" })).toHaveAttribute("aria-checked", "true");
});

test("refuses a file that is not a diagram and keeps working", async ({ page }) => {
    await start(page, "Substation");
    await openFileMenu(page);
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("menuitem", { name: "Open…" }).click()]);
    await chooser.setFiles({ name: "evil.plantline.json", mimeType: "application/json", buffer: Buffer.from('{"format":"plantline","version":1,"diagram":{"nodes":"<script>"}}') });
    await expect(page.getByRole("alert")).toHaveText("This file is not a plantline diagram.");
    await add(page, "Circuit breaker");
    await expect(page.locator("[data-node]")).toHaveCount(1);
});

const samples = [
    { plant: "Solar PV", kind: "PV table", count: "316" },
    { plant: "Wind farm", kind: "Wind turbine", count: "10" },
    { plant: "Battery storage", kind: "Battery", count: "24" },
    { plant: "Hydropower", kind: "Generator", count: "3" },
    { plant: "Substation", kind: "Circuit breaker", count: "18" },
    { plant: "Transmission line", kind: "Tower", count: "38" },
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
    // The storage sample is in its own site coordinates, so it is placed on a point the handles move
    await start(page, "Battery storage");
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
    expect(Number(await page.getByRole("textbox", { name: "Latitude" }).inputValue())).toBeGreaterThan(39.206);
    expect(Number(await page.getByRole("textbox", { name: "Longitude" }).inputValue())).toBeGreaterThan(32.7771);
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
    await expect(page.locator(".totals tr", { hasText: "Wind turbine" }).locator("td").last()).toHaveText("10", { timeout: 60_000 });
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

test("checks a drawing's unit, asks where a local drawing lies, and asks for the zone of map coordinates", async ({ page }) => {
    await start(page, "Wind farm");
    await page.getByRole("tab", { name: "Plant layout" }).click();
    const open = async (name: string, text: string) => {
        const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Open a drawing" }).click()]);
        await chooser.setFiles({ name, mimeType: "application/dxf", buffer: Buffer.from(text, "latin1") });
    };

    // The storage sample is drawn in metres; labelled millimetres, its sheet would be 42 cm across
    const storage = await readFile("public/samples/battery-storage.dxf", "latin1");
    await open("storage-mm.dxf", storage.replace(/(\$INSUNITS\r?\n *70\r?\n)\d+/, "$14"));
    const advice = page.locator(".map-banner", { hasText: "Is the drawing in m?" });
    await expect(advice).toBeVisible({ timeout: 60_000 });
    await advice.getByRole("button", { name: "Use m" }).click();
    await expect(advice).toBeHidden();

    // Local coordinates: nothing lands on the map until a click shows where the plant is
    const pick = page.locator(".map-banner", { hasText: "Click the map where the plant is." });
    await expect(pick).toBeVisible();
    await expect(page.locator(".map-handle.move")).toHaveCount(0);
    const map = (await page.locator(".map").boundingBox())!;
    await page.mouse.click(map.x + map.width / 2, map.y + map.height * 0.7);
    await expect(page.locator(".map-handle.move")).toBeVisible();
    await expect(pick).toBeHidden();

    // The solar sample is in UTM coordinates: the zone is asked for (on a phone, opened from the details sheet)
    if (isPhone(page)) await page.getByRole("button", { name: "Drawing details" }).click();
    await open("solar-plant.dxf", await readFile("public/samples/solar-plant.dxf", "latin1"));
    const zone = page.locator(".map-banner", { hasText: "look like UTM" });
    await expect(zone).toBeVisible({ timeout: 60_000 });
    await page.getByRole("combobox", { name: "UTM zone" }).selectOption({ label: "36N" });
    await expect(zone).toBeHidden();
});

test("says what a block of the drawing is, and hides a layer", async ({ page }) => {
    await start(page, "Solar PV");
    await page.getByRole("tab", { name: "Plant layout" }).click();
    await page.getByRole("button", { name: /Try a sample/ }).click();
    if (isPhone(page)) await page.getByRole("button", { name: "Drawing details" }).click();
    const tables = page.locator(".totals tr", { hasText: "PV table" }).locator("td").last();
    await expect(tables).toHaveText("316", { timeout: 60_000 });

    // 292 long tables and 24 short ones: leaving the long ones out leaves the short ones
    await page.getByText("Layers and blocks").click();
    const table = page.getByRole("combobox", { name: "PV_TABLE_2P28" });
    await expect(table.locator("option:checked")).toHaveText("Automatic: PV table");
    await table.selectOption({ label: "Not counted" });
    await expect(tables).toHaveText("24");
    await table.selectOption({ label: "PV table" });
    await expect(tables).toHaveText("316");

    const eye = page.getByRole("button", { name: "Show on the map: PV-TABLES" });
    await eye.click();
    await expect(eye).toHaveAttribute("aria-pressed", "false");
});

test("describes a counted object from the list, on a click and on hover, and counts modules for the capacity", async ({ page }) => {
    await start(page, "Solar PV");
    await page.getByRole("tab", { name: "Plant layout" }).click();
    await page.getByRole("button", { name: /Try a sample/ }).click();
    if (isPhone(page)) await page.getByRole("button", { name: "Drawing details" }).click();
    // 292 tables of 56 and 24 of 28 module blocks named "…590W"
    const capacity = page.getByText(/Installed capacity/);
    await expect(capacity).toContainText("10.04 MWp", { timeout: 60_000 });
    await expect(capacity).toContainText("from 17,024 counted modules");

    await page.getByRole("searchbox", { name: "Find an object" }).fill("INV-03");
    await page.getByRole("button", { name: /INV-03/ }).click();
    const popup = page.locator(".object-popup");
    await expect(popup).toContainText("Inverter · INV-03");
    await expect(popup).toContainText("Block: INVERTER_330KW");
    await popup.locator(".leaflet-popup-close-button").click();

    // The inverter now lies in the middle of the map: pointing at it (a mouse) or tapping it (a phone) describes it
    const map = (await page.locator(".map").boundingBox())!;
    const [x, y] = [map.x + map.width / 2, map.y + map.height / 2];
    if (isPhone(page)) {
        await page.mouse.click(x, y);
        await expect(popup).toContainText("INV-03");
    } else {
        // Chrome hands the last move to the page with the next frame: one more small move delivers the one onto it
        await page.mouse.move(x - 40, y - 40);
        await page.mouse.move(x, y, { steps: 4 });
        await page.mouse.move(x + 2, y + 2);
        await expect(page.locator(".object-tooltip")).toContainText("Inverter · INV-03");
    }
});

test("remembers a drawing's place and choices, and brings them back when the file is opened again", async ({ page }) => {
    await start(page, "Battery storage");
    const open = async () => {
        await page.getByRole("tab", { name: "Plant layout" }).click();
        const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Open a drawing" }).click()]);
        await chooser.setFiles("public/samples/battery-storage.dxf");
        await expect(page.locator(".map")).toBeVisible({ timeout: 60_000 });
    };
    const batteries = page.locator(".totals tr", { hasText: "Battery" }).locator("td").last();

    await open();
    const map = (await page.locator(".map").boundingBox())!;
    await page.mouse.click(map.x + map.width / 3, map.y + map.height / 2);
    await expect(page.locator(".map-handle.move")).toBeVisible();
    if (isPhone(page)) await page.getByRole("button", { name: "Drawing details" }).click();
    const latitude = await page.getByRole("textbox", { name: "Latitude" }).inputValue();
    await page.getByText("Layers and blocks").click();
    await page.getByRole("combobox", { name: "BESS_CONTAINER_20FT_4.2MWH" }).selectOption({ label: "Not counted" });
    await page.getByRole("button", { name: "Show on the map: ROAD-ASPHALT-6M" }).click();
    await expect(batteries).toHaveText("0");

    // Another visit: the same file comes back placed, with its choices
    await page.reload();
    await open();
    await expect(page.locator(".map-handle.move")).toBeVisible();
    await expect(page.locator(".map-banner", { hasText: "Click the map" })).toHaveCount(0);
    if (isPhone(page)) await page.getByRole("button", { name: "Drawing details" }).click();
    await expect(page.getByRole("textbox", { name: "Latitude" })).toHaveValue(latitude);
    await expect(batteries).toHaveText("0");
    await page.getByText("Layers and blocks").click();
    await expect(page.getByRole("combobox", { name: "BESS_CONTAINER_20FT_4.2MWH" })).toHaveValue("none");
    await expect(page.getByRole("button", { name: "Show on the map: ROAD-ASPHALT-6M" })).toHaveAttribute("aria-pressed", "false");
});

test("keeps the map tools clear of the zoom buttons in Persian", async ({ page }) => {
    await start(page, "Wind farm");
    await chooseLanguage(page, "fa");
    await page.getByRole("tab", { name: "جانمایی نیروگاه" }).click();
    await page.locator(".layout-empty .button").nth(1).click();
    const [tools, zoom] = [page.locator(".map-tools"), page.locator(".leaflet-control-zoom")];
    await expect(tools).toBeVisible({ timeout: 60_000 });
    const [a, b] = [(await tools.boundingBox())!, (await zoom.boundingBox())!];
    expect(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height, "the map tools cover the zoom buttons").toBe(false);
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
    await expect(page.locator(".totals tr", { hasText: "PV string" }).locator("td").last()).toHaveText("608", { timeout: 60_000 });
    await expect(page.getByText(/Installed capacity/)).toContainText("10.04 MWp");
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
    await chooseLanguage(page, "fa");
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
    await chooseLanguage(page, "fa");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("tab", { name: "دیاگرام تک‌خطی" })).toBeVisible();
    if (!isPhone(page)) {
        const palette = await page.getByRole("complementary", { name: "اجزا" }).boundingBox();
        const inspector = await page.getByRole("complementary", { name: "ویژگی‌ها" }).boundingBox();
        expect(palette!.x).toBeGreaterThan(inspector!.x);
    }
    await expectNoSidewaysScroll(page);
});
