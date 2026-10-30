/// <reference path="../../core.d.ts" />
/// <reference path="../../plugin.d.ts" />
/// <reference path="../../app.d.ts" />
/// <reference path="../../system.d.ts" />

// Noctalia Theme — applies the active Noctalia palette to Seanime.
//
// The palette file is written by the Noctalia community template
// (noctalia-seanime-template). It is a flat list of CSS custom properties
// holding the Material roles of the active Noctalia theme:
//
//     --nt-primary: #c2c8c3;
//     --nt-surface: #131313;
//
// This plugin converts those roles into Seanime's own variables: the flat
// surface/accent variables, plus the two Tailwind colour scales Seanime
// derives its UI from (`--color-brand-*` and `--color-gray-*`). The scales
// are computed here because Noctalia exposes roles, not ramps.

// ---------------------------------------------------------------------------
// Colour maths — sRGB <-> OKLab/OKLCH
// ---------------------------------------------------------------------------

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

// Tailwind v4 reference ramp, OKLCH lightness and chroma per step, anchored
// on its own 500. The base colour keeps its identity at 500; every other
// step borrows the shape of the reference ramp.
const REF_L = [0.977, 0.936, 0.885, 0.808, 0.704, 0.637, 0.577, 0.505, 0.444, 0.396, 0.258]
const REF_C = [0.013, 0.031, 0.059, 0.108, 0.161, 0.237, 0.245, 0.213, 0.173, 0.133, 0.061]
const REF_500_L = REF_L[5]
const REF_500_C = REF_C[5]

// Tailwind's neutral grey ramp, OKLCH lightness per step. It is rescaled to
// the theme's own surface/text pair so the scale sits inside the palette.
const GREY_L = [0.985, 0.967, 0.922, 0.869, 0.704, 0.556, 0.439, 0.371, 0.279, 0.208, 0.129]

const GREY_CHROMA = 0.004

function clamp(value: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, value))
}

function clamp01(value: number): number {
    return clamp(value, 0, 1)
}

function parseHex(hex: string): [number, number, number] | null {
    let raw = hex.trim().replace(/^#/, "")
    if (raw.length === 3) {
        raw = raw.split("").map((c) => c + c).join("")
    }
    if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null
    const packed = parseInt(raw, 16)
    return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255]
}

