/// <reference path="../../plugin.d.ts" />
/// <reference path="../../app.d.ts" />
/// <reference path="../../system.d.ts" />
/// <reference path="../../core.d.ts" />

function init() {
    $app.onGetAnimeCollection((e) => {
        const animeDataSet: Record<string, { bannerImage: string, title: string }> = {}
        for (const list of e.animeCollection?.MediaListCollection?.lists || []) {
            for (const entry of list.entries || []) {
                if (!entry?.media) continue

                if (animeDataSet[String(entry.media.id)]) {
                    continue
                }

                animeDataSet[String(entry.media.id)] = {
                    bannerImage: entry.media.bannerImage || entry.media.coverImage?.extraLarge || "",
                    title: entry.media.title?.userPreferred || "",
                }
            }
        }
        $store.set("animeDataSet", animeDataSet)

        e.next()
    })
    $app.onGetCachedAnimeCollection((e) => {
        const animeDataSet: Record<string, { bannerImage: string, title: string }> = {}
        for (const list of e.animeCollection?.MediaListCollection?.lists || []) {
            for (const entry of list.entries || []) {
                if (!entry?.media) continue

                if (animeDataSet[String(entry.media.id)]) {
                    continue
                }

                animeDataSet[String(entry.media.id)] = {
                    bannerImage: entry.media.bannerImage || entry.media.coverImage?.extraLarge || "",
                    title: entry.media.title?.userPreferred || "",
                }
            }
        }
        $store.set("animeDataSet", animeDataSet)

        e.next()
    })

    $app.onAnimeLibraryCollection((e) => {
        const hideThumbnails = $storage.get("params.hideThumbnails") || false
        const hideTitles = $storage.get("params.hideTitles") || false
        const skipNextEpisode = $storage.get("params.skipNextEpisode") || false

        if (skipNextEpisode) {
            e.next()
            return
        }

        if (!hideThumbnails && !hideTitles) {
            e.next()
            return
        }

        if (e.libraryCollection?.continueWatchingList) {
            for (const episode of e.libraryCollection.continueWatchingList) {

                if (hideThumbnails && episode.episodeMetadata?.image) {
                    episode.episodeMetadata.image = episode.baseAnime?.bannerImage || episode.baseAnime?.coverImage?.extraLarge || ""
                }

                if (hideTitles) {
                    episode.episodeTitle = episode.baseAnime?.title?.userPreferred || ""
                }

            }
        }

        e.next()
    })

    $app.onAnimeLibraryStreamCollection((e) => {
        const hideThumbnails = $storage.get("params.hideThumbnails") || false
        const hideTitles = $storage.get("params.hideTitles") || false
        const skipNextEpisode = $storage.get("params.skipNextEpisode") || false

        if (skipNextEpisode) {
            e.next()
            return
        }

        if (!hideThumbnails && !hideTitles) {
            e.next()
            return
        }

        if (e.streamCollection?.continueWatchingList) {
            for (const episode of e.streamCollection.continueWatchingList) {

                if (hideThumbnails && episode.episodeMetadata?.image) {
                    episode.episodeMetadata.image = episode.baseAnime?.bannerImage || episode.baseAnime?.coverImage?.extraLarge || ""
                }

                if (hideTitles) {
                    episode.episodeTitle = episode.baseAnime?.title?.userPreferred || ""
                }

            }
        }

        e.next()
    })

    $app.onMissingEpisodes((e) => {
        const hideThumbnails = $storage.get("params.hideThumbnails") || false

        if (!hideThumbnails) {
            e.next()
            return
        }

        if (e.missingEpisodes) {
            for (const episode of e.missingEpisodes?.episodes || []) {
                if (hideThumbnails && episode.episodeMetadata?.image) {
                    episode.episodeMetadata.image = episode.baseAnime?.bannerImage || episode.baseAnime?.coverImage?.extraLarge || ""
                }
            }
        }
    })

    $ui.register((ctx) => {
        // Create the tray icon
        const tray = ctx.newTray({
            iconUrl: "https://raw.githubusercontent.com/5rahim/seanime-extensions/main/plugins/hide-spoilers/icon.png",
            withContent: true,
        })

        ctx.screen.onNavigate((screen) => {
            if (screen.pathname === "/") {
                const hideThumbnails = $storage.get("params.hideThumbnails") || false
                const hideTitles = $storage.get("params.hideTitles") || false

                if (hideThumbnails || hideTitles) {
                    $anilist.getAnimeCollection(false)
                }
            }
        })
        ctx.screen.loadCurrent()

        const [, refetchEpisodeCard] = ctx.dom.observe("[data-episode-card]", async (episodeCards) => {
            try {
                const hideThumbnails = $storage.get("params.hideThumbnails") || false
                const hideTitles = $storage.get("params.hideTitles") || false
                const skipNextEpisode = $storage.get("params.skipNextEpisode") || false
                const animeDataSet = $store.get<Record<string, { bannerImage: string, title: string }>>("animeDataSet") || {}

                const listDataElement = await ctx.dom.queryOne("[data-anime-entry-list-data]")
                if (!listDataElement) {
                    return
                }
                const listDataStr = await listDataElement.getAttribute("data-anime-entry-list-data")
                const listData = JSON.parse(listDataStr || "{}") as Record<string, any>


                let progress = Number(listData?.progress || 0)
                if (skipNextEpisode) {
                    progress = progress + 1
                }


                for (const episodeCard of episodeCards) {
                    const episodeNumberStr = episodeCard.attributes["data-episode-number"]
                    const episodeNumber = Number(episodeNumberStr)
                    if (!isNaN(episodeNumber)) {
                        const $ = LoadDoc(episodeCard.innerHTML!)
                        const imageSelection = $("[data-episode-card-image]")
                        if (imageSelection.length() === 0 || !imageSelection.attr("id")) {
                            continue
                        }

                        const image = ctx.dom.asElement(imageSelection.attr("id")!)
                        if (hideThumbnails && episodeNumber > progress) {
                            image.setStyle("filter", "blur(24px)")
                        } else {
                            image.removeStyle("filter")
                        }


                        const titleSelection = $("[data-episode-card-title]")
                        if (titleSelection.length() === 0 || !titleSelection.attr("id")) {
                            continue
                        }

                        const title = ctx.dom.asElement(titleSelection.attr("id")!)
                        if (hideTitles && episodeNumber > progress) {
                            title?.setStyle("filter", "blur(4px)")
                        } else {
                            title?.removeStyle("filter")
                        }

                        // const title = await episodeCard.queryOne("[data-episode-card-title]")
                        // if (hideTitles && episodeNumber > progress) {
                        //     title?.setStyle("filter", "blur(4px)")
                        // } else {
                        //     title?.removeStyle("filter")
                        // }
                    }
                }
            }
            catch (e) {
                console.error("Error processing episodeCard", e)
            }
        }, { withInnerHTML: true, identifyChildren: true })

        $store.watch("animeDataSet", (animeDataSet) => {
            refetchEpisodeCard()
        })

        ctx.dom.observe("[data-episode-card-title]", async (episodeCards) => {
            refetchEpisodeCard()
        })


        const [, refetchEpisodeGridItem] = ctx.dom.observe("[data-episode-grid-item]", async (episodeGridItems) => {
            try {
                const hideThumbnails = $storage.get("params.hideThumbnails") || false
                const hideTitles = $storage.get("params.hideTitles") || false
                const hideDescriptions = $storage.get("params.hideDescriptions") || false

                const listDataElement = await ctx.dom.queryOne("[data-anime-entry-list-data]")
                if (!listDataElement) {

                    return
                }
                const listDataStr = await listDataElement.getAttribute("data-anime-entry-list-data")
                const listData = JSON.parse(listDataStr || "{}") as Record<string, any>

                const skipNextEpisode = $storage.get("params.skipNextEpisode") || false

                let progress = Number(listData?.progress || 0)
                if (skipNextEpisode) {
                    progress = progress + 1
                }

                for (const episodeGridItem of episodeGridItems) {
                    const episodeNumberStr = episodeGridItem.attributes["data-episode-number"]
                    const episodeNumber = Number(episodeNumberStr)
                    if (!isNaN(episodeNumber)) {
                        const $ = LoadDoc(episodeGridItem.innerHTML!)

                        const imageSelection = $("[data-episode-grid-item-image]")
                        if (imageSelection.length() === 0 || !imageSelection.attr("id")) {
                            continue
                        }

                        const image = ctx.dom.asElement(imageSelection.attr("id")!)

                        if (hideThumbnails && episodeNumber > progress) {
                            image.setStyle("filter", "blur(24px)")
                        } else {
                            image.removeStyle("filter")
                        }

                        try {
                            const titleSelection = $("[data-episode-grid-item-episode-title]")
                            if (titleSelection.length() === 0 || !titleSelection.attr("id")) {
                                continue
                            }

                            const title = ctx.dom.asElement(titleSelection.attr("id")!)

                            if (hideTitles && episodeNumber > progress) {
                                title.setStyle("filter", "blur(4px)")
                            } else {
                                title.removeStyle("filter")
                            }
                        }
                        catch (e) {

                        }

                        try {
                            // data-episode-grid-item-filename
                            const filenameSelection = $("[data-episode-grid-item-filename]")
                            if (filenameSelection.length() !== 0 || !!filenameSelection.attr("id")) {
                            }

                            const filename = ctx.dom.asElement(filenameSelection.attr("id")!)
                            if (hideTitles && episodeNumber > progress) {
                                filename.setStyle("visibility", "hidden")
                            } else {
                                filename.removeStyle("visibility")
                            }

                        }
                        catch (e) {

                        }

                        try {
                            const descriptionSelection = $("[data-episode-grid-item-episode-description]")
                            if (descriptionSelection.length() === 0 || !descriptionSelection.attr("id")) {
                                continue
                            }

                            const description = ctx.dom.asElement(descriptionSelection.attr("id")!)
                            if (hideDescriptions && episodeNumber > progress) {
                                description.setStyle("filter", "blur(4px)")
                            } else {
                                description.removeStyle("filter")
                            }
                        }
                        catch (e) {

                        }
                    }
                }
            }
            catch (e) {
                console.error("Error processing episodeGridItem", e)
            }
        }, { withInnerHTML: true, identifyChildren: true })

        ctx.dom.observe("[data-anime-entry-list-data]", async (episodeCards) => {
            // refetchEpisodeCard()
            refetchEpisodeGridItem()
        })

        const hideThumbnailsRef = ctx.fieldRef<boolean>()
        const hideTitlesRef = ctx.fieldRef<boolean>()
        const hideDescriptionsRef = ctx.fieldRef<boolean>()
        const skipNextEpisodeRef = ctx.fieldRef<boolean>()

        function updateForm() {
            const params = $storage.get("params") || {}
            hideThumbnailsRef.setValue(params.hideThumbnails || false)
            hideTitlesRef.setValue(params.hideTitles || false)
            hideDescriptionsRef.setValue(params.hideDescriptions || false)
            skipNextEpisodeRef.setValue(params.skipNextEpisode || false)
        }

        tray.onOpen(() => {
            updateForm()
        })

        ctx.registerEventHandler("save", () => {
            $app.invalidateClientQuery(["ANIME-COLLECTION-get-library-collection", "ANIME-ENTRIES-get-anime-entry"])
            $storage.set("params", {
                hideThumbnails: hideThumbnailsRef.current,
                hideTitles: hideTitlesRef.current,
                hideDescriptions: hideDescriptionsRef.current,
                skipNextEpisode: skipNextEpisodeRef.current,
            })
            updateForm()
            refetchEpisodeCard()
            refetchEpisodeGridItem()
            ctx.toast.success("Settings saved")
        })

        tray.render(() => tray.stack([
            tray.text("Hide potential spoilers"),
            tray.stack([
                tray.switch("Hide thumbnails", { fieldRef: hideThumbnailsRef }),
                tray.switch("Hide titles", { fieldRef: hideTitlesRef }),
                tray.switch("Hide descriptions", { fieldRef: hideDescriptionsRef }),
            ], { gap: 0 }),
            tray.checkbox("Skip next episode", { fieldRef: skipNextEpisodeRef }),
            tray.button("Save", { onClick: "save", intent: "primary" }),
        ]))

        ctx.dom.onReady(() => {
            refetchEpisodeCard()
            refetchEpisodeGridItem()
        })

        ctx.screen.onNavigate((screen) => {
            refetchEpisodeCard()
            refetchEpisodeGridItem()
        })
        ctx.screen.loadCurrent()
    })
}
