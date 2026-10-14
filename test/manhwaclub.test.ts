import '@paperback/runtime-polyfills'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'
import { fakeRequests, fixture } from './helpers.ts'
import { ManhwaClub, listUrl, searchUrl } from '../src/ManhwaClub/ManhwaClub.ts'
import {
    chapterNumber, fixImageUrl, hasNextPage, parseChapters, parseDate, parseGenreTags,
    parseMangaDetails, parseMangaList, parsePages, parsePostId,
} from '../src/ManhwaClub/ManhwaClubParser.ts'

const page = (name: string) => fixture('manhwaclub', name)

test('list page: 10 items with slug ids, https covers, latest chapter, next page', () => {
    const $ = page('list.html')
    const items = parseMangaList($, '.page-item-detail')
    assert.equal(items.length, 10)
    for (const item of items) {
        assert.match(item.mangaId, /^[a-z0-9-]+$/)
        assert.ok(item.title.length > 0)
        assert.match(item.image, /^https:\/\//)
        assert.match(item.subtitle ?? '', /^Chapter /)
    }
    assert.equal(hasNextPage($), true)
})

test('search page: 20 items and next page', () => {
    const $ = page('search.html')
    assert.equal(parseMangaList($, '.c-tabs-item__content').length, 20)
    assert.equal(hasNextPage($), true)
})

test('empty result page: no items, no next page', () => {
    const $ = cheerio.load('<div class="c-tabs-item"></div>')
    assert.deepEqual(parseMangaList($, '.c-tabs-item__content'), [])
    assert.equal(hasNextPage($), false)
})

test('search tags: genres from the form, then status and sort', () => {
    const sections = parseGenreTags(page('search.html'))
    assert.deepEqual(sections.map(s => s.id), ['genre', 'status', 'sort'])
    assert.equal(sections[0]!.tags.length, 27)
    assert.deepEqual(sections[0]!.tags.find(t => t.id === 'genre.adult'), { id: 'genre.adult', label: 'Adult' })
    assert.deepEqual(sections[1]!.tags.map(t => t.id), ['status.on-going', 'status.end', 'status.canceled', 'status.on-hold'])
    assert.deepEqual(sections[2]!.tags.map(t => t.id), ['sort.latest', 'sort.trending', 'sort.views', 'sort.new-manga', 'sort.alphabet', 'sort.rating'])
})

test('details: badge-free title, alt titles, cover, synopsis, status, genres', () => {
    const manga = parseMangaDetails(page('manga.html'), 'a-quiet-cat')
    const info = manga.mangaInfo
    assert.equal(manga.id, 'a-quiet-cat')
    assert.equal(info.titles[0], 'A Quiet Cat')
    assert.ok(info.titles.includes('얌전한 고양이'))
    assert.equal(info.titles.filter(t => t === 'A Quiet Cat').length, 1)
    assert.match(info.image, /^https:\/\/manhwaclub\.net\/wp-content\/uploads\//)
    assert.equal(info.desc, 'Synthetic synopsis used by the tests & fixtures.\n\nSecond paragraph.')
    assert.equal(info.status, 'Ongoing')
    assert.equal(info.author, '')
    assert.equal(info.hentai, true)
    assert.deepEqual(info.tags[0]!.tags.map(t => t.id), ['genre.adult', 'genre.drama', 'genre.manhwa'])
})

test('details page exposes the numeric post id', () => {
    assert.equal(parsePostId(page('manga.html')), '2494')
    assert.equal(parsePostId(cheerio.load('<html></html>')), '')
})

test('chapters: unique ids, flags by raw suffix, numbers, dates, newest has highest index', () => {
    const chapters = parseChapters(page('chapters.html'))
    assert.ok(chapters.length > 0)
    assert.equal(new Set(chapters.map(c => c.id)).size, chapters.length)
    for (const c of chapters) {
        assert.equal(c.langCode, c.id.endsWith('-raw') ? '🇰🇷' : '🇬🇧')
        assert.ok(c.chapNum > 0)
        assert.ok(c.time instanceof Date && !isNaN(c.time.getTime()), `bad date on ${c.id}`)
    }
    assert.equal(chapters[0]!.sortingIndex, chapters.length)
    assert.equal(chapters.at(-1)!.sortingIndex, 1)
})

test('chapterNumber reads decimals from slugs', () => {
    assert.equal(chapterNumber('chapter-125-5'), 125.5)
    assert.equal(chapterNumber('chapter-26-raw'), 26)
    assert.equal(chapterNumber('chapter-10-5-raw'), 10.5)
    assert.equal(chapterNumber('prologue'), 0)
})

test('parseDate handles absolute and relative dates', () => {
    const now = Date.UTC(2026, 9, 14, 12)
    assert.equal(parseDate('October 6, 2026', now)?.getFullYear(), 2026)
    assert.equal(parseDate('October 6, 2026', now)?.getMonth(), 9)
    assert.equal(parseDate('18 hours ago', now)?.getTime(), now - 18 * 3600e3)
    assert.equal(parseDate('an hour ago', now)?.getTime(), now - 3600e3)
    assert.equal(parseDate('3 mins ago', now)?.getTime(), now - 3 * 60e3)
    assert.equal(parseDate('2 days ago', now)?.getTime(), now - 2 * 864e5)
    assert.equal(parseDate('', now), undefined)
    assert.equal(parseDate('not a date', now), undefined)
})

test('fixImageUrl trims whitespace and forces https', () => {
    assert.equal(fixImageUrl(' http://manhwaclub.net/a.jpg\t'), 'https://manhwaclub.net/a.jpg')
    assert.equal(fixImageUrl('//manhwaclub.net/a.jpg'), 'https://manhwaclub.net/a.jpg')
    assert.equal(fixImageUrl(undefined), '')
})

test('chapter page: 17 https images in order', () => {
    const pages = parsePages(page('chapter.html'))
    assert.equal(pages.length, 17)
    for (const p of pages) assert.match(p, /^https:\/\/manhwaclub\.net\/wp-content\/uploads\/WP-manga\//)
    assert.match(pages[0]!, /\/1-[^/]*$/)
})

const query = (title: string, tagIds: string[]) => ({
    title,
    includedTags: tagIds.map(id => ({ id, label: id })),
    excludedTags: [],
    parameters: {},
})

test('listUrl: page 1 has no page segment', () => {
    assert.equal(listUrl('latest', 1), 'https://manhwaclub.net/manga/?m_orderby=latest')
    assert.equal(listUrl('views', 3), 'https://manhwaclub.net/manga/page/3/?m_orderby=views')
})

test('searchUrl: text, every genre and status, first sort only, paging', () => {
    assert.equal(
        searchUrl(query('secret class', ['genre.romance', 'genre.drama', 'status.end', 'sort.views', 'sort.latest']), 2),
        'https://manhwaclub.net/page/2/?s=secret%20class&post_type=wp-manga&genre%5B%5D=romance&genre%5B%5D=drama&status%5B%5D=end&m_orderby=views',
    )
    assert.equal(searchUrl(query('', []), 1), 'https://manhwaclub.net/?s=&post_type=wp-manga')
})

test('getSearchResults parses results and returns next-page metadata', async () => {
    const source = new ManhwaClub(cheerio)
    const requests = fakeRequests(() => page('search.html').html())
    source.requestManager = requests
    const results = await source.getSearchResults(query('secret', []), undefined)
    assert.equal(results.results.length, 20)
    assert.deepEqual(results.metadata, { page: 2 })
    assert.equal(requests.calls[0].url, 'https://manhwaclub.net/?s=secret&post_type=wp-manga')
})

test('getChapters posts the numeric post id to admin-ajax', async () => {
    const source = new ManhwaClub(cheerio)
    const requests = fakeRequests(request => page(request.method === 'POST' ? 'chapters.html' : 'manga.html').html())
    source.requestManager = requests
    const chapters = await source.getChapters('a-quiet-cat')
    assert.ok(chapters.length > 0)
    assert.equal(requests.calls[0].url, 'https://manhwaclub.net/manga/a-quiet-cat/')
    assert.equal(requests.calls[1].url, 'https://manhwaclub.net/wp-admin/admin-ajax.php')
    assert.equal(requests.calls[1].method, 'POST')
    assert.deepEqual(requests.calls[1].data, { action: 'manga_get_chapters', manga: '2494' })
    assert.equal(requests.calls[1].headers['content-type'], 'application/x-www-form-urlencoded')
})

test('getChapters fails clearly when the page has no post id', async () => {
    const source = new ManhwaClub(cheerio)
    source.requestManager = fakeRequests(() => '<html></html>')
    await assert.rejects(source.getChapters('missing'), /ManhwaClub: no manga id found on https:\/\/manhwaclub\.net\/manga\/missing\//)
})

test('getChapterDetails returns pages, and fails clearly when a chapter has none', async () => {
    const source = new ManhwaClub(cheerio)
    source.requestManager = fakeRequests(() => page('chapter.html').html())
    const details = await source.getChapterDetails('a-quiet-cat', 'chapter-25-raw')
    assert.equal(details.pages.length, 17)
    assert.equal(details.mangaId, 'a-quiet-cat')
    source.requestManager = fakeRequests(() => '<html></html>')
    await assert.rejects(source.getChapterDetails('a-quiet-cat', 'chapter-1'), /ManhwaClub: no pages found/)
})

test('a Cloudflare block tells the user to run the bypass', async () => {
    const source = new ManhwaClub(cheerio)
    source.requestManager = fakeRequests(() => 'Just a moment...', 403)
    await assert.rejects(source.getMangaDetails('a-quiet-cat'), /Cloudflare/)
})

test('getHomePageSections sends four empty sections first, then filled ones', async () => {
    const source = new ManhwaClub(cheerio)
    source.requestManager = fakeRequests(() => page('list.html').html())
    const seen: number[] = []
    await source.getHomePageSections(section => seen.push(section.items.length))
    assert.deepEqual(seen, [0, 0, 0, 0, 10, 10, 10, 10])
})

test('requests and the Cloudflare bypass share the app default user agent, plus the site referer', async () => {
    const source = new ManhwaClub(cheerio)
    source.requestManager.getDefaultUserAgent = async () => 'TestUA/1.0'
    const request = await source.requestManager.interceptor!.interceptRequest({ url: 'u', method: 'GET', headers: { 'content-type': 'x' }, cookies: [] })
    assert.deepEqual(request.headers, { 'content-type': 'x', 'user-agent': 'TestUA/1.0', referer: 'https://manhwaclub.net/' })
    const bypass = await source.getCloudflareBypassRequestAsync()
    assert.equal(bypass.url, 'https://manhwaclub.net/')
    assert.equal(bypass.headers['user-agent'], 'TestUA/1.0')
})
