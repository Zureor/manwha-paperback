import type { CheerioAPI } from 'cheerio'
import type { Chapter, PartialSourceManga, SourceManga, TagSection } from '@paperback/types'

export const VX_DOMAIN = 'https://vortexscans.org'
export const VX_API = 'https://api.vortexscans.org/api'
export const PER_PAGE = 18

export interface ChapterJson {
    id: number
    slug: string
    number: number | string
    title?: string | null
    createdAt?: string | null
    isLocked?: boolean | null
    isAccessible?: boolean | null
}

export interface PostJson {
    id: number
    slug: string
    postTitle: string
    featuredImage?: string | null
    seriesType?: string | null
    seriesStatus?: string | null
    isNovel?: boolean | null
    postContent?: string | null
    alternativeTitles?: string | null
    author?: string | null
    artist?: string | null
    genres?: { id: number; name: string }[]
    chapters?: ChapterJson[]
}

export interface PageJson {
    isLocked?: boolean | null
    isAccessible?: boolean | null
    isLockedByCoins?: boolean | null
    isPermanentlyLocked?: boolean | null
    isShortLinkLocked?: boolean | null
    images?: { url: string; order?: number | null }[]
}

const STATUS: Record<string, string> = {
    ONGOING: 'Ongoing', COMING_SOON: 'Ongoing', MASS_RELEASED: 'Ongoing',
    COMPLETED: 'Completed', HIATUS: 'Hiatus', CANCELLED: 'Cancelled', DROPPED: 'Cancelled',
}
const TYPES = [['MANHWA', 'Manhwa'], ['MANHUA', 'Manhua'], ['MANGA', 'Manga']]

const isNovel = (post: PostJson) => !!post.isNovel || /novel/i.test(post.seriesType ?? '')

// Paid early-access chapters: the API serves them without images.
const isLocked = (chapter: ChapterJson) => chapter.isLocked === true || chapter.isAccessible === false

export function parseMangaList(posts: PostJson[] | undefined): PartialSourceManga[] {
    return (posts ?? []).filter(post => !isNovel(post)).map(post => {
        const latest = (post.chapters ?? []).find(chapter => !isLocked(chapter))
        return App.createPartialSourceManga({
            mangaId: post.slug,
            title: post.postTitle,
            image: post.featuredImage ?? '',
            subtitle: latest ? `Chapter ${latest.number}` : undefined,
        })
    })
}

export function hasNextPage(totalCount: number, page: number): boolean {
    return totalCount > page * PER_PAGE
}

export function parseGenreTags(genres: { id: number; name: string }[] | undefined): TagSection[] {
    const status = [['ONGOING', 'Ongoing'], ['COMPLETED', 'Completed'], ['HIATUS', 'Hiatus'], ['CANCELLED', 'Cancelled'], ['DROPPED', 'Dropped'], ['COMING_SOON', 'Coming Soon'], ['MASS_RELEASED', 'Mass Released']]
    const sort = [['lastChapterAddedAt', 'Latest Chapter'], ['totalViews', 'Most Viewed'], ['createdAt', 'Newest'], ['chaptersCount', 'Most Chapters'], ['postTitle', 'A-Z']]
    const section = (id: string, label: string, pairs: string[][]) =>
        App.createTagSection({ id, label, tags: pairs.map(([value, name]) => App.createTag({ id: `${id}.${value}`, label: name! })) })
    return [
        App.createTagSection({ id: 'genre', label: 'Genres', tags: (genres ?? []).map(g => App.createTag({ id: `genre.${g.id}`, label: g.name })) }),
        section('status', 'Status (first one wins)', status),
        section('type', 'Type (first one wins)', TYPES),
        section('sort', 'Sort (first one wins)', sort),
    ]
}

function htmlToText($: CheerioAPI, html: string): string {
    return $('<div></div>').html(html.replace(/<\/p>|<br\s*\/?>/gi, '$&\n')).text().replace(/\n{3,}/g, '\n\n').trim()
}

export function parseMangaDetails($: CheerioAPI, post: PostJson, mangaId: string): SourceManga {
    const altTitles = (post.alternativeTitles ?? '').split(/[\n,]/).map(t => t.trim()).filter(Boolean)
    const type = TYPES.find(([value]) => value === post.seriesType)
    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles: [...new Set([post.postTitle, ...altTitles])],
            image: post.featuredImage ?? '',
            desc: htmlToText($, post.postContent ?? ''),
            author: post.author ?? '',
            artist: post.artist ?? '',
            status: STATUS[post.seriesStatus ?? ''] ?? 'Unknown',
            hentai: false,
            tags: [
                App.createTagSection({ id: 'genre', label: 'Genres', tags: (post.genres ?? []).map(g => App.createTag({ id: `genre.${g.id}`, label: g.name })) }),
                App.createTagSection({ id: 'type', label: 'Type', tags: type ? [App.createTag({ id: `type.${type[0]}`, label: type[1]! })] : [] }),
            ],
        }),
    })
}

// The API lists chapters newest first.
export function parseChapters(chapters: ChapterJson[] | undefined): Chapter[] {
    const free = (chapters ?? []).filter(chapter => !isLocked(chapter))
    return free.map((chapter, index) => {
        const time = chapter.createdAt ? new Date(chapter.createdAt) : undefined
        return App.createChapter({
            id: String(chapter.id),
            name: `Chapter ${chapter.number}${chapter.title?.trim() ? ` - ${chapter.title.trim()}` : ''}`,
            chapNum: Number(chapter.number) || 0,
            langCode: '🇬🇧',
            time: time && !isNaN(time.getTime()) ? time : undefined,
            sortingIndex: free.length - index,
        })
    })
}

export function lockReason(page: PageJson): string | undefined {
    if (page.isLockedByCoins) return 'chapter locked (coins required)'
    if (page.isShortLinkLocked) return 'chapter locked (short link)'
    if (page.isPermanentlyLocked) return 'chapter permanently locked'
    if (page.isLocked || page.isAccessible === false) return 'chapter locked'
    return undefined
}

export function parsePages(page: PageJson): string[] {
    return [...(page.images ?? [])]
        .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))
        .map(image => image.url.replace(/ /g, '%20'))
}
