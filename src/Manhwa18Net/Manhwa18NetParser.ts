import type { CheerioAPI } from 'cheerio'
import type { Chapter, PartialSourceManga, SourceManga, TagSection } from '@paperback/types'

export const M18_DOMAIN = 'https://manhwa18.net'

export interface MangaJson {
    name: string
    slug: string
    other_name?: string | null
    cover_url?: string | null
    thumb_url?: string | null
    pilot?: string | null
    status_id?: number | null
    genres?: { name: string; slug: string }[]
    artists?: { name: string }[]
    latest_chapter?: { name: string } | null
}

export interface Paginated {
    data: MangaJson[]
    next_page_url: string | null
}

export interface ChapterJson {
    name: string
    slug: string
    created_at?: string | null
    order?: number | null
}

export interface InertiaProps {
    paginate?: Paginated
    mangas?: Paginated
    genres?: { name: string; slug: string }[]
    manga?: MangaJson
    chapters?: ChapterJson[]
    chapterContent?: string
}

const STATUS: Record<number, string> = { 0: 'Ongoing', 1: 'Completed', 2: 'Hiatus' }

// Every manhwa18.net page is an Inertia.js app; its data is JSON in #app[data-page].
export function parseProps($: CheerioAPI, url: string): InertiaProps {
    const raw = $('#app').attr('data-page')
    if (!raw) throw new Error(`Manhwa18: no page data found at ${url}`)
    try {
        return (JSON.parse(raw) as { props: InertiaProps }).props
    } catch {
        throw new Error(`Manhwa18: page data at ${url} is not valid JSON`)
    }
}

// thumb_url is often a dead link; cover_url is the working one.
const coverOf = (manga: MangaJson) => manga.cover_url || manga.thumb_url || ''

export function parseMangaList(list: Paginated | undefined): PartialSourceManga[] {
    return (list?.data ?? []).map(manga => App.createPartialSourceManga({
        mangaId: manga.slug,
        title: manga.name,
        image: coverOf(manga),
        subtitle: manga.latest_chapter?.name || undefined,
    }))
}

export function hasNextPage(list: Paginated | undefined): boolean {
    return !!list?.next_page_url
}

export function parseGenreTags(genres: { name: string; slug: string }[] | undefined): TagSection[] {
    const status = [['Ongoing', 'Ongoing'], ['Onhold', 'On Hold'], ['completed', 'Completed']]
    const sort = [['update', 'Latest Updates'], ['top', 'Most Viewed'], ['new', 'Newest'], ['like', 'Most Liked']]
    return [
        App.createTagSection({ id: 'genre', label: 'Genres (first one wins)', tags: (genres ?? []).map(g => App.createTag({ id: `genre.${g.slug}`, label: g.name })) }),
        App.createTagSection({ id: 'status', label: 'Status', tags: status.map(([id, label]) => App.createTag({ id: `status.${id}`, label: label! })) }),
        App.createTagSection({ id: 'sort', label: 'Sort (first one wins)', tags: sort.map(([id, label]) => App.createTag({ id: `sort.${id}`, label: label! })) }),
    ]
}

export function htmlToText($: CheerioAPI, html: string): string {
    return $('<div></div>').html(html.replace(/<\/p>|<br\s*\/?>/gi, '$&\n')).text().replace(/\n{3,}/g, '\n\n').trim()
}

export function parseMangaDetails($: CheerioAPI, manga: MangaJson): SourceManga {
    const artist = (manga.artists ?? []).map(a => a.name).join(', ')
    const otherName = (manga.other_name ?? '').trim().replace(/^\((.*)\)$/, '$1')
    return App.createSourceManga({
        id: manga.slug,
        mangaInfo: App.createMangaInfo({
            titles: otherName ? [manga.name, otherName] : [manga.name],
            image: coverOf(manga),
            desc: htmlToText($, manga.pilot ?? ''),
            author: artist,
            artist,
            status: STATUS[manga.status_id ?? -1] ?? 'Unknown',
            hentai: true,
            tags: [App.createTagSection({
                id: 'genre',
                label: 'Genres',
                tags: (manga.genres ?? []).map(g => App.createTag({ id: `genre.${g.slug}`, label: g.name })),
            })],
        }),
    })
}

export function chapterNumber(name: string): number | undefined {
    const match = /chap(?:ter)?\.?\s*(\d+(?:\.\d+)?)/i.exec(name) ?? /(\d+(?:\.\d+)?)/.exec(name)
    return match ? Number(match[1]) : undefined
}

// Laravel sends microseconds (.000000Z); JavaScriptCore's Date parser expects at most 3 digits.
export function trimMicros(iso: string): string {
    return iso.replace(/\.(\d{3})\d+Z$/, '.$1Z')
}

export function parseChapters(chapters: ChapterJson[] | undefined): Chapter[] {
    return (chapters ?? []).map(chapter => {
        const time = chapter.created_at ? new Date(trimMicros(chapter.created_at)) : undefined
        return App.createChapter({
            id: chapter.slug,
            name: chapter.name,
            chapNum: chapterNumber(chapter.name) ?? chapter.order ?? 0,
            langCode: '🇬🇧',
            time: time && !isNaN(time.getTime()) ? time : undefined,
            sortingIndex: chapter.order ?? undefined,
        })
    })
}

export function parsePages($: CheerioAPI, chapterContent: string): string[] {
    return $('<div></div>').html(chapterContent).find('img').toArray()
        .map(img => ($(img).attr('src') || $(img).attr('data-src') || '').trim())
        .filter(Boolean)
}
