/// <reference path="../../core.d.ts" />
/// <reference path="../../plugin.d.ts" />
/// <reference path="../../app.d.ts" />
/// <reference path="../../system.d.ts" />

//@ts-ignore
function init() {
    $ui.register((ctx) => {
        // Create the tray icon
        const tray = ctx.newTray({
            iconUrl: "https://raw.githubusercontent.com/5rahim/seanime-extensions/main/plugins/custom-banner-images/icon.png",
            withContent: true,
            width: "350px",
        })

        // Keep track of the current media ID
        const currentMediaId = ctx.state(0)

        // Create a field ref for the URL input
        const inputRef = ctx.fieldRef()

        // When the plugin loads, fetch the current screen and set the badge to 0
        ctx.screen.loadCurrent() // Triggers onNavigate
        tray.updateBadge({ number: 0 })
        // Also fetch current screen when tray is open
        tray.onOpen(() => {
            ctx.screen.loadCurrent()
        })

        ctx.dom.onReady(() => {
            ctx.screen.loadCurrent()
        })

        // Updates the field's value and badge based on the current anime page
        function updateState() {
            // Reset the badge and input if the user currently isn't on an anime page
            if (!currentMediaId.get()) {
                inputRef.setValue("")
                tray.updateBadge({ number: 0 })
            }
            // Get the stored background image URL for this anime
            const url = $storage.get<string>("backgroundImages." + currentMediaId.get())
            if (url) {
                // If there's a URL, set the value of the input
                inputRef.setValue(url)
                // Add a badge
                tray.updateBadge({ number: 1, intent: "info" })
            } else {
                inputRef.setValue("")
                tray.updateBadge({ number: 0 })
            }
        }

        // Run the function when the plugin loads
        updateState()

        // Update currentMediaId when the user navigates
        ctx.screen.onNavigate(async (e) => {
            console.log("onNavigate", e)
            // If the user navigates to an anime page
            if ((e.pathname === "/entry" || e.pathname === "/manga/entry") && !!e.searchParams.id) {
                // Get the ID from the URL
                const id = parseInt(e.searchParams.id)
                currentMediaId.set(id)

            } else {
                currentMediaId.set(0)
            }
        })

        tray.onOpen(() => {
            updateState()
        })

        // This effect will update the state each time currentMediaId changes
        ctx.effect(() => {
            updateState()
        }, [currentMediaId])

        // Create a handler to store the custom banner image URL
        ctx.registerEventHandler("save", () => {
            if (!!inputRef.current) {
                $storage.set(`backgroundImages.${currentMediaId.get()}`, inputRef.current)
            } else {
                $storage.remove(`backgroundImages.${currentMediaId.get()}`)
            }
            ctx.toast.info("Saving...")
            updateState() // Update the state

            // Updates the data on the client
            // This is better than calling ctx.screen.reload()
            $anilist.refreshAnimeCollection()
            $anilist.refreshMangaCollection()
        })

        // Create a handler to open the media page when the Open button is clicked
        ctx.registerEventHandler("open", (event) => {
            const mediaId = event.mediaId
            if (mediaId) {
                // Navigate to the entry page with the media ID
                ctx.screen.navigateTo("/entry", { id: mediaId })
            }
        })

        const animeCollection = ctx.state<Record<string, any>>({})
        const mangaCollection = ctx.state<Record<string, any>>({})

        tray.onOpen(async () => {
            if (currentMediaId.get() !== 0) {
                return
            }
            async function getAnimeCollection() {
                return $anilist.getAnimeCollection(false)
            }
            async function getMangaCollection() {
                return $anilist.getMangaCollection(false)
            }
            const [_animeCollection, _mangaCollection] = await Promise.all([
                getAnimeCollection(),
                getMangaCollection(),
            ])

            let animeCollectionObject: Record<string, any> = {}
            if (_animeCollection?.MediaListCollection?.lists?.length) {
                for (let i = 0; i < _animeCollection!.MediaListCollection!.lists!.length; i++) {
                    for (let j = 0; j < _animeCollection!.MediaListCollection!.lists![i]!.entries!.length; j++) {
                        const mediaId = _animeCollection!.MediaListCollection!.lists![i]!.entries![j]!.media!.id
                        animeCollectionObject[mediaId.toString()] = _animeCollection!.MediaListCollection!.lists![i]!.entries![j]!.media
                    }
                }
            }
            animeCollection.set(animeCollectionObject)

            let mangaCollectionObject: Record<string, any> = {}
            if (_mangaCollection?.MediaListCollection?.lists?.length) {
                for (let i = 0; i < _mangaCollection!.MediaListCollection!.lists!.length; i++) {
                    for (let j = 0; j < _mangaCollection!.MediaListCollection!.lists![i]!.entries!.length; j++) {
                        const mediaId = _mangaCollection!.MediaListCollection!.lists![i]!.entries![j]!.media!.id
                        mangaCollectionObject[mediaId.toString()] = _mangaCollection!.MediaListCollection!.lists![i]!.entries![j]!.media
                    }
                }
            }
            mangaCollection.set(mangaCollectionObject)
        })

        function listCustomizedMedia() {
            const bannerImages = $storage.get<Record<string, string | undefined>>("backgroundImages")
            if (!bannerImages) {
                return tray.div([])
            }
            return tray.stack(Object.keys(bannerImages).sort().map((key) => {
                let media: $app.AL_BaseAnime | $app.AL_BaseManga | null = null
                // Get the numeric media ID
                const mediaId = key.toString()

                // Check if we have this media in our collections
                if (animeCollection.get() && animeCollection.get()[mediaId]) {
                    media = animeCollection.get()[mediaId]
                } else if (mangaCollection.get() && mangaCollection.get()[mediaId]) {
                    media = mangaCollection.get()[mediaId]
                }
                // Register a specific handler for this media ID
                const openHandlerId = `open_${key}`
                ctx.registerEventHandler(openHandlerId, () => {
                    tray.close()
                    if (media) {
                        if (media.type?.toString() === "ANIME") {
                            ctx.screen.navigateTo("/entry", { id: media.id.toString() })
                        } else {
                            ctx.screen.navigateTo("/manga/entry", { id: media.id.toString() })
                        }
                    }
                })



                // Ensure we have a valid title string to display
                const title = media && media.title && media.title.userPreferred
                    ? media.title.userPreferred.toString()
                    : `ID: ${key}`

                return tray.flex([
                    tray.text(title.toString(), {
                        style: { fontSize: "13px", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: "1", WebkitBoxOrient: "vertical" }
                    }),
                    tray.button({ label: "Open", size: "sm", onClick: openHandlerId, intent: "gray-subtle" }),
                ], { gap: 1, style: { alignItems: "center" } })
            }), { gap: 1, style: { marginTop: "10px", maxHeight: "100px", overflow: "auto", border: "1px solid #262626", padding: "5px 5px 5px 10px", borderRadius: "5px" } })
        }

        // Tray content
        tray.render(() => {
            return tray.div([
                currentMediaId.get() === 0
                    ? tray.div([
                        tray.stack([
                            tray.text("Custom Banner Images"),
                            tray.text("Open an anime or manga to edit the banner image", { style: { color: "#666", fontSize: "13px" } }),
                        ], { gap: 1 }),
                        listCustomizedMedia(),
                    ]) : tray.div([]),
                tray.stack([
                    tray.input({ label: "Banner image URL", placeholder: "Enter a URL", fieldRef: inputRef, style: { fontSize: "13px" } }),
                    tray.button({ label: "Save", onClick: "save", intent: "white" }),
                ], { style: { display: currentMediaId.get() === 0 ? "none" : "flex" } }),
            ])
        })
    })

    // Register hook handlers to listen and modify the anime collection.

    // Triggers the app loads the user's AniList anime collection
    $app.onGetAnimeCollection((e) => {
        const bannerImages = $storage.get<Record<string, string | undefined>>("backgroundImages")
        if (!bannerImages) {
            e.next()
            return
        }
        if (!e.animeCollection?.MediaListCollection?.lists?.length) {
            e.next()
            return
        }


        for (let i = 0; i < e.animeCollection!.MediaListCollection!.lists!.length; i++) {
            for (let j = 0; j < e.animeCollection!.MediaListCollection!.lists![i]!.entries!.length; j++) {
                const mediaId = e.animeCollection!.MediaListCollection!.lists![i]!.entries![j]!.media!.id
                const bannerImage = bannerImages[mediaId.toString()]
                if (!!bannerImage) {
                    e.animeCollection!.MediaListCollection!.lists![i]!.entries![j]!.media!.bannerImage = bannerImage
                }
            }
        }

        e.next()
    })

    // Same as onGetAnimeCollection but also includes custom lists.
    $app.onGetRawAnimeCollection((e) => {
        const bannerImages = $storage.get<Record<string, string | undefined>>("backgroundImages")
        if (!e.animeCollection?.MediaListCollection?.lists?.length) {
            e.next()
            return
        }

        if (!bannerImages) {
            e.next()
            return
        }

        for (let i = 0; i < e.animeCollection!.MediaListCollection!.lists!.length; i++) {
            for (let j = 0; j < e.animeCollection!.MediaListCollection!.lists![i]!.entries!.length; j++) {
                const mediaId = e.animeCollection!.MediaListCollection!.lists![i]!.entries![j]!.media!.id
                const bannerImage = bannerImages[mediaId.toString()]
                if (!!bannerImage) {
                    e.animeCollection!.MediaListCollection!.lists![i]!.entries![j]!.media!.bannerImage = bannerImage
                }
            }
        }

        e.next()
    })

    // Triggers the app loads the user's AniList manga collection
    $app.onGetMangaCollection((e) => {
        const bannerImages = $storage.get<Record<string, string | undefined>>("backgroundImages")
        if (!e.mangaCollection?.MediaListCollection?.lists?.length) {
            e.next()
            return
        }
        if (!bannerImages) {
            e.next()
            return
        }

        for (let i = 0; i < e.mangaCollection!.MediaListCollection!.lists!.length; i++) {
            for (let j = 0; j < e.mangaCollection!.MediaListCollection!.lists![i]!.entries!.length; j++) {
                const mediaId = e.mangaCollection!.MediaListCollection!.lists![i]!.entries![j]!.media!.id
                const bannerImage = bannerImages[mediaId.toString()]
                if (!!bannerImage) {
                    e.mangaCollection!.MediaListCollection!.lists![i]!.entries![j]!.media!.bannerImage = bannerImage
                }
            }
        }

        e.next()
    })

    // Same as onGetAnimeCollection but also includes custom lists.
    $app.onGetRawMangaCollection((e) => {
        const bannerImages = $storage.get<Record<string, string | undefined>>("backgroundImages")
        if (!e.mangaCollection?.MediaListCollection?.lists?.length) {
            e.next()
            return
        }

        if (!bannerImages) {
            e.next()
            return
        }

        for (let i = 0; i < e.mangaCollection!.MediaListCollection!.lists!.length; i++) {
            for (let j = 0; j < e.mangaCollection!.MediaListCollection!.lists![i]!.entries!.length; j++) {
                const mediaId = e.mangaCollection!.MediaListCollection!.lists![i]!.entries![j]!.media!.id
                const bannerImage = bannerImages[mediaId.toString()]
                if (!!bannerImage) {
                    e.mangaCollection!.MediaListCollection!.lists![i]!.entries![j]!.media!.bannerImage = bannerImage
                }
            }
        }

        e.next()
    })
}
