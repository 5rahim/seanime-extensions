/// <reference path="../manga-provider.d.ts" />
/// <reference path="../../core.d.ts" />

class Provider {
    private url: string = "https://mangapill.com"

    async search({ query }: QueryOptions): Promise<SearchResult[]> {
        const searchUrl = `${this.url}/search?q=${encodeURIComponent(query)}`
        const response = await fetch(searchUrl)
        const text = await response.text()
        const $ = LoadDoc(text)

        const results: SearchResult[] = []

        $("div.container div.my-3.justify-end > div").each((i, element) => {
            const link = element.find("a").attr("href")
            if (!link) return

            const id = link.split("/manga/")[1].replace(/\//g, "$")
            const title = element.find("div > a > div.mt-3").text().trim()
            const altTitlesText = element.find("div > a > div.text-xs.text-secondary").text().trim()
            const synonyms = altTitlesText ? [altTitlesText] : []
            const image = element.find("a img").attr("data-src")
            const yearStr = element.find("div > div.flex > div").eq(1).text().trim()
            const year = parseInt(yearStr, 10) || 0

            results.push({
                id,
                title,
                synonyms,
                image: image || "",
                year,
            })
        })

        return results
    }

    async findChapters(mangaId: string): Promise<ChapterDetails[]> {
        const uriId = mangaId.replace(/\$/g, "/")
        const url = `${this.url}/manga/${uriId}`
        const response = await fetch(url)
        const text = await response.text()
        const $ = LoadDoc(text)

        const chapters: ChapterDetails[] = []

        $("div.container div.border-border div#chapters div.grid-cols-1 a").each((i, element) => {
            const href = element.attr("href")
            if (!href) return

            const id = href.split("/chapters/")[1].replace(/\//g, "$")
            const title = element.text().trim()
            const chapterMatch = title.match(/Chapter\s+([\d.]+)/)
            const chapterNumber = chapterMatch ? chapterMatch[1] : ""

            chapters.push({
                id,
                title,
                url: "",
                chapter: chapterNumber,
                index: 0, // Will be set later
            })
        })

        chapters.reverse()
        chapters.forEach((chapter, index) => {
            chapter.index = index
        })

        return chapters
    }

    async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
        const uriId = chapterId.replace(/\$/g, "/")
        const url = `${this.url}/chapters/${uriId}`
        const response = await fetch(url)
        const text = await response.text()
        const $ = LoadDoc(text)

        const pages: ChapterPage[] = []

        $("chapter-page").each((i, element) => {
            const imageUrl = element.find("div picture img").attr("data-src")
            if (!imageUrl) return

            const indexStr = element.find("div[data-summary] > div").text()
            const indexMatch = indexStr.match(/page\s+(\d+)/)
            const index = indexMatch ? parseInt(indexMatch[1], 10) - 1 : i

            pages.push({
                url: imageUrl,
                index: index,
                headers: {
                    "Referer": "https://mangapill.com/",
                },
            })
        })

        // Sort by index as a fallback
        pages.sort((a, b) => a.index - b.index)

        return pages
    }

    getSettings(): Settings {
        return {
            supportsMultiLanguage: false,
            supportsMultiScanlator: false,
        }
    }
}
