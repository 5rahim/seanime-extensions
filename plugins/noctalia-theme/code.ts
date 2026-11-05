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



function init() {
    $ui.register((ctx) => {
    const DEFAULT_PATH = "~/.local/state/noctalia/seanime/palette.css"
    const POLL_INTERVAL_MS = 2000
    const POLL_GUARD_MS = 8000
    const PRESENCE_INTERVAL_MS = 5000
    const PATH_KEY = "noctaliaTheme.palettePath"
    const STATUS_KEY = "noctaliaTheme.status"
    const STYLE_SELECTOR = '[data-noctalia="1"]'
const ICON_URL =
    "https://raw.githubusercontent.com/Below-Z3R0/seanime-noctalia-theme/main/plugins/noctalia-theme/icon.png"

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

/** Hex -> OKLCH in one step, or null when the value is not a colour. */
function oklchOf(hex: string): [number, number, number] | null {
    const rgb = parseHex(hex)
    return rgb ? rgbToOklch(rgb[0], rgb[1], rgb[2]) : null
}

function rgbToChannels(rgb: [number, number, number]): string {
    return `${Math.round(rgb[0] * 255)} ${Math.round(rgb[1] * 255)} ${Math.round(rgb[2] * 255)}`
}

/** The brand scale: the base colour keeps its identity at 500. */
function brandScale(oklch: [number, number, number]): string[] {
    const [baseL, baseC, hue] = oklch
    return STEPS.map((_, index) => {
        const L = clamp(baseL + (REF_L[index] - REF_500_L), 0.02, 0.99)
        const C = baseC * (REF_C[index] / REF_500_C)
        return rgbToChannels(oklchToRgbInGamut(L, C, hue))
    })
}

/**
 * The grey scale. Seanime reads its own surfaces from it (`--paper` is
 * grey-950, `--border` is grey-200) and ships no light theme: its `:root` is
 * already dark and only `.dark` is defined, so a fixed ramp keeps every
 * `bg-gray-900` dark whatever the palette says. The ramp therefore runs from
 * the palette's text colour at grey-50 to its surface at grey-950, which
 * gives a light scale for a light palette and a dark one for a dark palette.
 */
function greyScale(hue: number, textL: number, surfaceL: number): string[] {
    const range = GREY_L[0] - GREY_L[GREY_L.length - 1]
    return GREY_L.map((L) => {
        const depth = range === 0 ? 0 : (GREY_L[0] - L) / range
        return rgbToChannels(oklchToRgbInGamut(textL + (surfaceL - textL) * depth, GREY_CHROMA, hue))
    })
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

    // Parsed and converted once: both the hue and the brand ramp need it.
    const primary = role("primary")
    const primaryOklch = primary ? oklchOf(primary) : null
    const hue = primaryOklch ? primaryOklch[2] : 0

    if (primaryOklch) {
        const scale = brandScale(primaryOklch)
        STEPS.forEach((step, index) => {
            if (scale[index]) declarations.push(`  --color-brand-${step}: ${scale[index]} !important;`)
        })
        if (scale[5]) declarations.push(`  --color-brand-default: ${scale[5]} !important;`)
    }

    // Without both ends there is nothing to stretch between: keep the reference ramp.
    const surfaceOklch = oklchOf(role("surface") || "")
    const onSurfaceOklch = oklchOf(role("on_surface") || "")
    const textL = onSurfaceOklch ? onSurfaceOklch[0] : GREY_L[0]
    const surfaceL = surfaceOklch ? surfaceOklch[0] : GREY_L[GREY_L.length - 1]
    const scale = greyScale(hue, textL, surfaceL)
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

        const status = ctx.state("Waiting for the palette…")
        const pathRef = ctx.fieldRef<string>(DEFAULT_PATH)

        let lastSignature = ""
        let lastMode = ""
        let lastError = ""
        let homeDir = ""
        let polling = false
        let pollStartedAt = 0
        let lastPresenceAt = 0

        let lastStatus = ""

        function report(message: string) {
            // The status is written to storage and the database: skip the write
            // when nothing changed, otherwise an idle poll churns both.
            if (message === lastStatus) return
            lastStatus = message
            status.set(message)
            try {
                $storage.set(STATUS_KEY, message)
            } catch {
                // The status is a convenience; failing to store it is not fatal.
            }
        }

        report("Plugin loaded")

        function createTray(): void {
            try {
                const tray = ctx.newTray({ iconUrl: ICON_URL, withContent: true, width: "380px" })
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
            } catch {
                // The tray is a desktop affordance; the theme still applies without it.
            }
        }

        let styleId: string | null = null

        /** True when this client still carries a stylesheet of ours. */
        async function hasStyle(): Promise<boolean> {
            if (!styleId) return false
            try {
                const element = ctx.dom.asElement(styleId)
                return (await element.getText()).length > 0
            } catch {
                styleId = null
                return false
            }
        }

        /**
         * Removes every stylesheet we own.
         *
         * The element id cannot be used to find them: the client keeps its own
         * element -> id map, so an id only exists for the session that created
         * it. A data attribute survives plugin restarts, and the element
         * returned by the query carries a usable handle.
         */
        async function clearStyle(): Promise<void> {
            styleId = null
            for (let i = 0; i < 8; i++) {
                const element = await ctx.dom.queryOne(STYLE_SELECTOR)
                if (!element) return
                element.remove()
            }
        }

        /**
         * Replaces the stylesheet.
         *
         * The client keeps its own element -> id map, so the id it generates on
         * creation is the only handle that works: renaming or re-querying it
         * makes later calls land nowhere. The write is read back to confirm it.
         */
        async function applyCss(css: string) {
            const head = await ctx.dom.queryOne("head")
            if (!head) throw new Error("DOM head not found")

            await clearStyle()

            const style = await ctx.dom.createElement("style")
            head.append(style)
            style.setText(css)

            const written = await style.getText()
            if (written.length !== css.length) {
                throw new Error(`stylesheet mismatch (${written.length}/${css.length})`)
            }
            style.setDataAttribute("noctalia", "1")
            styleId = style.id
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
         * The paths to try, in order. A "~" path is resolved against the server's
         * home, so the same setting works whether Seanime runs on the desktop
         * or in a container.
         */
        function pathCandidates(configured: string): string[] {
            const candidates = [configured]
            if (configured.startsWith("~/")) {
                if (!homeDir) homeDir = $os.homeDir().replace(/\/+$/, "")
                candidates.push(homeDir + configured.slice(1))
            }
            return candidates.filter((path, index) => path && candidates.indexOf(path) === index)
        }

        /**
         * Reads the palette file. The read happens on the server: the file
         * lives next to the Seanime data, and the manifest declares the paths
         * the plugin is allowed to read.
         */
        function readPalette(path: string): { text: string; path: string } | null {
            try {
                const bytes = $os.readFile(path)
                return { text: bytesToString(bytes), path }
            } catch (error) {
                lastError = `read failed: ${(error as Error).message}`
                return null
            }
        }

        async function refresh(): Promise<void> {
            const configured = (pathRef.current || DEFAULT_PATH).trim()
            lastError = ""

            let palette: { text: string; path: string } | null = null
            for (const candidate of pathCandidates(configured)) {
                palette = readPalette(candidate)
                if (palette) break
            }
            if (!palette) {
                if (lastSignature !== "") {
                    lastSignature = ""
                    await clearStyle()
                }
                report(`Not found: ${configured}${lastError ? ` (${lastError})` : ""}`)
                return
            }

            // The stylesheet lives in the client's DOM: a reloaded client has
            // none, even when the palette itself did not change. Probing costs a
            // round trip, so an unchanged palette is only re-probed periodically.
            const signature = hash(palette.text)
            const samePalette = signature === lastSignature
            if (samePalette && Date.now() - lastPresenceAt <= PRESENCE_INTERVAL_MS) return

            const present = samePalette ? await hasStyle() : false
            lastPresenceAt = Date.now()
            if (samePalette && present) return
            lastSignature = signature

            const tokens = parseTokens(palette.text)
            const css = buildCss(tokens)
            if (!css) {
                report("No palette roles in the file")
                return
            }
            try {
                await applyCss(css)
                await syncMode(tokens["nt-mode"])
            } catch (error) {
                report(`Apply failed: ${(error as Error).message}`)
                return
            }
            report(`Applied · ${palette.path}`)
        }

        async function poll(): Promise<void> {
            // A DOM call with no client attached never settles. The guard lets
            // the next tick start a fresh attempt instead of deadlocking.
            const now = Date.now()
            if (polling && now - pollStartedAt < POLL_GUARD_MS) return
            polling = true
            pollStartedAt = now
            try {
                await refresh()
            } catch (error) {
                report(`poll failed: ${(error as Error).message}`)
            } finally {
                polling = false
            }
        }

        /** Runs one setup step: a failure is reported but never aborts the rest. */
        function setup(step: string, run: () => void) {
            try {
                run()
                report(`setup: ${step} ok`)
            } catch (error) {
                report(`${step} unavailable: ${(error as Error).message}`)
            }
        }

        setup("tray", () => createTray())

        setup("storage", () => {
            const savedPath = $storage.get<string>(PATH_KEY)
            if (savedPath) pathRef.setValue(savedPath)
        })

        setup("path", () => {
            pathRef.onValueChange((value: string) => {
                $storage.set(PATH_KEY, value)
                lastSignature = ""
            })
        })

        setup("dom ready", () => ctx.dom.onReady(reapply))

        // A client that reloads (or a second client) re-claims the main tab.
        // onMainTabReady is exposed by the runtime but missing from the
        // published types, hence the cast.
        setup("main tab ready", () => {
            const dom = ctx.dom as unknown as { onMainTabReady?: (cb: () => void) => void }
            dom.onMainTabReady?.(reapply)
        })

        // The interval lives in the plugin context (server side), so the palette
        // is re-read even when no client is attached yet.
        setup("polling", () => {
            ctx.setInterval(() => {
                void poll()
            }, POLL_INTERVAL_MS)
        })
    })
}
