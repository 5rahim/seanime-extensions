/// <reference path="../anime-torrent-provider.d.ts" />
/// <reference path="../../core.d.ts" />

interface ProviderConfig {
    baseUrl: string;
    category: string;
}

interface RawTorrent {
    name: string;
    link: string; // GUID/Page URL
    downloadUrl: string; // .torrent file URL
    date: string; // raw date string
    seeders: string;
    leechers: string;
    downloads: string;
    infoHash: string;
    size: string; // formatted size string
}

class Provider {
    canSmartSearch = true
    supportsAdult = false

    async getLatest(): Promise<AnimeTorrent[]> {
        try {
            const url = this.buildURL("")
            console.log("Nyaa: Fetching latest from " + url)

            const res = await fetch(url)
            const rssText = await res.text()

            const rawTorrents = this.parseRSSFeed(rssText)

            const torrents = rawTorrents.map(t => this.toAnimeTorrent(t, "nyaa"))

            console.log(`Nyaa: Found ${torrents.length} latest torrents`)
            return torrents
        }
        catch (error) {
            console.error("Nyaa: Error fetching latest: " + (error as Error).message)
            return []
        }
    }

    async search(options: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        try {
            const url = this.buildURL(options.query)
            console.log("Nyaa: Searching for " + options.query)

            const res = await fetch(url)
            const rssText = await res.text()

            const rawTorrents = this.parseRSSFeed(rssText)
            const torrents = rawTorrents.map(t => this.toAnimeTorrent(t, "nyaa"))

            console.log(`Nyaa: Found ${torrents.length} torrents for query`)
            return torrents
        }
        catch (error) {
            console.error("Nyaa: Error searching: " + (error as Error).message)
            return []
        }
    }

    async smartSearch(options: AnimeSmartSearchOptions): Promise<AnimeTorrent[]> {
        try {
            const queries = this.buildSmartSearchQueries(options)
            if (!queries || queries.length === 0) {
                console.warn("Nyaa: Smart search could not build queries")
                return []
            }

            console.log("Nyaa: Smart searching with queries: " + JSON.stringify(queries))

            const searchPromises = queries.map(async (query) => {
                try {
                    const url = this.buildURL(query)
                    console.log("Nyaa: Smart search URL: " + url)
                    const res = await fetch(url)
                    const rssText = await res.text()
                    return this.parseRSSFeed(rssText)
                }
                catch (e) {
                    console.error("Nyaa: Smart search sub-query failed: " + (e as Error).message)
                    return []
                }
            })

            const results = await Promise.all(searchPromises)
            const allRawTorrents = results.flat()

            // Remove duplicates
            const uniqueTorrentsMap = new Map<string, any>()
            allRawTorrents.forEach(t => {
                // Use downloadUrl (.torrent link) as unique key
                if (t.downloadUrl && !uniqueTorrentsMap.has(t.downloadUrl)) {
                    uniqueTorrentsMap.set(t.downloadUrl, t)
                }
            })

            let torrents = [...uniqueTorrentsMap.values()].map(t => this.toAnimeTorrent(t, "nyaa"))
            uniqueTorrentsMap.clear()

            // Filter by episode number if not batch
            if (!options.batch) {
                torrents = torrents.filter(t => {
                    const relEp = t.episodeNumber
                    if (relEp === -1) return false

                    const absEp = (options.media.absoluteSeasonOffset || 0) + options.episodeNumber

                    return options.episodeNumber === relEp || absEp === relEp
                })
                console.log(`Nyaa: Filtered to ${torrents.length} torrents for episode ${options.episodeNumber}`)
            }

            return torrents

        }
        catch (error) {
            console.error("Nyaa: Error in smart search: " + (error as Error).message)
            return []
        }
    }

    async getTorrentInfoHash(torrent: AnimeTorrent): Promise<string> {
        return torrent.infoHash || ""
    }

