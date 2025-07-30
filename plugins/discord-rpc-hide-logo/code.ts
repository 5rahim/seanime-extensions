/// <reference path="../../core.d.ts" />
/// <reference path="../../plugin.d.ts" />
/// <reference path="../../system.d.ts" />
/// <reference path="../../app.d.ts" />

//@ts-ignore
function init() {

    $app.onDiscordPresenceAnimeActivityRequested((e) => {
        e.smallImage = ""
        e.smallText = ""
        e.next()
    })

    $app.onDiscordPresenceMangaActivityRequested((e) => {
        e.smallImage = ""
        e.smallText = ""
        e.next()
    })

}