function toLinear(channel: number): number {
    const c = channel / 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function toSrgb(channel: number): number {
    const c = channel <= 0.0031308 ? channel * 12.92 : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055
    return clamp01(c)
}

function rgbToOklch(r: number, g: number, b: number): [number, number, number] {
    const lr = toLinear(r)
    const lg = toLinear(g)
    const lb = toLinear(b)
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    const chroma = Math.sqrt(A * A + B * B)
    let hue = (Math.atan2(B, A) * 180) / Math.PI
    if (hue < 0) hue += 360
    return [L, chroma, hue]
}

function oklchToRgb(L: number, C: number, H: number): [number, number, number] {
    const rad = (H * Math.PI) / 180
    const a = C * Math.cos(rad)
    const b = C * Math.sin(rad)
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b
    const s_ = L - 0.0894841775 * a - 1.291485548 * b
    const l = l_ * l_ * l_
    const m = m_ * m_ * m_
    const s = s_ * s_ * s_
    return [
        toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    ]
}

/** Converts to sRGB, pulling the chroma down until the colour fits the gamut. */
function oklchToRgbInGamut(L: number, C: number, H: number): [number, number, number] {
    const fits = (rgb: [number, number, number]) =>
        rgb[0] >= 0 && rgb[0] <= 1 && rgb[1] >= 0 && rgb[1] <= 1 && rgb[2] >= 0 && rgb[2] <= 1

    const direct = oklchToRgb(L, C, H)
    if (fits(direct)) return direct

    let low = 0
    let high = C
    for (let i = 0; i < 18; i++) {
        const mid = (low + high) / 2
        if (fits(oklchToRgb(L, mid, H))) low = mid
        else high = mid
    }
    return oklchToRgb(L, low, H)
}

function rgbToChannels(rgb: [number, number, number]): string {
    return `${Math.round(rgb[0] * 255)} ${Math.round(rgb[1] * 255)} ${Math.round(rgb[2] * 255)}`
}

/** The brand scale: the base colour keeps its identity at 500. */
function brandScale(baseHex: string): string[] {
    const rgb = parseHex(baseHex)
    if (!rgb) return []
    const [baseL, baseC, hue] = rgbToOklch(rgb[0], rgb[1], rgb[2])
    return STEPS.map((_, index) => {
        const L = clamp(baseL + (REF_L[index] - REF_500_L), 0.02, 0.99)
        const C = baseC * (REF_C[index] / REF_500_C)
        return rgbToChannels(oklchToRgbInGamut(L, C, hue))
    })
}

/**
 * The grey scale. It stays absolute — Seanime's own defaults read from it
 * (`--paper` is grey-950, `--border` is grey-200), so rescaling it to the
 * theme would move every surface away from what the app expects. Only the
 * hue is borrowed from the palette, at a chroma low enough to stay neutral.
 */
function greyScale(hue: number): string[] {
    return GREY_L.map((L) => rgbToChannels(oklchToRgbInGamut(L, GREY_CHROMA, hue)))
}

// ---------------------------------------------------------------------------
// Palette file
// ---------------------------------------------------------------------------

function parseTokens(css: string): Record<string, string> {
    const tokens: Record<string, string> = {}
    const pattern = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi
    let match: RegExpExecArray | null
    while ((match = pattern.exec(css)) !== null) {
        tokens[match[1].toLowerCase()] = match[2].trim()
    }
    return tokens
}

/** Seanime variable -> Noctalia role. Opacity is expressed as a suffix. */
const ROLE_MAP: Array<[string, string, number?]> = [
    ["--background", "surface"],
    ["--foreground", "on_surface"],
    ["--paper", "surface_container"],
    ["--paper-lighter", "surface_container_high"],
    ["--media-card-popup-background", "surface_container_high"],
    ["--hover-from-background-color", "surface_container_low"],
    ["--subtle", "on_surface", 0.06],
    ["--subtle-highlight", "on_surface", 0.08],
    ["--border", "on_surface", 0.1],
    ["--media-menu-item-hover-background", "on_surface", 0.1],
    ["--ring", "primary"],
    ["--muted", "on_surface_variant"],
    ["--muted-highlight", "on_surface"],
    ["--media-accent-color", "primary"],
    ["--brand", "primary_container"],
]

function buildCss(tokens: Record<string, string>): string {
    const declarations: string[] = []
    const role = (name: string): string | undefined => tokens["nt-" + name.replace(/_/g, "-")]

    for (const [variable, noctaliaRole, alpha] of ROLE_MAP) {
        const hex = role(noctaliaRole)
        if (!hex) continue
        const rgb = parseHex(hex)
        if (!rgb) continue
        const value = alpha === undefined ? hex : `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
        declarations.push(`  ${variable}: ${value} !important;`)
    }

    const primary = role("primary")
    const primaryRgb = primary ? parseHex(primary) : null
    const hue = primaryRgb ? rgbToOklch(primaryRgb[0], primaryRgb[1], primaryRgb[2])[2] : 0

    if (primary && primaryRgb) {
        const scale = brandScale(primary)
        STEPS.forEach((step, index) => {
            if (scale[index]) declarations.push(`  --color-brand-${step}: ${scale[index]} !important;`)
        })
        if (scale[5]) declarations.push(`  --color-brand-default: ${scale[5]} !important;`)
    }

    const scale = greyScale(hue)
    STEPS.forEach((step, index) => {
        if (scale[index]) declarations.push(`  --color-gray-${step}: ${scale[index]} !important;`)
    })
    if (scale[5]) declarations.push(`  --color-gray-default: ${scale[5]} !important;`)

    if (declarations.length === 0) return ""
    return `:root {\n${declarations.join("\n")}\n}`
}

function bytesToString(bytes: Uint8Array): string {
    let out = ""
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk: number[] = []
        for (let j = i; j < Math.min(i + chunkSize, bytes.length); j++) chunk.push(bytes[j])
        out += String.fromCharCode.apply(null, chunk)
    }
    return out
}

/** FNV-1a: enough to notice that the palette file changed. */
function hash(text: string): string {
    let value = 0x811c9dc5
    for (let i = 0; i < text.length; i++) {
        value ^= text.charCodeAt(i)
        value = Math.imul(value, 0x01000193) >>> 0
    }
    return value.toString(16)
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

//@ts-ignore
function init() {
    $ui.register((ctx) => {
        const STYLE_ID = "noctalia-theme"
        const DEFAULT_PATH = "~/.local/state/noctalia/seanime/palette.css"
        const POLL_INTERVAL_MS = 2000
        const FETCH_TIMEOUT_S = 5
        const CLIENT_FAILURES_BEFORE_BACKOFF = 3
        const CLIENT_BACKOFF_MS = 30000
        const PATH_KEY = "noctaliaTheme.palettePath"
        const ICON_URL =
            "https://raw.githubusercontent.com/Below-Z3R0/seanime-noctalia-theme/main/plugins/noctalia-theme/icon.png"

        const status = ctx.state("Waiting for the palette file…")
        const pathRef = ctx.fieldRef<string>(DEFAULT_PATH)

        let lastSignature = ""
        let lastCss = ""
        let lastMode = ""
        let polling = false
        let clientFailures = 0
        let clientRetryAt = 0

        function report(message: string) {
            status.set(message)
            $storage.set("noctaliaTheme.status", message)
        }

        const tray = ctx.newTray({ iconUrl: ICON_URL, withContent: true, width: "380px" })

        function resolvePath(path: string): string {
            if (path.startsWith("~/")) {
                return $os.homeDir().replace(/\/+$/, "") + path.slice(1)
            }
            return path
        }

        async function removeStyle() {
            const previous = await ctx.dom.queryOne("#" + STYLE_ID)
            if (previous) previous.remove()
        }

        /** Updates the stylesheet in place; only creates it the first time. */
        async function applyCss(css: string) {
            const head = await ctx.dom.queryOne("head")
            if (!head) return
            let style: DOMElement | null = await ctx.dom.queryOne("#" + STYLE_ID)
            if (!style) {
                style = await ctx.dom.createElement("style")
                style.setAttribute("id", STYLE_ID)
                head.append(style)
            }
            style.setText(css)
        }

        /** Keeps the document's colour scheme in step with the Noctalia theme. */
        async function syncMode(mode: string) {
            if (!mode || mode === lastMode) return
            const html = await ctx.dom.queryOne("html")
            if (!html) return
            const current = (await html.getAttribute("class")) || ""
            const classes = current.split(/\s+/).filter((c) => c && c !== "dark" && c !== "light")
            classes.push(mode)
            html.setAttribute("class", classes.join(" "))
            lastMode = mode
        }

        /**
         * Reads the palette file. The local path is tried first so the palette
         * comes from the machine the client runs on; the server-side read is
         * the fallback for clients that cannot reach their own filesystem.
         *
         * A client that cannot reach its own files is not probed on every
         * tick: after a few failures the probe backs off, otherwise every
         * poll would spend a request on a path that cannot work.
         */
        async function readPalette(path: string): Promise<{ text: string; source: string } | null> {
            if (Date.now() >= clientRetryAt) {
                try {
                    const response = await ctx.fetch("file://" + path, { timeout: FETCH_TIMEOUT_S })
                    if (response.ok) {
                        clientFailures = 0
                        return { text: response.text(), source: "client" }
                    }
                } catch (error) {
                    // Not reachable from the client: fall through to the server.
                }
                clientFailures++
                if (clientFailures >= CLIENT_FAILURES_BEFORE_BACKOFF) {
                    clientRetryAt = Date.now() + CLIENT_BACKOFF_MS
                }
            }
            try {
                const bytes = $os.readFile(path)
                return { text: bytesToString(bytes), source: "server" }
            } catch (error) {
                return null
            }
        }

        async function poll() {
            if (polling) return
            polling = true
            try {
                await refresh()
            } finally {
                polling = false
            }
        }

        async function refresh() {
            const configured = (pathRef.current || DEFAULT_PATH).trim()
            const path = resolvePath(configured)

            const palette = await readPalette(path)
            if (!palette) {
                // The file is not there (yet): drop any theme we applied earlier.
                if (lastSignature !== "") {
                    lastSignature = ""
                    lastCss = ""
                    await removeStyle()
                }
                report(`Not found: ${configured}`)
                return
            }

            const signature = hash(palette.text)
            if (signature === lastSignature) return
            lastSignature = signature

            const tokens = parseTokens(palette.text)
            const css = buildCss(tokens)
            if (!css) {
                report(`No palette roles in ${configured}`)
                return
            }
            if (css === lastCss) return
            lastCss = css

            await applyCss(css)
            await syncMode(tokens["nt-mode"])
            report(`Applied via ${palette.source} · ${configured}`)
        }

        const savedPath = $storage.get<string>(PATH_KEY)
        if (savedPath) pathRef.setValue(savedPath)

        pathRef.onValueChange((value: string) => {
            $storage.set(PATH_KEY, value)
            lastSignature = ""
            clientFailures = 0
            clientRetryAt = 0
        })

        tray.render(() =>
            tray.div([
                tray.stack(
                    [
                        tray.text("Noctalia Theme", { style: { fontWeight: "600", fontSize: "14px" } }),
                        tray.text(
                            "Applies the palette written by the Noctalia Seanime template, including Seanime's own brand and grey scales.",
                            { style: { color: "#888", fontSize: "12px" } },
                        ),
                        tray.input({
                            label: "Palette file",
                            placeholder: DEFAULT_PATH,
                            fieldRef: pathRef,
                            style: { fontSize: "12px" },
                        }),
                        tray.text(status.get(), { style: { color: "#666", fontSize: "11px" } }),
                    ],
                    { gap: 1 },
                ),
            ]),
        )

        ctx.dom.onReady(() => {
            void poll()
        })

        ctx.setInterval(() => {
            void poll()
        }, POLL_INTERVAL_MS)
    })
}
