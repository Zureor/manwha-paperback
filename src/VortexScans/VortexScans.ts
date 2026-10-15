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
import {
    PER_PAGE, VX_API, VX_DOMAIN, hasNextPage, lockReason, parseChapters, parseGenreTags, parseMangaDetails, parseMangaList, parsePages,
    type ChapterJson, type PageJson, type PostJson,
} from './VortexScansParser.ts'

export const VortexScansInfo: SourceInfo = {
    version: '1.0.0',
    name: 'Vortex Scans',
    icon: 'icon.png',
    author: 'Zureor',
    authorWebsite: 'https://github.com/Zureor',
    description: 'Extension that pulls content from vortexscans.org.',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: VX_DOMAIN,
    language: 'en',
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED,
}

const HOME_SECTIONS = [
    { id: 'lastChapterAddedAt', title: 'Latest Updates', type: 'singleRowNormal' },
    { id: 'totalViews', title: 'Most Viewed', type: 'singleRowLarge' },
    { id: 'createdAt', title: 'New Series', type: 'singleRowNormal' },
]

export function listUrl(orderBy: string, page: number): string {
    return `${VX_API}/query?page=${page}&perPage=${PER_PAGE}&searchTerm=&orderBy=${orderBy}`
}

// Genres combine; status, type and sort take one value each.
export function searchUrl(query: SearchRequest, page: number): string {
    const genres: string[] = []
    const single: Record<string, string> = {}
    for (const tag of query.includedTags ?? []) {
        const dot = tag.id.indexOf('.')
        const kind = tag.id.slice(0, dot)
        const value = encodeURIComponent(tag.id.slice(dot + 1))
        if (kind === 'genre') genres.push(value)
        else single[kind] ??= value
    }
    const params = [`page=${page}`, `perPage=${PER_PAGE}`, `searchTerm=${encodeURIComponent((query.title ?? '').trim())}`]
    if (genres.length) params.push(`genreIds=${genres.join(',')}`)
    if (single.status) params.push(`seriesStatus=${single.status}`)
    if (single.type) params.push(`seriesType=${single.type}`)
    if (single.sort) params.push(`orderBy=${single.sort}`)
    return `${VX_API}/query?${params.join('&')}`
}

type PageMetadata = { page?: number } | undefined

export class VortexScans extends Source {
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
        return { ...(userAgent ? { 'user-agent': userAgent } : {}), referer: `${VX_DOMAIN}/` }
    }

    private async fetchJson<T>(url: string): Promise<T> {
        const response = await this.requestManager.schedule(App.createRequest({ url, method: 'GET' }), 1)
        if (response.status === 403 || response.status === 503) {
            throw new Error('Vortex Scans is behind a Cloudflare check. Open the source settings in Paperback and run the Cloudflare bypass.')
        }
        if (response.status >= 400) throw new Error(`Vortex Scans: HTTP ${response.status} for ${url}`)
        try {
            return JSON.parse(response.data ?? '') as T
        } catch {
            throw new Error(`Vortex Scans: unexpected response from ${url}`)
        }
    }

    private async pagedList(url: string, page: number): Promise<PagedResults> {
        const data = await this.fetchJson<{ posts?: PostJson[]; totalCount?: number }>(url)
        return App.createPagedResults({
            results: parseMangaList(data.posts),
            metadata: hasNextPage(data.totalCount ?? 0, page) ? { page: page + 1 } : undefined,
        })
    }

    private async fetchPost(mangaId: string): Promise<PostJson> {
        const { post } = await this.fetchJson<{ post?: PostJson }>(`${VX_API}/post?postSlug=${encodeURIComponent(mangaId)}`)
        if (!post) throw new Error(`Vortex Scans: no series found for ${mangaId}`)
        if (post.isNovel || /novel/i.test(post.seriesType ?? '')) throw new Error('Vortex Scans: novels are not supported')
        return post
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        await Promise.all(HOME_SECTIONS.map(async info => {
            const section = App.createHomeSection({ id: info.id, title: info.title, type: info.type, items: [], containsMoreItems: true })
            sectionCallback(section)
            section.items = (await this.pagedList(listUrl(info.id, 1), 1)).results
            sectionCallback(section)
        }))
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: PageMetadata): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        return this.pagedList(listUrl(homepageSectionId, page), page)
    }

    override async getSearchResults(query: SearchRequest, metadata: PageMetadata): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        return this.pagedList(searchUrl(query, page), page)
    }

    override async getSearchTags(): Promise<TagSection[]> {
        return parseGenreTags(await this.fetchJson<{ id: number; name: string }[]>(`${VX_API}/genres`))
    }

    override async supportsTagExclusion(): Promise<boolean> {
        return false
    }

    override getMangaShareUrl(mangaId: string): string {
        return `${VX_DOMAIN}/series/${encodeURIComponent(mangaId)}`
    }

    override async getMangaDetails(mangaId: string): Promise<SourceManga> {
        return parseMangaDetails(this.cheerio.load(''), await this.fetchPost(mangaId), mangaId)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const { id } = await this.fetchPost(mangaId)
        const data = await this.fetchJson<{ post?: { chapters?: ChapterJson[] } }>(`${VX_API}/chapters?postId=${id}`)
        return parseChapters(data.post?.chapters)
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const url = `${VX_API}/chapter?chapterId=${encodeURIComponent(chapterId)}`
        const { chapter } = await this.fetchJson<{ chapter?: PageJson }>(url)
        const reason = lockReason(chapter ?? {})
        if (reason) throw new Error(`Vortex Scans: ${reason}`)
        const pages = parsePages(chapter ?? {})
        if (pages.length === 0) throw new Error(`Vortex Scans: no pages found for ${url}`)
        return App.createChapterDetails({ id: chapterId, mangaId, pages })
    }

    override async getCloudflareBypassRequestAsync(): Promise<Request> {
        return App.createRequest({ url: `${VX_DOMAIN}/`, method: 'GET', headers: await this.siteHeaders() })
    }
}
