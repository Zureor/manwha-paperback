// Live end-to-end check against the Vortex Scans API through the real 0.8 runtime polyfills.
import '@paperback/runtime-polyfills'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'
import { VortexScans } from '../src/VortexScans/VortexScans.ts'

const source = new VortexScans(cheerio as any)

const home = new Map<string, number>()
await source.getHomePageSections(section => home.set(section.id, section.items.length))
for (const [id, count] of home) assert.ok(count > 0, `home section ${id} is empty`)

const more = await source.getViewMoreItems('lastChapterAddedAt', { page: 2 })
assert.ok(more.results.length > 0, 'view more page 2 is empty')

const tags = await source.getSearchTags()
assert.ok(tags[0]!.tags.length > 0, 'no genre tags')

const genre = await source.getSearchResults({ includedTags: [{ id: 'genre.1', label: 'Action' }], excludedTags: [], parameters: {} }, undefined)
assert.ok(genre.results.length > 0, 'genre search is empty')

const search = await source.getSearchResults({ title: 'archmage', includedTags: [], excludedTags: [], parameters: {} }, undefined)
const first = search.results[0]
assert.ok(first, 'text search is empty')

const details = await source.getMangaDetails(first.mangaId)
const chapters = await source.getChapters(first.mangaId)
assert.ok(chapters.length > 0, 'no chapters')
const pages = await source.getChapterDetails(first.mangaId, chapters[0]!.id)
assert.ok(pages.pages.length > 0, 'no pages')

console.log({
    home: Object.fromEntries(home),
    genres: tags[0]!.tags.length,
    title: details.mangaInfo.titles[0],
    status: details.mangaInfo.status,
    chapters: chapters.length,
    firstChapter: chapters[0]!.name,
    pages: pages.pages.length,
})
console.log('Vortex Scans live smoke: OK')
