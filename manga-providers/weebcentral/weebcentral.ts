/// <reference path="../manga-provider.d.ts" />
/// <reference path="../../core.d.ts" />

class Provider implements MangaProvider {
    private url: string = "https://weebcentral.com"

    async search({ query }: QueryOptions): Promise<SearchResult[]> {
        const searchUrl = `${this.url}/search/simple?location=main`
        const form = new URLSearchParams()
        form.set("text", query)

        const response = await this.fetch(searchUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "HX-Request": "true",
                "HX-Trigger": "quick-search-input",
                "HX-Trigger-Name": "text",
                "HX-Target": "quick-search-result",
                "HX-Current-URL": `${this.url}/`,
            },
            body: form.toString(),
        })

        const text = await response.text()
        const $ = LoadDoc(text)

        const searchResults: SearchResult[] = []

        $("#quick-search-result > div > a").each((i, el) => {
            const link = el.attr("href")
            if (!link) return

            const title = el.find(".flex-1").text().trim()

            let image = ""
            const sourceElement = el.find("source")
            if (sourceElement.length() > 0) {
                image = sourceElement.attr("srcset") || ""
            } else {
                const imgElement = el.find("img")
                if (imgElement.length() > 0) {
                    image = imgElement.attr("src") || ""
                }
            }

            const idPartMatch = link.match(/\/series\/([^/]+)/)
            if (!idPartMatch || !idPartMatch[1]) return

            const id = idPartMatch[1]

            // Simple rating based on title match
            if (title.toLowerCase().includes(query.toLowerCase())) {
                searchResults.push({
                    id: id,
                    title: title,
                    synonyms: [],
                    year: 0,
                    image: image,
                })
            }
        })

        return searchResults
    }

    async findChapters(mangaId: string): Promise<ChapterDetails[]> {
        const chapterUrl = `${this.url}/series/${mangaId}/full-chapter-list`

        const response = await this.fetch(chapterUrl, {
            headers: {
                "HX-Request": "true",
                "HX-Target": "chapter-list",
                "HX-Current-URL": `${this.url}/series/${mangaId}`,
                "Referer": `${this.url}/series/${mangaId}`,
            },
        })

        const text = await response.text()
        const $ = LoadDoc(text)

        const chapters: ChapterDetails[] = []
        const chapterRegex = /(\d+(?:\.\d+)?)/

        $("div.flex.items-center").each((i, el) => {
            const a = el.find("a")
            if (!a) return

            const chapterUrl = a.attr("href")
            if (!chapterUrl) return

            const chapterTitle = a.find("span.grow > span").first().text().trim()

            let chapterNumber = ""
            const match = chapterTitle.match(chapterRegex)
            if (match && match[1]) {
                chapterNumber = String(parseFloat(match[1]))
            }

            const chapterIdMatch = chapterUrl.match(/\/chapters\/([^/]+)/)
            if (!chapterIdMatch || !chapterIdMatch[1]) return

            const chapterId = chapterIdMatch[1]

            chapters.push({
                id: chapterId,
                url: chapterUrl,
                title: chapterTitle,
                chapter: chapterNumber,
                index: 0, // Will be set later
            })
        })

        // Reverse to have chapters in ascending order
        chapters.reverse()

        // Set the correct index after reversing
        chapters.forEach((chapter, i) => {
            chapter.index = i
        })

        return chapters
    }

    async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
        const url = `${this.url}/chapters/${chapterId}/images?is_prev=False&reading_style=long_strip`

        const response = await this.fetch(url, {
            headers: {
                "HX-Request": "true",
                "HX-Current-URL": `${this.url}/chapters/${chapterId}`,
                "Referer": `${this.url}/chapters/${chapterId}`,
            },
        })

        const text = await response.text()
        const $ = LoadDoc(text)

        let pages: ChapterPage[] = []

        $("section.flex-1 img").each((i, el) => {
            const imageUrl = el.attr("src")
            if (imageUrl) {
                pages.push({
                    url: imageUrl,
                    index: i,
                    headers: { "Referer": this.url },
                })
            }
        })

        // Fallback if the main selector doesn't find images
        if (pages.length === 0 && $("img").length() > 0) {
            $("img").each((i, el) => {
                const imageUrl = el.attr("src")
                if (imageUrl) {
                    pages.push({
                        url: imageUrl,
                        index: i,
                        headers: { "Referer": this.url },
                    })
                }
            })
        }

        return pages
    }

    getSettings(): Settings {
        return {
            supportsMultiLanguage: false,
            supportsMultiScanlator: false,
        }
    }

    private async fetch(url: string, options: RequestInit = {}): Promise<Response> {
        const defaultHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36",
        }

        const mergedOptions: RequestInit = {
            ...options,
            headers: {
                ...defaultHeaders,
                ...options.headers,
            },
        }

        return fetch(url, mergedOptions)
    }
}
