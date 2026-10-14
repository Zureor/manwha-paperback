import '@paperback/runtime-polyfills'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'
import { fakeRequests, fixture } from './helpers.ts'
import { Manhwa18Net, listUrl, searchUrl } from '../src/Manhwa18Net/Manhwa18Net.ts'
import {
    chapterNumber, hasNextPage, htmlToText, parseChapters, parseGenreTags, parseMangaDetails,
    parseMangaList, parsePages, parseProps, trimMicros,
} from '../src/Manhwa18Net/Manhwa18NetParser.ts'

const page = (name: string) => fixture('manhwa18net', name)
const props = (name: string) => parseProps(page(name), name)

test('parseProps reads the Inertia JSON and fails loudly without it', () => {
    assert.ok(props('list.html').paginate)
    assert.throws(() => parseProps(cheerio.load('<html></html>'), 'https://manhwa18.net/x'), /Manhwa18: no page data found at https:\/\/manhwa18\.net\/x/)
    assert.throws(() => parseProps(cheerio.load('<div id="app" data-page="{oops"></div>'), 'u'), /Manhwa18: page data at u is not valid JSON/)
})

test('list: slug ids, cover_url images (never the dead thumb_url), latest chapter subtitle, paging', () => {
    const list = props('list.html').paginate
    const items = parseMangaList(list)
    assert.equal(items.length, 3)
    for (const item of items) {
        assert.match(item.mangaId, /^[a-z0-9-]+$/)
        assert.ok(item.title.length > 0)
        assert.match(item.image, /^https:\/\//)
        assert.match(item.subtitle ?? '', /^Chap/)
    }
    assert.equal(items[1]!.image, 'https://manhwa18.net/storage/images/raw/01KVS31B1RF6T1MFTS26B0SZWM.webp')
    assert.equal(hasNextPage(list), true)
})

test('last page: no items, no next page', () => {
    const list = props('last.html').paginate
    assert.deepEqual(parseMangaList(list), [])
    assert.equal(hasNextPage(list), false)
    assert.deepEqual(parseMangaList(undefined), [])
})

test('search page: results under mangas, genres for tags', () => {
    const p = props('search.html')
    assert.equal(parseMangaList(p.mangas).length, 3)
    assert.equal(hasNextPage(p.mangas), true)
    const sections = parseGenreTags(p.genres)
    assert.deepEqual(sections.map(s => s.id), ['genre', 'status', 'sort'])
    assert.equal(sections[0]!.tags.length, 73)
    assert.deepEqual(sections[0]!.tags.find(t => t.id === 'genre.adult'), { id: 'genre.adult', label: 'Adult' })
    assert.deepEqual(sections[1]!.tags.map(t => t.id), ['status.Ongoing', 'status.Onhold', 'status.completed'])
    assert.deepEqual(sections[2]!.tags.map(t => t.id), ['sort.update', 'sort.top', 'sort.new', 'sort.like'])
})

test('details: titles, cover, plain-text synopsis, artist, status, genres', () => {
    const $ = page('manga.html')
    const manga = parseMangaDetails($, parseProps($, 'manga.html').manga!)
    const info = manga.mangaInfo
    assert.equal(manga.id, 'secret-class')
    assert.deepEqual(info.titles, ['Secret class', 'Secret class manhwa'])
    assert.match(info.image, /^https:\/\/manhwa18\.net\/storage\//)
    assert.ok(info.desc.length > 20)
    assert.doesNotMatch(info.desc, /<|&amp;/)
    assert.equal(info.author, 'Wang Kang Cheol')
    assert.equal(info.artist, 'Wang Kang Cheol')
    assert.equal(info.status, 'Ongoing')
    assert.equal(info.hentai, true)
    assert.ok(info.tags[0]!.tags.every(t => t.id.startsWith('genre.')))
})

test('htmlToText keeps paragraph breaks and decodes entities', () => {
    assert.equal(htmlToText(cheerio.load(''), '<p>Line &amp; one</p><p>Two</p>'), 'Line & one\nTwo')
    assert.equal(htmlToText(cheerio.load(''), ''), '')
})

test('chapters: slug ids, numbers, ISO dates, order as sorting index', () => {
    const chapters = parseChapters(props('manga.html').chapters)
    assert.equal(chapters.length, 4)
    assert.equal(chapters[0]!.id, 'chapter-320')
    assert.equal(chapters[0]!.chapNum, 320)
    assert.equal(chapters[0]!.langCode, '🇬🇧')
    assert.equal(chapters[0]!.time?.getTime(), Date.UTC(2026, 9, 8, 22, 30, 34))
    assert.equal(chapters[0]!.sortingIndex, 328)
    assert.equal(chapters.at(-1)!.id, 'chap-01-361')
    assert.equal(chapters.at(-1)!.chapNum, 1)
    assert.equal(chapters.at(-1)!.sortingIndex, 1)
    assert.deepEqual(parseChapters(undefined), [])
})

test('chapterNumber prefers the number after "chap"', () => {
    assert.equal(chapterNumber('Chapter 320'), 320)
    assert.equal(chapterNumber('Chap 01'), 1)
    assert.equal(chapterNumber('Season 2 Chapter 5.5'), 5.5)
    assert.equal(chapterNumber('Episode 7'), 7)
    assert.equal(chapterNumber('Prologue'), undefined)
})

test('trimMicros cuts ISO fractions to milliseconds for JavaScriptCore', () => {
    assert.equal(trimMicros('2026-10-08T22:30:34.000000Z'), '2026-10-08T22:30:34.000Z')
    assert.equal(trimMicros('2026-10-08T22:30:34Z'), '2026-10-08T22:30:34Z')
})

test('chapter page: image urls from chapterContent', () => {
    const $ = page('chapter.html')
    const pages = parsePages($, parseProps($, 'chapter.html').chapterContent ?? '')
    assert.equal(pages.length, 5)
    for (const p of pages) assert.match(p, /^https:\/\/min\.manhwa18\.net\//)
    assert.deepEqual(parsePages($, '<p>no images</p>'), [])
})

const query = (title: string, tagIds: string[]) => ({
    title,
    includedTags: tagIds.map(id => ({ id, label: id })),
    excludedTags: [],
    parameters: {},
})

test('listUrl: sort and page', () => {
    assert.equal(listUrl('top', 2), 'https://manhwa18.net/manga-list?sort=top&page=2')
})

test('searchUrl: text search ignores filters', () => {
    assert.equal(searchUrl(query(' secret class ', ['genre.adult', 'status.completed']), 1), 'https://manhwa18.net/tim-kiem?q=secret%20class&page=1')
})

test('searchUrl: first genre and first sort win, every status is sent', () => {
    assert.equal(
        searchUrl(query('', ['genre.adult', 'genre.drama', 'sort.top', 'sort.new', 'status.Ongoing', 'status.completed']), 2),
        'https://manhwa18.net/genre/adult?sort=top&page=2&Ongoing=1&completed=1',
    )
    assert.equal(searchUrl(query('', ['status.Onhold']), 1), 'https://manhwa18.net/manga-list?page=1&Onhold=1')
    assert.equal(searchUrl(query('', []), 1), 'https://manhwa18.net/manga-list?page=1')
})

test('getSearchResults reads mangas for text search and sets next page', async () => {
    const source = new Manhwa18Net(cheerio)
    const requests = fakeRequests(() => page('search.html').html())
    source.requestManager = requests
    const results = await source.getSearchResults(query('secret', []), undefined)
    assert.equal(results.results.length, 3)
    assert.deepEqual(results.metadata, { page: 2 })
    assert.equal(requests.calls[0].url, 'https://manhwa18.net/tim-kiem?q=secret&page=1')
})

test('getViewMoreItems stops on the last page', async () => {
    const source = new Manhwa18Net(cheerio)
    source.requestManager = fakeRequests(() => page('last.html').html())
    const results = await source.getViewMoreItems('update', { page: 9999 })
    assert.deepEqual(results.results, [])
    assert.equal(results.metadata, undefined)
})

test('getHomePageSections sends four empty sections first, then filled ones', async () => {
    const source = new Manhwa18Net(cheerio)
    source.requestManager = fakeRequests(() => page('list.html').html())
    const seen: number[] = []
    await source.getHomePageSections(section => seen.push(section.items.length))
    assert.deepEqual(seen, [0, 0, 0, 0, 3, 3, 3, 3])
})

test('getMangaDetails and getChapters read the title page', async () => {
    const source = new Manhwa18Net(cheerio)
    const requests = fakeRequests(() => page('manga.html').html())
    source.requestManager = requests
    assert.equal((await source.getMangaDetails('secret-class')).mangaInfo.titles[0], 'Secret class')
    assert.equal((await source.getChapters('secret-class')).length, 4)
    assert.equal(requests.calls[0].url, 'https://manhwa18.net/manga/secret-class')
})

test('getChapterDetails returns pages, and fails clearly when a chapter has none', async () => {
    const source = new Manhwa18Net(cheerio)
    const requests = fakeRequests(() => page('chapter.html').html())
    source.requestManager = requests
    const details = await source.getChapterDetails('secret-class', 'chapter-320')
    assert.equal(details.pages.length, 5)
    assert.equal(requests.calls[0].url, 'https://manhwa18.net/manga/secret-class/chapter-320')
    source.requestManager = fakeRequests(() => '<div id="app" data-page="{&quot;props&quot;:{&quot;chapterContent&quot;:&quot;&quot;}}"></div>')
    await assert.rejects(source.getChapterDetails('secret-class', 'chapter-1'), /Manhwa18: no pages found/)
})

test('a Cloudflare block tells the user to run the bypass', async () => {
    const source = new Manhwa18Net(cheerio)
    source.requestManager = fakeRequests(() => 'Just a moment...', 503)
    await assert.rejects(source.getMangaDetails('secret-class'), /Cloudflare/)
})
