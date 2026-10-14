import {
    ContentRating,
    Source,
    SourceIntents,
    type Chapter,
    type ChapterDetails,
    type HomeSection,
    type PagedResults,
    type Request,
    type Response,
    type SearchRequest,
    type SourceInfo,
    type SourceManga,
    type TagSection,
} from '@paperback/types'
import type { CheerioAPI } from 'cheerio'
import {
    M18_DOMAIN, hasNextPage, parseChapters, parseGenreTags, parseMangaDetails, parseMangaList, parsePages, parseProps,
    type InertiaProps,
} from './Manhwa18NetParser.ts'

export const Manhwa18NetInfo: SourceInfo = {
    version: '1.0.0',
    name: 'Manhwa18.net',
    icon: 'icon.png',
    author: 'Zureor',
    authorWebsite: 'https://github.com/Zureor',
    description: 'Extension that pulls content from manhwa18.net.',
    contentRating: ContentRating.ADULT,
    websiteBaseURL: M18_DOMAIN,
    language: 'en',
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED,
}

const HOME_SECTIONS = [
    { id: 'update', title: 'Latest Updates', type: 'singleRowNormal' },
    { id: 'top', title: 'Most Viewed', type: 'singleRowLarge' },
    { id: 'new', title: 'Newest', type: 'singleRowNormal' },
    { id: 'like', title: 'Most Liked', type: 'singleRowNormal' },
]

export function listUrl(sort: string, page: number): string {
    return `${M18_DOMAIN}/manga-list?sort=${sort}&page=${page}`
}

// The site cannot combine text search with filters, and takes one genre and one sort.
export function searchUrl(query: SearchRequest, page: number): string {
    const title = (query.title ?? '').trim()
    if (title) return `${M18_DOMAIN}/tim-kiem?q=${encodeURIComponent(title)}&page=${page}`
    let genre = ''
    let sort = ''
    const statuses: string[] = []
    for (const tag of query.includedTags ?? []) {
        const dot = tag.id.indexOf('.')
        const kind = tag.id.slice(0, dot)
        const value = encodeURIComponent(tag.id.slice(dot + 1))
        if (kind === 'genre' && !genre) genre = value
        else if (kind === 'sort' && !sort) sort = value
        else if (kind === 'status') statuses.push(`${value}=1`)
    }
    const params = [...(sort ? [`sort=${sort}`] : []), `page=${page}`, ...statuses]
    return `${M18_DOMAIN}/${genre ? `genre/${genre}` : 'manga-list'}?${params.join('&')}`
}

type PageMetadata = { page?: number } | undefined

export class Manhwa18Net extends Source {
    requestManager = App.createRequestManager({
        requestsPerSecond: 3,
        requestTimeout: 20000,
        interceptor: {
            // The app's own user agent is the one the Cloudflare bypass webview solves with, so cf_clearance keeps working.
            interceptRequest: async (request: Request): Promise<Request> => {
                // Reassign the whole object: 0.8 does not see in-place header edits.
                request.headers = { ...(request.headers ?? {}), ...(await this.siteHeaders()) }
                return request
            },
            interceptResponse: async (response: Response): Promise<Response> => response,
        },
    })

    private async siteHeaders(): Promise<Record<string, string>> {
        const userAgent = await this.requestManager.getDefaultUserAgent()
        return { ...(userAgent ? { 'user-agent': userAgent } : {}), referer: `${M18_DOMAIN}/` }
    }

    private async fetchPage(url: string): Promise<{ $: CheerioAPI; props: InertiaProps }> {
        const response = await this.requestManager.schedule(App.createRequest({ url, method: 'GET' }), 1)
        if (response.status === 403 || response.status === 503) {
            throw new Error('Manhwa18.net is behind a Cloudflare check. Open the source settings in Paperback and run the Cloudflare bypass.')
        }
        if (response.status >= 400) throw new Error(`Manhwa18: HTTP ${response.status} for ${url}`)
        const $ = this.cheerio.load(response.data ?? '')
        return { $, props: parseProps($, url) }
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        await Promise.all(HOME_SECTIONS.map(async info => {
            const section = App.createHomeSection({ id: info.id, title: info.title, type: info.type, items: [], containsMoreItems: true })
            sectionCallback(section)
            section.items = parseMangaList((await this.fetchPage(listUrl(info.id, 1))).props.paginate)
            sectionCallback(section)
        }))
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: PageMetadata): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        const list = (await this.fetchPage(listUrl(homepageSectionId, page))).props.paginate
        return App.createPagedResults({ results: parseMangaList(list), metadata: hasNextPage(list) ? { page: page + 1 } : undefined })
    }

    override async getSearchResults(query: SearchRequest, metadata: PageMetadata): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        const { props } = await this.fetchPage(searchUrl(query, page))
        const list = props.mangas ?? props.paginate
        return App.createPagedResults({ results: parseMangaList(list), metadata: hasNextPage(list) ? { page: page + 1 } : undefined })
    }

    override async getSearchTags(): Promise<TagSection[]> {
        return parseGenreTags((await this.fetchPage(`${M18_DOMAIN}/tim-kiem?q=`)).props.genres)
    }

    override async supportsTagExclusion(): Promise<boolean> {
        return false
    }

    override getMangaShareUrl(mangaId: string): string {
        return `${M18_DOMAIN}/manga/${mangaId}`
    }

    override async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const url = this.getMangaShareUrl(mangaId)
        const { $, props } = await this.fetchPage(url)
        if (!props.manga) throw new Error(`Manhwa18: no title data at ${url}`)
        return parseMangaDetails($, props.manga)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        return parseChapters((await this.fetchPage(this.getMangaShareUrl(mangaId))).props.chapters)
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const url = `${M18_DOMAIN}/manga/${mangaId}/${chapterId}`
        const { $, props } = await this.fetchPage(url)
        const pages = parsePages($, props.chapterContent ?? '')
        if (pages.length === 0) throw new Error(`Manhwa18: no pages found on ${url}`)
        return App.createChapterDetails({ id: chapterId, mangaId, pages })
    }

    override async getCloudflareBypassRequestAsync(): Promise<Request> {
        return App.createRequest({ url: `${M18_DOMAIN}/`, method: 'GET', headers: await this.siteHeaders() })
    }
}
