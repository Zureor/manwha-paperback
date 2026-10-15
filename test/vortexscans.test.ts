import '@paperback/runtime-polyfills'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as cheerio from 'cheerio'
import { fakeRequests } from './helpers.ts'
import { VortexScans, listUrl, searchUrl } from '../src/VortexScans/VortexScans.ts'
import {
    hasNextPage, lockReason, parseChapters, parseGenreTags, parseMangaDetails, parseMangaList, parsePages,
} from '../src/VortexScans/VortexScansParser.ts'

const raw = (name: string) => readFileSync(new URL(`./fixtures/vortexscans/${name}`, import.meta.url), 'utf8')
const json = (name: string) => JSON.parse(raw(name))
const API = 'https://api.vortexscans.org/api'

test('list: slug ids, covers, newest free chapter as subtitle', () => {
    const items = parseMangaList(json('query.json').posts)
    assert.deepEqual(items.map(i => i.mangaId), ['shadow-slave', 'fantasy-induction-corps', "the-academy's-weapon-copycat"])
    for (const item of items) assert.match(item.image, /^https:\/\/storage\.vortexscans\.org\//)
    assert.deepEqual(items.map(i => i.subtitle), ['Chapter 13', 'Chapter 41', 'Chapter 22'])
})

test('list: novels are left out', () => {
    const novel = { id: 1, slug: 'a', postTitle: 'A', isNovel: true }
    const typedNovel = { id: 2, slug: 'b', postTitle: 'B', seriesType: 'NOVEL' }
    assert.deepEqual(parseMangaList([novel, typedNovel]), [])
    assert.deepEqual(parseMangaList(undefined), [])
})

test('hasNextPage compares totalCount with pages of 18', () => {
    assert.equal(hasNextPage(473, 1), true)
    assert.equal(hasNextPage(473, 27), false)
    assert.equal(hasNextPage(18, 1), false)
})

test('search tags: genres from the API, then status, type and sort', () => {
    const sections = parseGenreTags(json('genres.json'))
    assert.deepEqual(sections.map(s => s.id), ['genre', 'status', 'type', 'sort'])
    assert.equal(sections[0]!.tags.length, 107)
    assert.deepEqual(sections[0]!.tags[0], { id: 'genre.1', label: 'Action' })
    assert.deepEqual(sections[1]!.tags.map(t => t.id), ['status.ONGOING', 'status.COMPLETED', 'status.HIATUS', 'status.CANCELLED', 'status.DROPPED', 'status.COMING_SOON', 'status.MASS_RELEASED'])
    assert.deepEqual(sections[2]!.tags.map(t => t.id), ['type.MANHWA', 'type.MANHUA', 'type.MANGA'])
    assert.deepEqual(sections[3]!.tags.map(t => t.id), ['sort.lastChapterAddedAt', 'sort.totalViews', 'sort.createdAt', 'sort.chaptersCount', 'sort.postTitle'])
})

test('details: titles, cover, plain-text synopsis, status, genre and type tags', () => {
    const manga = parseMangaDetails(cheerio.load(''), json('post.json').post, 'archmage-curriculum')
    const info = manga.mangaInfo
    assert.equal(manga.id, 'archmage-curriculum')
    assert.deepEqual(info.titles, ['Archmage Curriculum', '대마법사 커리큘럼', 'The Archmage Curriculum'])
    assert.match(info.image, /^https:\/\/storage\.vortexscans\.org\//)
    assert.equal(info.desc, 'Synthetic synopsis used by the tests & fixtures.\n\nSecond paragraph.')
    assert.equal(info.status, 'Ongoing')
    assert.equal(info.author, '')
    assert.equal(info.hentai, false)
    assert.deepEqual(info.tags.map(s => s.tags.map(t => t.id)), [['genre.1', 'genre.47'], ['type.MANHWA']])
})

test('chapters: locked chapters are dropped, newest free chapter has the highest index', () => {
    const chapters = parseChapters(json('chapters.json').post.chapters)
    assert.deepEqual(chapters.map(c => c.chapNum), [49, 1])
    assert.equal(chapters[0]!.id, '33451')
    assert.equal(chapters[0]!.name, 'Chapter 49')
    assert.equal(chapters[0]!.langCode, '🇬🇧')
    assert.equal(chapters[0]!.time?.getTime(), Date.UTC(2026, 8, 30, 18, 58, 46, 387))
    assert.deepEqual(chapters.map(c => c.sortingIndex), [2, 1])
    assert.deepEqual(parseChapters(undefined), [])
})

test('chapters: titles and decimal numbers', () => {
    const [chapter] = parseChapters([{ id: 7, slug: 'chapter-10-5', number: '10.5', title: 'The End', createdAt: 'bad date' }])
    assert.equal(chapter!.name, 'Chapter 10.5 - The End')
    assert.equal(chapter!.chapNum, 10.5)
    assert.equal(chapter!.time, undefined)
})

test('lockReason explains why a chapter cannot be read', () => {
    assert.equal(lockReason(json('chapter-locked.json').chapter), 'chapter locked (coins required)')
    assert.equal(lockReason(json('chapter-open.json').chapter), undefined)
    assert.equal(lockReason({ isShortLinkLocked: true }), 'chapter locked (short link)')
    assert.equal(lockReason({ isPermanentlyLocked: true }), 'chapter permanently locked')
    assert.equal(lockReason({ isAccessible: false }), 'chapter locked')
})

test('pages: sorted by order, spaces encoded', () => {
    const pages = parsePages(json('chapter-open.json').chapter)
    assert.equal(pages.length, 3)
    for (const p of pages) assert.match(p, /^https:\/\/storage\.vortexscans\.org\/upload\/series\/archmage-curriculum\//)
    assert.deepEqual(parsePages({ images: [{ url: 'https://x/2 b.webp', order: 1 }, { url: 'https://x/1.webp', order: 0 }, { url: 'https://x/3.webp' }] }), ['https://x/1.webp', 'https://x/2%20b.webp', 'https://x/3.webp'])
    assert.deepEqual(parsePages({}), [])
})

const query = (title: string, tagIds: string[]) => ({
    title,
    includedTags: tagIds.map(id => ({ id, label: id })),
    excludedTags: [],
    parameters: {},
})

test('listUrl: order and page', () => {
    assert.equal(listUrl('totalViews', 3), `${API}/query?page=3&perPage=18&searchTerm=&orderBy=totalViews`)
})

test('searchUrl: text, every genre, first status, type and sort', () => {
    assert.equal(
        searchUrl(query(' solo leveling ', ['genre.1', 'genre.8', 'status.COMPLETED', 'status.ONGOING', 'type.MANHUA', 'type.MANGA', 'sort.totalViews', 'sort.createdAt']), 2),
        `${API}/query?page=2&perPage=18&searchTerm=solo%20leveling&genreIds=1,8&seriesStatus=COMPLETED&seriesType=MANHUA&orderBy=totalViews`,
    )
    assert.equal(searchUrl(query('', []), 1), `${API}/query?page=1&perPage=18&searchTerm=`)
})

// Answers each API path from the fixtures.
const route = (request: { url: string }) =>
    request.url.includes('/post?') ? raw('post.json')
    : request.url.includes('/chapters?') ? raw('chapters.json')
    : request.url.includes('/genres') ? raw('genres.json')
    : raw('query.json')

test('getSearchResults parses posts and sets the next page', async () => {
    const source = new VortexScans(cheerio)
    const requests = fakeRequests(route)
    source.requestManager = requests
    const results = await source.getSearchResults(query('solo', []), undefined)
    assert.equal(results.results.length, 3)
    assert.deepEqual(results.metadata, { page: 2 })
    assert.equal(requests.calls[0].url, `${API}/query?page=1&perPage=18&searchTerm=solo`)
})

test('getHomePageSections sends three empty sections first, then filled ones', async () => {
    const source = new VortexScans(cheerio)
    source.requestManager = fakeRequests(route)
    const seen: number[] = []
    await source.getHomePageSections(section => seen.push(section.items.length))
    assert.deepEqual(seen, [0, 0, 0, 3, 3, 3])
})

test('getSearchTags loads genres from the API', async () => {
    const source = new VortexScans(cheerio)
    const requests = fakeRequests(route)
    source.requestManager = requests
    assert.equal((await source.getSearchTags())[0]!.tags.length, 107)
    assert.equal(requests.calls[0].url, `${API}/genres`)
})

test('getChapters looks up the numeric id, then lists free chapters', async () => {
    const source = new VortexScans(cheerio)
    const requests = fakeRequests(route)
    source.requestManager = requests
    assert.equal((await source.getChapters("the-academy's-weapon-copycat")).length, 2)
    assert.equal(requests.calls[0].url, `${API}/post?postSlug=the-academy's-weapon-copycat`)
    assert.equal(requests.calls[1].url, `${API}/chapters?postId=442`)
})

test('getMangaDetails reads the post and refuses novels', async () => {
    const source = new VortexScans(cheerio)
    source.requestManager = fakeRequests(route)
    assert.equal((await source.getMangaDetails('archmage-curriculum')).mangaInfo.titles[0], 'Archmage Curriculum')
    source.requestManager = fakeRequests(() => JSON.stringify({ post: { id: 1, slug: 'n', postTitle: 'N', isNovel: true } }))
    await assert.rejects(source.getMangaDetails('n'), /Vortex Scans: novels are not supported/)
})

test('getChapterDetails returns pages, and explains locked or empty chapters', async () => {
    const source = new VortexScans(cheerio)
    const requests = fakeRequests(() => raw('chapter-open.json'))
    source.requestManager = requests
    const details = await source.getChapterDetails('archmage-curriculum', '33451')
    assert.equal(details.pages.length, 3)
    assert.equal(details.mangaId, 'archmage-curriculum')
    assert.equal(requests.calls[0].url, `${API}/chapter?chapterId=33451`)
    source.requestManager = fakeRequests(() => raw('chapter-locked.json'))
    await assert.rejects(source.getChapterDetails('archmage-curriculum', '34038'), /Vortex Scans: chapter locked \(coins required\)/)
    source.requestManager = fakeRequests(() => JSON.stringify({ chapter: { images: [] } }))
    await assert.rejects(source.getChapterDetails('archmage-curriculum', '1'), /Vortex Scans: no pages found/)
})

test('a broken response or a Cloudflare block fails with a clear message', async () => {
    const source = new VortexScans(cheerio)
    source.requestManager = fakeRequests(() => '<html>oops</html>')
    await assert.rejects(source.getMangaDetails('x'), /Vortex Scans: unexpected response from https:\/\/api\.vortexscans\.org\/api\/post\?postSlug=x/)
    source.requestManager = fakeRequests(() => 'Just a moment...', 403)
    await assert.rejects(source.getMangaDetails('x'), /Cloudflare/)
})

test('requests and the Cloudflare bypass share the app default user agent, plus the site referer', async () => {
    const source = new VortexScans(cheerio)
    source.requestManager.getDefaultUserAgent = async () => 'TestUA/1.0'
    const request = await source.requestManager.interceptor!.interceptRequest({ url: 'u', method: 'GET', headers: {}, cookies: [] })
    assert.deepEqual(request.headers, { 'user-agent': 'TestUA/1.0', referer: 'https://vortexscans.org/' })
    const bypass = await source.getCloudflareBypassRequestAsync()
    assert.equal(bypass.url, 'https://vortexscans.org/')
    assert.equal(bypass.headers['user-agent'], 'TestUA/1.0')
})
