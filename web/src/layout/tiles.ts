/**
 * The map tiles of the plant layout, in one place: to use other tiles, change the sources here. The page's Content
 * Security Policy lets images come from these servers only, and the build writes their origins into it (see
 * `vite.config.ts`), so nothing else needs changing.
 *
 * Each provider has terms; read them before you host the app for others (docs/architecture.md, "Map tiles"):
 * - OpenStreetMap's tile servers are run by volunteers on donations, for light use only: heavy use (a busy or
 *   commercial site) may be blocked without notice, and the attribution must link to the copyright page.
 * - Esri's World Imagery is used under Esri's terms: an app shows "Powered by Esri" and the imagery's sources.
 * For heavy use, take tiles from a provider with a plan for it (a free tier with an API key is often enough); a key
 * in a static site is public, so restrict it to your site's address in the provider's settings.
 */
export interface TileSource {
    /** A Leaflet URL template: {z}, {x}, {y}, and {s} for a server's subdomains. */
    url: string;
    /** Shown on the map (HTML: links allowed). */
    attribution: string;
    /** The deepest zoom the server has tiles for; deeper zooms enlarge them. */
    maxNativeZoom: number;
    /** The provider's terms of use. */
    terms: string;
}

export const TILES: Record<"plain" | "satellite", TileSource> = {
    plain: {
        url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxNativeZoom: 19,
        terms: "https://operations.osmfoundation.org/policies/tiles/",
    },
    satellite: {
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attribution: "Powered by Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
        maxNativeZoom: 18,
        terms: "https://www.esri.com/en-us/legal/terms/full-master-agreement",
    },
};

/** The servers the tiles come from, for the Content Security Policy: {s} subdomains become a wildcard. */
export function tileOrigins(sources: TileSource[] = Object.values(TILES)): string[] {
    return [
        ...new Set(
            sources.map((source) => {
                const origin = /^https:\/\/[^/]+/.exec(source.url)?.[0];
                if (!origin) throw new Error(`Map tiles must come over HTTPS: ${source.url}`);
                return origin.replace(/\{s\}/, "*");
            }),
        ),
    ];
}

/** The page with the tile servers written into its Content Security Policy, where it says %TILE_ORIGINS%. */
export function withTileOrigins(html: string, sources?: TileSource[]): string {
    if (!html.includes("%TILE_ORIGINS%")) throw new Error("index.html has no %TILE_ORIGINS% in its Content Security Policy");
    return html.replace("%TILE_ORIGINS%", tileOrigins(sources).join(" "));
}