    async getTorrentMagnetLink(torrent: AnimeTorrent): Promise<string> {
        try {
            const res = await fetch(torrent.link)
            const html = await res.text()
            const $ = LoadDoc(html)

            let magnetLink = ""

            // Search for the magnet link
            $("a.card-footer-item, a[href^=\"magnet:\"]").each((i: number, el) => {
                const href = el.attr("href")
                if (href && href.startsWith("magnet:")) {
                    magnetLink = href
                    return false // Break the loop
                }
            })

            if (!magnetLink) {
                throw new Error("Magnet link not found on page")
            }

            return magnetLink
        }
        catch (error) {
            console.error("Nyaa: Error fetching magnet link: " + (error as Error).message)
            throw new Error("Could not fetch magnet link for: " + torrent.name)
        }
    }

    getSettings(): AnimeProviderSettings {
        return {
            canSmartSearch: this.canSmartSearch,
            smartSearchFilters: ["batch", "episodeNumber", "resolution", "query"],
            supportsAdult: false,
            type: "main",
        }
    }

    private getProviderSettings(): ProviderConfig {
        let url: string = $getUserPreference("apiUrl") || "nyaa.si"
        if (!url.startsWith("http")) {
            url = "https://" + url
        }
        return {
            baseUrl: url.replace(/\/$/, ""), // Remove trailing slash
            category: $getUserPreference("category") || "1_2",
        }
    }

    private buildURL(query: string, sortBy: string = "seeders"): string {
        const { baseUrl, category } = this.getProviderSettings()

        const queryString = `page=rss&q=${encodeURIComponent(query)}&c=${category}&f=0&s=${sortBy}&o=desc`
        return `${baseUrl}/?${queryString}`
    }

