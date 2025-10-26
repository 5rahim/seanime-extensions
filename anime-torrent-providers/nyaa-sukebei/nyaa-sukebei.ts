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
    async getLatest(): Promise<AnimeTorrent[]> {
        try {
            const url = this.buildURL("")
            console.log("Sukebei: Fetching latest from " + url)

            const res = await fetch(url)
            const rssText = await res.text()

            const rawTorrents = this.parseRSSFeed(rssText)
            const torrents = rawTorrents.map(t => this.toAnimeTorrent(t))

            console.log(`Sukebei: Found ${torrents.length} latest torrents`)
            return torrents
        }
        catch (error) {
            console.error("Sukebei: Error fetching latest: " + (error as Error).message)
            return []
        }
    }

    async search(options: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        try {
            // Build URL with the user's query
            const url = this.buildURL(options.query)
            console.log("Sukebei: Searching for " + options.query)

            const res = await fetch(url)
            const rssText = await res.text()

            const rawTorrents = this.parseRSSFeed(rssText)
            const torrents = rawTorrents.map(t => this.toAnimeTorrent(t))

            console.log(`Sukebei: Found ${torrents.length} torrents for query`)
            return torrents
        }
        catch (error) {
            console.error("Sukebei: Error searching: " + (error as Error).message)
            return []
        }
    }

    async smartSearch(options: AnimeSmartSearchOptions): Promise<AnimeTorrent[]> {
        return []
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
            console.error("Sukebei: Error fetching magnet link: " + (error as Error).message)
            throw new Error("Could not fetch magnet link for: " + torrent.name)
        }
    }

    getSettings(): AnimeProviderSettings {
        return {
            canSmartSearch: false,
            smartSearchFilters: [],
            supportsAdult: true,
            type: "special",
        }
    }

    private getProviderSettings(): ProviderConfig {
        let url: string = $getUserPreference("apiUrl") || "sukebei.nyaa.si"

        if (!url.startsWith("http")) {
            url = "https://" + url
        }

        return {
            baseUrl: url.replace(/\/$/, ""),
            category: "1_1",
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

    private toAnimeTorrent(t: RawTorrent): AnimeTorrent {
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
            console.warn("Sukebei: Failed to parse date: " + t.date)
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

}
