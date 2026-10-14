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
    MC_DOMAIN, hasNextPage, parseChapters, parseGenreTags, parseMangaDetails, parseMangaList, parsePages, parsePostId,
} from './ManhwaClubParser.ts'

export const ManhwaClubInfo: SourceInfo = {
    version: '1.0.0',
    name: 'ManhwaClub',
    icon: 'icon.jpg',
    author: 'Zureor',
    authorWebsite: 'https://github.com/Zureor',
    description: 'Extension that pulls content from manhwaclub.net.',
    contentRating: ContentRating.ADULT,
    websiteBaseURL: MC_DOMAIN,
    language: 'en',
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED,
}

const HOME_SECTIONS = [
    { id: 'latest', title: 'Latest Updates', type: 'singleRowNormal' },
    { id: 'trending', title: 'Trending', type: 'singleRowLarge' },
    { id: 'views', title: 'Most Viewed', type: 'singleRowNormal' },
    { id: 'new-manga', title: 'New', type: 'singleRowNormal' },
]

export function listUrl(order: string, page: number): string {
    return `${MC_DOMAIN}/manga/${page > 1 ? `page/${page}/` : ''}?m_orderby=${order}`
}

export function searchUrl(query: SearchRequest, page: number): string {
    const params = [`s=${encodeURIComponent(query.title ?? '')}`, 'post_type=wp-manga']
    let sorted = false
    for (const tag of query.includedTags ?? []) {
        const dot = tag.id.indexOf('.')
        const kind = tag.id.slice(0, dot)
        const value = encodeURIComponent(tag.id.slice(dot + 1))
        if (kind === 'genre') params.push(`genre%5B%5D=${value}`)
        else if (kind === 'status') params.push(`status%5B%5D=${value}`)
        else if (kind === 'sort' && !sorted) {
            params.push(`m_orderby=${value}`)
            sorted = true
        }
    }
    return `${MC_DOMAIN}/${page > 1 ? `page/${page}/` : ''}?${params.join('&')}`
}

type PageMetadata = { page?: number } | undefined

export class ManhwaClub extends Source {
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
        return { ...(userAgent ? { 'user-agent': userAgent } : {}), referer: `${MC_DOMAIN}/` }
    }

    private async fetchHtml(url: string, form?: Record<string, string>): Promise<CheerioAPI> {
        const request = App.createRequest({
            url,
            method: form ? 'POST' : 'GET',
            headers: form ? { 'content-type': 'application/x-www-form-urlencoded' } : {},
            data: form,
        })
        const response = await this.requestManager.schedule(request, 1)
        if (response.status === 403 || response.status === 503) {
            throw new Error('ManhwaClub is behind a Cloudflare check. Open the source settings in Paperback and run the Cloudflare bypass.')
        }
        if (response.status >= 400) throw new Error(`ManhwaClub: HTTP ${response.status} for ${url}`)
        return this.cheerio.load(response.data ?? '')
    }

    private async pagedList(url: string, itemSelector: string, page: number): Promise<PagedResults> {
        const $ = await this.fetchHtml(url)
        return App.createPagedResults({
            results: parseMangaList($, itemSelector),
            metadata: hasNextPage($) ? { page: page + 1 } : undefined,
        })
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        await Promise.all(HOME_SECTIONS.map(async info => {
            const section = App.createHomeSection({ id: info.id, title: info.title, type: info.type, items: [], containsMoreItems: true })
            sectionCallback(section)
            section.items = parseMangaList(await this.fetchHtml(listUrl(info.id, 1)), '.page-item-detail')
            sectionCallback(section)
        }))
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: PageMetadata): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        return this.pagedList(listUrl(homepageSectionId, page), '.page-item-detail', page)
    }

    override async getSearchResults(query: SearchRequest, metadata: PageMetadata): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        return this.pagedList(searchUrl(query, page), '.c-tabs-item__content', page)
    }

    override async getSearchTags(): Promise<TagSection[]> {
        return parseGenreTags(await this.fetchHtml(`${MC_DOMAIN}/?s=&post_type=wp-manga`))
    }

    override async supportsTagExclusion(): Promise<boolean> {
        return false
    }

    override getMangaShareUrl(mangaId: string): string {
        return `${MC_DOMAIN}/manga/${mangaId}/`
    }

    override async getMangaDetails(mangaId: string): Promise<SourceManga> {
        return parseMangaDetails(await this.fetchHtml(this.getMangaShareUrl(mangaId)), mangaId)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const url = this.getMangaShareUrl(mangaId)
        const postId = parsePostId(await this.fetchHtml(url))
        if (!postId) throw new Error(`ManhwaClub: no manga id found on ${url}`)
        return parseChapters(await this.fetchHtml(`${MC_DOMAIN}/wp-admin/admin-ajax.php`, { action: 'manga_get_chapters', manga: postId }))
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const url = `${MC_DOMAIN}/manga/${mangaId}/${chapterId}/`
        const pages = parsePages(await this.fetchHtml(url))
        if (pages.length === 0) throw new Error(`ManhwaClub: no pages found on ${url}`)
        return App.createChapterDetails({ id: chapterId, mangaId, pages })
    }

    override async getCloudflareBypassRequestAsync(): Promise<Request> {
        return App.createRequest({ url: `${MC_DOMAIN}/`, method: 'GET', headers: await this.siteHeaders() })
    }
}