    private parseRSSFeed(rssText: string): RawTorrent[] {
        const torrents: RawTorrent[] = []

        // Helper to extract content between XML tags
        const getTagContent = (xml: string, tag: string): string => {
            const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`)
            const match = xml.match(regex)
            return match ? match[1].trim() : ""
        }

        // Helper to extract content from nyaa namespace tags
        const getNyaaTagContent = (xml: string, tag: string): string => {
            const regex = new RegExp(`<nyaa:${tag}[^>]*>([^<]*)</nyaa:${tag}>`)
            const match = xml.match(regex)
            return match ? match[1].trim() : ""
        }

        // Split XML into items
        const itemRegex = /<item>([\s\S]*?)<\/item>/g
        let match

        while ((match = itemRegex.exec(rssText)) !== null) {
            const itemXml = match[1]

            const title = getTagContent(itemXml, "title")
            const downloadUrl = getTagContent(itemXml, "link") // .torrent file URL
            const link = getTagContent(itemXml, "guid")      // Page URL
            const pubDate = getTagContent(itemXml, "pubDate")
            const seeders = getNyaaTagContent(itemXml, "seeders")
            const leechers = getNyaaTagContent(itemXml, "leechers")
            const downloads = getNyaaTagContent(itemXml, "downloads")
            const infoHash = getNyaaTagContent(itemXml, "infoHash")
            const size = getNyaaTagContent(itemXml, "size")

            const torrent: RawTorrent = {
                name: title,
                link: link,
                downloadUrl: downloadUrl,
                date: pubDate,
                seeders: seeders,
                leechers: leechers,
                downloads: downloads,
                infoHash: infoHash,
                size: size,
            }

            torrents.push(torrent)
        }

        return torrents
    }

    private toAnimeTorrent(t: RawTorrent, providerName: string): AnimeTorrent {
        const metadata = $habari.parse(t.name)

        const seeders = parseInt(t.seeders) || 0
        const leechers = parseInt(t.leechers) || 0
        const downloads = parseInt(t.downloads) || 0

        let formattedDate = ""
        try {
            const parsedDate = new Date(t.date)
            if (!isNaN(parsedDate.getTime())) {
                formattedDate = parsedDate.toISOString()
            }
        }
        catch (e) {
            console.warn("Nyaa: Failed to parse date: " + t.date)
        }

        let sizeInBytes = 0
        const sizeMatch = t.size.match(/([\d.]+)\s*([KMGT]?i?B)/i)
        if (sizeMatch) {
            const size = parseFloat(sizeMatch[1])
            const unit = sizeMatch[2].toUpperCase()
            if (unit.endsWith("IB")) {
                if (unit.startsWith("M")) sizeInBytes = size * Math.pow(1024, 2)
                else if (unit.startsWith("G")) sizeInBytes = size * Math.pow(1024, 3)
                else if (unit.startsWith("T")) sizeInBytes = size * Math.pow(1024, 4)
                else sizeInBytes = size * 1024
            } else {
                if (unit.startsWith("M")) sizeInBytes = size * Math.pow(1000, 2)
                else if (unit.startsWith("G")) sizeInBytes = size * Math.pow(1000, 3)
                else if (unit.startsWith("T")) sizeInBytes = size * Math.pow(1000, 4)
                else sizeInBytes = size * 1000
            }
        }

        let episode = -1
        if (metadata.episode_number && metadata.episode_number.length >= 1) {
            episode = parseInt(metadata.episode_number[0]) || -1
        }

        let isBatchByGuess = false
        if (metadata.episode_number && metadata.episode_number.length > 1) {
            isBatchByGuess = true
        }
        if (/\b(batch|complete|collection|seasons?|parts?)\b/i.test(t.name)) {
            isBatchByGuess = true
        }

        if (isBatchByGuess) {
            episode = -1
        }

        return {
            name: t.name,
            date: formattedDate,
            size: Math.round(sizeInBytes),
            formattedSize: t.size,
            seeders: seeders,
            leechers: leechers,
            downloadCount: downloads,
            link: t.link,
            downloadUrl: t.downloadUrl,
            infoHash: t.infoHash,
            magnetLink: "",
            resolution: metadata.video_resolution || "",
            isBatch: isBatchByGuess,
            episodeNumber: episode,
            releaseGroup: metadata.release_group || "",
            isBestRelease: false,
            confirmed: false,
        }
    }

    private buildSmartSearchQueries(opts: AnimeSmartSearchOptions): string[] {
        const { media, query: userQuery, batch, episodeNumber, resolution } = opts

        let romTitle = media.romajiTitle || ""
        let engTitle = media.englishTitle || ""
        let allTitles = [romTitle, engTitle, ...(media.synonyms || [])].filter(Boolean)

        let season = 0
        let part = 0
        let titles: string[] = []

        if (!userQuery) {
            allTitles.forEach(title => {
                let s: number, p: number, cTitle: string;
                [s, cTitle] = this.extractSeasonNumber(title);
                [p, cTitle] = this.extractPartNumber(cTitle)
                if (s !== 0) season = s
                if (p !== 0) part = p
                if (cTitle) titles.push(cTitle)
            })

            if (season === 0) {
                (media.synonyms || []).forEach(synonym => {
                    const [s, _] = this.extractSeasonNumber(synonym)
                    if (s !== 0) season = s
                })
            }

            if (season === 0 && part === 0 && titles.length === 0) {
                if (romTitle) titles.push(romTitle)
                if (engTitle) titles.push(engTitle)
            }

            [romTitle, engTitle].filter(Boolean).forEach(title => {
                const split = title.split(":")
                if (split.length > 1 && split[0].length > 8) {
                    titles.push(split[0])
                }
            })

            if (season === 0) {
                if (/\biii\b/i.test(romTitle) || (engTitle && /\biii\b/i.test(engTitle))) season = 3
                else if (/\bii\b/i.test(romTitle) || (engTitle && /\bii\b/i.test(engTitle))) season = 2
            }

            titles = titles.map(t => {
                let clean = t.replace(/:/g, " ").replace(/-/g, " ").trim()
                clean = clean.replace(/\s+/g, " ")
                clean = clean.toLowerCase()
                if (season !== 0) {
                    clean = clean.replace(/\biii\b/gi, "").replace(/\bii\b/gi, "")
                }
                return clean.trim()
            })

            titles = [...new Set(titles.filter(Boolean))]

        } else {
            titles = [userQuery.toLowerCase()]
        }

        if (titles.length === 0) {
            return []
        }

        const canBatch = media.status === "FINISHED" && (media.episodeCount || 0) > 0
        let normalBuff = ""
        let batchBuff = ""

        // Parameters
        if (batch && canBatch && !(media.format === "MOVIE" && (media.episodeCount || 0) === 1)) {
            if (season !== 0) batchBuff += this.buildSeasonString(season)
            if (part !== 0) batchBuff += this.buildPartString(part)
            batchBuff += this.buildBatchString(media)
        } else {
            normalBuff += this.buildSeasonString(season)
            if (part !== 0) normalBuff += this.buildPartString(part)
            if (!(media.format === "MOVIE" && (media.episodeCount || 0) === 1)) {
                normalBuff += this.buildEpisodeString(episodeNumber)
            }
        }

        let titleStr = this.buildTitleString(titles)
        if (userQuery) {
            titleStr = `(${userQuery})`
        }

        const batchStr = batchBuff
        const normalStr = normalBuff

        let query = `${titleStr}${batchStr}${normalStr}`

        // Resolution part
        const resStr = resolution ? `(${resolution})` : "(360|480|720|1080)"
        query += resStr

        const queries = [query]

        // Absolute episode addition
        if (!batch && (media.absoluteSeasonOffset || 0) > 0 && !(media.format === "MOVIE" && (media.episodeCount || 0) === 1)) {
            const absEp = episodeNumber + (media.absoluteSeasonOffset || 0)
            const query2 = `${titleStr}(${absEp})${resStr}`
            queries.push(query2)
        }

        return queries
    }

    private zeropad(v: number): string {
        const s = String(v)
        return s.length < 2 ? "0" + s : s
    }

    private buildTitleString(titles: string[]): string {
        if (titles.length === 1) {
            return `(${titles[0]})`
        }
        const quotedTitles = titles.map(t => `"${t}"`)
        return `(${quotedTitles.join("|")})`
    }

    private buildEpisodeString(ep: number): string {
        const pEp = this.zeropad(ep)
        return `(${pEp}|e${pEp}|e${pEp}v|${pEp}v|ep${pEp}|ep${ep})`
    }

    private buildSeasonString(season: number): string {
        if (season === 0) return ""
        const pS = this.zeropad(season)
        return `("season ${season}"|"season ${pS}"|"s${season}"|"s${pS}")`
    }

    private buildPartString(part: number): string {
        if (part === 0) return ""
        return `("part ${part}")`
    }

    private buildBatchString(media: AnimeSmartSearchOptions["media"]): string {
        const epCount = this.zeropad(media.episodeCount || 0)
        const parts = [
            `"01 - ${epCount}"`,
            `"01 ~ ${epCount}"`,
            `"Batch"`,
            `"Complete"`,
            `"+ OVA"`,
            `"+ Specials"`,
            `"+ Special"`,
            `"Seasons"`,
            `"Parts"`,
        ]
        return `(${parts.join("|")})`
    }

    private extractSeasonNumber(title: string): [number, string] {
        const match = title.match(/\b(season|s)\s*(\d{1,2})\b/i)
        if (match && match[2]) {
            const cleanTitle = title.replace(match[0], "").trim()
            return [parseInt(match[2]), cleanTitle]
        }
        return [0, title]
    }

    private extractPartNumber(title: string): [number, string] {
        const match = title.match(/\b(part|p)\s*(\d{1.2})\b/i)
        if (match && match[2]) {
            const cleanTitle = title.replace(match[0], "").trim()
            return [parseInt(match[2]), cleanTitle]
        }
        return [0, title]
    }

}
