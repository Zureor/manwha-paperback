import '@paperback/runtime-polyfills'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'
import { fixture } from './helpers.ts'
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
    assert.match(info.desc, /^There are two types of people\./)
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
