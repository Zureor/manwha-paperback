# Paperback 0.8 Manhwa Extensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Paperback 0.8 extension repository with two sources, ManhwaClub (manhwaclub.net) and Manhwa18.net, published on GitHub Pages.

**Architecture:** Two standalone sources with no shared base. Each source is one entry file (`<Name>.ts`: `SourceInfo` + `class <Name> extends Source`, network and URL building) and one parser file (`<Name>Parser.ts`: pure functions from cheerio documents or JSON to Paperback objects). Parsers are tested against saved fixtures with `node --test`; the source classes are tested with a fake request manager; ManhwaClub also gets a live smoke script.

**Tech Stack:** TypeScript, `@paperback/types` 0.8.7, `@paperback/toolchain` 0.8.7 (esbuild bundler), `@paperback/runtime-polyfills` 0.8.7 (node `App` global for tests), cheerio 1.0.0-rc.12, Node 26 (`node --test` runs `.ts` directly), GitHub Actions + GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-14-paperback-manhwa-extensions-design.md`

## Global Constraints

- Paperback app is 0.8. Use `@paperback/types` and `@paperback/toolchain` exactly `0.8.7`. Never use 0.9 APIs (`pbconfig.ts`, `ExtensionImpl`, `Application.*`).
- Entry file path must be `src/<Name>/<Name>.ts` and export `<Name>Info` and class `<Name>`; the icon must sit in `src/<Name>/includes/`.
- No `setTimeout`/`setInterval` anywhere in `src/` (the 0.8 runtime has none). `tsconfig.json` keeps `"types": []` so node timer globals are not declared.
- Every model object is created with `App.create*` (`createPartialSourceManga`, `createSourceManga`, `createMangaInfo`, `createChapter`, `createChapterDetails`, `createHomeSection`, `createPagedResults`, `createTag`, `createTagSection`, `createRequest`).
- Relative imports between `.ts` files use the explicit `.ts` extension (needed by node type stripping; allowed by `allowImportingTsExtensions`).
- Chapter `langCode` uses flag emoji: English `'🇬🇧'`, Korean raw `'🇰🇷'`.
- `sortingIndex`: higher means newer.
- Both sources: `contentRating: ContentRating.ADULT`, `language: 'en'`, `intents: MANGA_CHAPTERS | HOMEPAGE_SECTIONS | CLOUDFLARE_BYPASS_REQUIRED`, `hentai: true` on every title.
- User agent on every request: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15`, plus `referer: <site>/`.
- Tag ids are prefixed with their section: `genre.<slug>`, `status.<value>`, `sort.<value>`. The same `genre.<slug>` ids are used on title details so tapping a genre opens that genre's search.
- manhwa18.net cannot be reached from node or curl on the developer PC (TLS reset). Reach it only through the in-app browser pane (`mcp__Claude_Browser__*`).
- Repo name and public visibility are confirmed with the user before anything is pushed to GitHub.
- Git identity is already set repo-locally (noreply email). Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Manhwa18 `created_at` uses 6 fractional digits (`2026-10-08T22:30:34.000000Z`). The iOS JavaScriptCore date parser may reject that, so dates must be trimmed to milliseconds before `new Date` — pinned by the `trimMicros` test in Task 3.
2. ManhwaClub chapter image `src` values start with a space and use `http://`. iOS blocks plain http, so pages must be trimmed and upgraded to https — pinned by the `fixImageUrl` and chapter page tests in Task 1.
3. ManhwaClub title `<h1>` contains an `18+` badge span. The title must not read `18+ A Quiet Cat` — pinned by the details test in Task 1.
4. A Manhwa18 search with text plus genre tags, or with several genres, must still produce a URL the site understands (text wins; first genre and first sort win) — pinned by the `searchUrl` tests in Task 4.
5. A chapter with no images (removed or locked) must show a clear error, not an empty reader — pinned by the `getChapterDetails` rejection tests in Tasks 2 and 4.

---

## File Map

| File | Responsibility |
| --- | --- |
| `package.json` | dependencies (exact 0.8.7 Paperback packages) and scripts |
| `tsconfig.json` | strict typecheck of `src/` only |
| `src/ManhwaClub/ManhwaClubParser.ts` | pure HTML parsers for manhwaclub.net |
| `src/ManhwaClub/ManhwaClub.ts` | `ManhwaClubInfo`, `ManhwaClub` source class, `listUrl`, `searchUrl` |
| `src/ManhwaClub/includes/icon.jpg` | source icon |
| `src/Manhwa18Net/Manhwa18NetParser.ts` | Inertia JSON extraction and parsers for manhwa18.net |
| `src/Manhwa18Net/Manhwa18Net.ts` | `Manhwa18NetInfo`, `Manhwa18Net` source class, `listUrl`, `searchUrl` |
| `src/Manhwa18Net/includes/icon.png` | source icon |
| `test/helpers.ts` | fixture loader and fake request manager shared by tests |
| `test/manhwaclub.test.ts` | ManhwaClub parser and source tests |
| `test/manhwa18net.test.ts` | Manhwa18 parser and source tests |
| `test/live-manhwaclub.ts` | live end-to-end smoke script against manhwaclub.net |
| `test/fixtures/manhwaclub/*.html` | saved pages from manhwaclub.net |
| `test/fixtures/manhwa18net/*.html` | slimmed Inertia pages from manhwa18.net |
| `.github/workflows/deploy.yml` | typecheck, test, bundle, publish to GitHub Pages |
| `README.md` | install URL and dev commands |

---

### Task 1: Project scaffold and ManhwaClub parsers

**Files:**
- Create: `package.json`, `tsconfig.json`, `test/helpers.ts`
- Create: `src/ManhwaClub/ManhwaClubParser.ts`
- Create: `test/manhwaclub.test.ts`
- Create: `test/fixtures/manhwaclub/list.html`, `search.html`, `manga.html`, `chapters.html`, `chapter.html`

**Interfaces:**
- Consumes: nothing.
- Produces (from `src/ManhwaClub/ManhwaClubParser.ts`):
  - `MC_DOMAIN: string` = `'https://manhwaclub.net'`
  - `lastSegment(url: string): string`
  - `fixImageUrl(src: string | undefined): string`
  - `chapterNumber(slug: string): number`
  - `parseDate(text: string, now?: number): Date | undefined`
  - `parseMangaList($: CheerioAPI, itemSelector: string): PartialSourceManga[]`
  - `hasNextPage($: CheerioAPI): boolean`
  - `parseGenreTags($: CheerioAPI): TagSection[]`
  - `parseMangaDetails($: CheerioAPI, mangaId: string): SourceManga`
  - `parsePostId($: CheerioAPI): string`
  - `parseChapters($: CheerioAPI): Chapter[]`
  - `parsePages($: CheerioAPI): string[]`
- Produces (from `test/helpers.ts`): `fixture(site: string, name: string): CheerioAPI`, `fakeRequests(respond: (request: Request) => string, status?: number): FakeRequestManager` where `FakeRequestManager` has `calls: Request[]` and `schedule(request, retry)`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "paperback-manhwa-extensions",
  "version": "1.0.0",
  "private": true,
  "repositoryName": "Manhwa Extensions",
  "description": "Paperback 0.8 sources for ManhwaClub and Manhwa18.net",
  "license": "GPL-3.0-or-later",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test test/*.test.ts",
    "smoke": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON test/live-manhwaclub.ts",
    "bundle": "paperback bundle",
    "serve": "paperback serve"
  },
  "devDependencies": {
    "@paperback/runtime-polyfills": "0.8.7",
    "@paperback/toolchain": "0.8.7",
    "@paperback/types": "0.8.7",
    "cheerio": "1.0.0-rc.12",
    "typescript": "5.9.3"
  }
}
```

Do not add `"type": "module"`: the toolchain `require()`s the bundled IIFE files, which breaks under an ESM package.

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "strict": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "types": []
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install dependencies**

Run: `npm install --no-audit --no-fund`
Expected: `node_modules/` and `package-lock.json` created, no errors. (Install-script warnings for `yarn` are harmless.)

- [ ] **Step 4: Save ManhwaClub fixtures**

Run (Bash):

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
F=test/fixtures/manhwaclub; mkdir -p $F
curl -s -A "$UA" "https://manhwaclub.net/manga/?m_orderby=latest" -o $F/list.html
curl -s -A "$UA" "https://manhwaclub.net/?s=secret&post_type=wp-manga" -o $F/search.html
curl -s -A "$UA" "https://manhwaclub.net/manga/a-quiet-cat/" -o $F/manga.html
curl -s -A "$UA" -X POST -d "action=manga_get_chapters&manga=2494" "https://manhwaclub.net/wp-admin/admin-ajax.php" -o $F/chapters.html
curl -s -A "$UA" "https://manhwaclub.net/manga/a-quiet-cat/chapter-25-raw/" -o $F/chapter.html
wc -c $F/*
```

Expected: five non-empty files (each over 10 KB except `chapters.html`, which is around 17 KB).

- [ ] **Step 5: Create `test/helpers.ts`**

```ts
import { readFileSync } from 'node:fs'
import * as cheerio from 'cheerio'

export function fixture(site: string, name: string) {
    return cheerio.load(readFileSync(new URL(`./fixtures/${site}/${name}`, import.meta.url), 'utf8'))
}

// Stands in for App.createRequestManager: records requests and answers from a callback.
export function fakeRequests(respond: (request: any) => string, status = 200) {
    const calls: any[] = []
    return {
        calls,
        requestsPerSecond: 3,
        requestTimeout: 20000,
        getDefaultUserAgent: async () => '',
        schedule: async (request: any) => {
            calls.push(request)
            return { data: respond(request), status, headers: {}, request }
        },
    }
}
```

- [ ] **Step 6: Write the failing parser tests**

Create `test/manhwaclub.test.ts`:

```ts
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
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/ManhwaClub/ManhwaClubParser.ts'`.

- [ ] **Step 8: Write the parser**

Create `src/ManhwaClub/ManhwaClubParser.ts`:

```ts
import type { Cheerio, CheerioAPI, Element } from 'cheerio'
import type { Chapter, PartialSourceManga, SourceManga, TagSection } from '@paperback/types'

export const MC_DOMAIN = 'https://manhwaclub.net'

const UNIT_MS: Record<string, number> = {
    second: 1e3, min: 6e4, minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5, month: 2592e6, year: 31536e6,
}

// https://manhwaclub.net/manga/a-quiet-cat/ -> a-quiet-cat
export function lastSegment(url: string): string {
    return url.replace(/\/+$/, '').split('/').pop() ?? ''
}

// Madara emits ' http://...' for chapter images; iOS needs https.
export function fixImageUrl(src: string | undefined): string {
    const url = (src ?? '').trim()
    if (url.startsWith('//')) return 'https:' + url
    return url.replace(/^http:\/\//, 'https://')
}

function imageOf(img: Cheerio<Element>): string {
    return fixImageUrl(img.attr('data-src') ?? img.attr('data-lazy-src') ?? img.attr('src'))
}

const clean = (text: string) => text.replace(/\s+/g, ' ').trim()

// chapter-125-5 -> 125.5, chapter-26-raw -> 26
export function chapterNumber(slug: string): number {
    const match = /(?:chapter|chap|ch)-(\d+)(?:-(\d+))?/.exec(slug)
    if (!match) return 0
    return Number(match[2] ? `${match[1]}.${match[2]}` : match[1])
}

export function parseDate(text: string, now = Date.now()): Date | undefined {
    const relative = /(\d+|an?)\s*(second|min|minute|hour|day|week|month|year)s?\s*ago/i.exec(text)
    if (relative) {
        const count = /^an?$/i.test(relative[1]!) ? 1 : Number(relative[1])
        return new Date(now - count * UNIT_MS[relative[2]!.toLowerCase()]!)
    }
    const date = new Date(text.trim())
    return text.trim() && !isNaN(date.getTime()) ? date : undefined
}

// itemSelector: '.page-item-detail' on /manga/ listings, '.c-tabs-item__content' on search pages.
export function parseMangaList($: CheerioAPI, itemSelector: string): PartialSourceManga[] {
    return $(itemSelector).toArray()
        .map(el => {
            const item = $(el)
            const link = item.find('.post-title a').first()
            const latest = clean(item.find('.chapter a').first().text())
            return App.createPartialSourceManga({
                mangaId: lastSegment(link.attr('href') ?? ''),
                title: clean(link.text()),
                image: imageOf(item.find('img').first()),
                subtitle: latest || undefined,
            })
        })
        .filter(manga => manga.mangaId && manga.title)
}

// Madara's "Older Posts" link is the next page.
export function hasNextPage($: CheerioAPI): boolean {
    return $('.nav-previous a').length > 0
}

export function parseGenreTags($: CheerioAPI): TagSection[] {
    const genres = $('input[name="genre[]"]').toArray()
        .map(el => {
            const value = $(el).attr('value') ?? ''
            const label = clean($(`label[for="${$(el).attr('id') ?? ''}"]`).text())
            return App.createTag({ id: `genre.${value}`, label: label || value })
        })
        .filter(tag => tag.id !== 'genre.')
    const status = [['on-going', 'Ongoing'], ['end', 'Completed'], ['canceled', 'Canceled'], ['on-hold', 'On Hold']]
    const sort = [['latest', 'Latest'], ['trending', 'Trending'], ['views', 'Most Viewed'], ['new-manga', 'New'], ['alphabet', 'A-Z'], ['rating', 'Rating']]
    return [
        App.createTagSection({ id: 'genre', label: 'Genres', tags: genres }),
        App.createTagSection({ id: 'status', label: 'Status', tags: status.map(([id, label]) => App.createTag({ id: `status.${id}`, label: label! })) }),
        App.createTagSection({ id: 'sort', label: 'Sort (first one wins)', tags: sort.map(([id, label]) => App.createTag({ id: `sort.${id}`, label: label! })) }),
    ]
}

function mapStatus(text: string): string {
    if (/on-?going/i.test(text)) return 'Ongoing'
    if (/completed|end/i.test(text)) return 'Completed'
    if (/hold/i.test(text)) return 'Hiatus'
    if (/cancel/i.test(text)) return 'Cancelled'
    return 'Unknown'
}

export function parseMangaDetails($: CheerioAPI, mangaId: string): SourceManga {
    $('.post-title h1 .manga-title-badges').remove()
    const title = clean($('.post-title h1').text())
    const row = (heading: string) => clean(
        $('.post-content_item')
            .filter((_, el) => clean($(el).find('.summary-heading').text()).toLowerCase().startsWith(heading))
            .find('.summary-content')
            .text(),
    )
    const person = (heading: string) => {
        const value = row(heading)
        return /^updating$/i.test(value) ? '' : value
    }
    const altTitles = row('alternative').split(/\s*[\/;]\s*/).filter(Boolean)
    const paragraphs = $('.description-summary p').toArray().map(p => clean($(p).text())).filter(Boolean)
    const genres = $('.genres-content a').toArray().map(a => App.createTag({
        id: `genre.${lastSegment($(a).attr('href') ?? '')}`,
        label: clean($(a).text()),
    }))
    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles: [...new Set([title, ...altTitles])],
            image: imageOf($('.summary_image img').first()),
            desc: paragraphs.length ? paragraphs.join('\n\n') : clean($('.description-summary').text()),
            author: person('author'),
            artist: person('artist'),
            status: mapStatus(row('status')),
            hentai: true,
            tags: [App.createTagSection({ id: 'genre', label: 'Genres', tags: genres })],
        }),
    })
}

// The numeric WordPress id that admin-ajax needs to list chapters.
export function parsePostId($: CheerioAPI): string {
    return $('#manga-chapters-holder').attr('data-id') ?? ''
}

export function parseChapters($: CheerioAPI): Chapter[] {
    const items = $('li.wp-manga-chapter').toArray()
    return items
        .map((el, index) => {
            const link = $(el).find('a').first()
            const id = lastSegment(link.attr('href') ?? '')
            const dateText = $(el).find('.chapter-release-date i').text()
                || $(el).find('.chapter-release-date a').attr('title')
                || ''
            return App.createChapter({
                id,
                name: clean(link.text()),
                chapNum: chapterNumber(id),
                langCode: id.endsWith('-raw') ? '🇰🇷' : '🇬🇧',
                time: parseDate(dateText),
                sortingIndex: items.length - index,
            })
        })
        .filter(chapter => chapter.id)
}

export function parsePages($: CheerioAPI): string[] {
    return $('img.wp-manga-chapter-img').toArray().map(el => imageOf($(el))).filter(Boolean)
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test`
Expected: all 11 tests in `test/manhwaclub.test.ts` PASS.

If a fixture-based assertion fails because the site content changed since the plan was written (for example the genre count is no longer 27, or the list page shows a different item count), open the fixture, confirm the parser output is correct for what the page actually contains, and update only the expected number in the test.

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json test/helpers.ts test/manhwaclub.test.ts test/fixtures/manhwaclub src/ManhwaClub/ManhwaClubParser.ts
git commit -m "feat: add ManhwaClub parsers with fixture tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: ManhwaClub source class, live smoke test, bundle

**Files:**
- Create: `src/ManhwaClub/ManhwaClub.ts`
- Create: `src/ManhwaClub/includes/icon.jpg`
- Create: `test/live-manhwaclub.ts`
- Modify: `test/manhwaclub.test.ts` (append source tests)

**Interfaces:**
- Consumes: everything Task 1 exports from `ManhwaClubParser.ts`; `fixture`, `fakeRequests` from `test/helpers.ts`.
- Produces (from `src/ManhwaClub/ManhwaClub.ts`):
  - `ManhwaClubInfo: SourceInfo`
  - `class ManhwaClub extends Source` with `requestManager`, `getHomePageSections`, `getViewMoreItems(id, metadata: { page?: number } | undefined)`, `getSearchResults(query, metadata: { page?: number } | undefined)`, `getSearchTags`, `supportsTagExclusion`, `getMangaShareUrl`, `getMangaDetails`, `getChapters`, `getChapterDetails`, `getCloudflareBypassRequestAsync`
  - `listUrl(order: string, page: number): string`
  - `searchUrl(query: SearchRequest, page: number): string`

- [ ] **Step 1: Download the icon**

Run (Bash):

```bash
curl -s -A "Mozilla/5.0" "https://manhwaclub.net/wp-content/uploads/2025/11/800157236aa9e6f7bfb8.jpg" -o src/ManhwaClub/includes/icon.jpg && file src/ManhwaClub/includes/icon.jpg
```

Expected: `JPEG image data`. If `file` is not available, check the size is over 1 KB with `wc -c`.

- [ ] **Step 2: Append the failing source tests**

Append to `test/manhwaclub.test.ts` (add the two imports at the top of the file with the others):

```ts
import { fakeRequests } from './helpers.ts'
import { ManhwaClub, listUrl, searchUrl } from '../src/ManhwaClub/ManhwaClub.ts'
```

```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/ManhwaClub/ManhwaClub.ts'`.

- [ ] **Step 4: Write the source class**

Create `src/ManhwaClub/ManhwaClub.ts`:

```ts
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
    type SourceInterceptor,
    type SourceManga,
    type TagSection,
} from '@paperback/types'
import type { CheerioAPI } from 'cheerio'
import {
    MC_DOMAIN, hasNextPage, parseChapters, parseGenreTags, parseMangaDetails, parseMangaList, parsePages, parsePostId,
} from './ManhwaClubParser.ts'

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

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

class ManhwaClubInterceptor implements SourceInterceptor {
    async interceptRequest(request: Request): Promise<Request> {
        // Reassign the whole object: 0.8 does not see in-place header edits.
        request.headers = { ...(request.headers ?? {}), 'user-agent': USER_AGENT, referer: `${MC_DOMAIN}/` }
        return request
    }

    async interceptResponse(response: Response): Promise<Response> {
        return response
    }
}

type PageMetadata = { page?: number } | undefined

export class ManhwaClub extends Source {
    requestManager = App.createRequestManager({
        requestsPerSecond: 3,
        requestTimeout: 20000,
        interceptor: new ManhwaClubInterceptor(),
    })

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
            const section = App.createHomeSection({ id: info.id, title: info.title, type: info.type, containsMoreItems: true })
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
        return App.createRequest({
            url: `${MC_DOMAIN}/`,
            method: 'GET',
            headers: { 'user-agent': USER_AGENT, referer: `${MC_DOMAIN}/` },
        })
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all ManhwaClub tests PASS (11 parser + 7 source).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exit 0. If TypeScript rejects the `metadata: PageMetadata` parameter on an override, change that parameter's type to `any` (the 0.8 base class declares it as `any`) and keep the `?.page ?? 1` read.

- [ ] **Step 7: Write the live smoke script**

Create `test/live-manhwaclub.ts`:

```ts
// Live end-to-end check against manhwaclub.net through the real 0.8 runtime polyfills.
import '@paperback/runtime-polyfills'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'
import { ManhwaClub } from '../src/ManhwaClub/ManhwaClub.ts'

const source = new ManhwaClub(cheerio as any)

const home = new Map<string, number>()
await source.getHomePageSections(section => home.set(section.id, section.items.length))
for (const [id, count] of home) assert.ok(count > 0, `home section ${id} is empty`)

const more = await source.getViewMoreItems('latest', { page: 2 })
assert.ok(more.results.length > 0, 'view more page 2 is empty')

const tags = await source.getSearchTags()
assert.ok(tags[0]!.tags.length > 0, 'no genre tags')

const genre = await source.getSearchResults({ includedTags: [{ id: 'genre.romance', label: 'Romance' }], excludedTags: [], parameters: {} }, undefined)
assert.ok(genre.results.length > 0, 'genre search is empty')

const search = await source.getSearchResults({ title: 'secret', includedTags: [], excludedTags: [], parameters: {} }, undefined)
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
    firstChapter: `${chapters[0]!.name} ${chapters[0]!.langCode}`,
    pages: pages.pages.length,
})
console.log('ManhwaClub live smoke: OK')
```

- [ ] **Step 8: Run the live smoke script**

Run: `npm run smoke`
Expected: a summary object with four non-zero home sections, then `ManhwaClub live smoke: OK`.

- [ ] **Step 9: Bundle**

Run: `npx paperback bundle && node -e "console.log(require('./bundles/versioning.json').sources.map(s => s.id + ' ' + s.version + ' intents=' + s.intents))"`
Expected: `[ 'ManhwaClub 1.0.0 intents=21' ]` (1 + 4 + 16), and `bundles/ManhwaClub/includes/icon.jpg` exists.

- [ ] **Step 10: Check the bundle uses no timers**

Run: `grep -c "setTimeout\|setInterval" bundles/ManhwaClub/source.js || true`
Expected: `0`.

- [ ] **Step 11: Commit**

```bash
git add src/ManhwaClub test/manhwaclub.test.ts test/live-manhwaclub.ts
git commit -m "feat: add ManhwaClub source

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Manhwa18.net parsers

**Files:**
- Create: `src/Manhwa18Net/Manhwa18NetParser.ts`
- Create: `test/manhwa18net.test.ts`
- Create: `test/fixtures/manhwa18net/list.html`, `last.html`, `search.html`, `manga.html`, `chapter.html`

**Interfaces:**
- Consumes: `fixture` from `test/helpers.ts`.
- Produces (from `src/Manhwa18Net/Manhwa18NetParser.ts`):
  - `M18_DOMAIN: string` = `'https://manhwa18.net'`
  - types `MangaJson`, `Paginated`, `ChapterJson`, `InertiaProps`
  - `parseProps($: CheerioAPI, url: string): InertiaProps`
  - `parseMangaList(list: Paginated | undefined): PartialSourceManga[]`
  - `hasNextPage(list: Paginated | undefined): boolean`
  - `parseGenreTags(genres: { name: string; slug: string }[] | undefined): TagSection[]`
  - `htmlToText($: CheerioAPI, html: string): string`
  - `parseMangaDetails($: CheerioAPI, manga: MangaJson): SourceManga`
  - `chapterNumber(name: string): number | undefined`
  - `trimMicros(iso: string): string`
  - `parseChapters(chapters: ChapterJson[] | undefined): Chapter[]`
  - `parsePages($: CheerioAPI, chapterContent: string): string[]`

- [ ] **Step 1: Capture slimmed fixtures through the browser pane**

manhwa18.net resets plain TLS connections from this PC, so capture through the in-app browser. Navigate the browser pane to `https://manhwa18.net/manga-list` (`mcp__Claude_Browser__navigate`), then run this with `mcp__Claude_Browser__javascript_tool`:

```js
const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
async function page(u) {
  const html = await (await fetch(u)).text()
  const ta = document.createElement('textarea')
  ta.innerHTML = html.match(/data-page="([^"]*)"/)[1]
  return JSON.parse(ta.value)
}
const KEEP = ['paginate', 'mangas', 'genres', 'manga', 'chapters', 'chapterContent']
const MANGA_KEEP = ['name', 'slug', 'other_name', 'cover_url', 'thumb_url', 'pilot', 'status_id', 'genres', 'artists', 'latest_chapter']
const slimManga = m => Object.fromEntries(Object.entries(m).filter(([k]) => MANGA_KEEP.includes(k)))
function slim(p, edit) {
  const props = Object.fromEntries(Object.entries(p.props).filter(([k]) => KEEP.includes(k)))
  edit(props)
  return `<!doctype html><html><body><div id="app" data-page="${esc(JSON.stringify({ component: p.component, props, url: p.url }))}"></div></body></html>`
}
const firstThree = list => { list.data = list.data.slice(0, 3).map(slimManga) }
;({
  'list.html': slim(await page('/manga-list?sort=update&page=1'), p => firstThree(p.paginate)),
  'last.html': slim(await page('/manga-list?sort=update&page=9999'), p => {}),
  'search.html': slim(await page('/tim-kiem?q=secret'), p => firstThree(p.mangas)),
  'manga.html': slim(await page('/manga/secret-class'), p => { p.manga = slimManga(p.manga); p.chapters = [...p.chapters.slice(0, 3), p.chapters.at(-1)] }),
  'chapter.html': slim(await page('/manga/secret-class/chapter-320'), p => {}),
})
```

Write each returned string, exactly as returned, to `test/fixtures/manhwa18net/<key>` with the Write tool.

Expected: five files; `manga.html` is under 10 KB; `last.html` contains `&quot;next_page_url&quot;:null`.

- [ ] **Step 2: Write the failing parser tests**

Create `test/manhwa18net.test.ts`:

```ts
import '@paperback/runtime-polyfills'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'
import { fixture } from './helpers.ts'
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

test('list: slug ids, cover_url images, latest chapter subtitle, paging', () => {
    const list = props('list.html').paginate
    const items = parseMangaList(list)
    assert.equal(items.length, 3)
    for (const item of items) {
        assert.match(item.mangaId, /^[a-z0-9-]+$/)
        assert.ok(item.title.length > 0)
        assert.match(item.image, /^https:\/\/manhwa18\.net\/storage\/images\/raw\//)
        assert.match(item.subtitle ?? '', /^Chap/)
    }
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
    assert.ok(pages.length > 0)
    for (const p of pages) assert.match(p, /^https:\/\/min\.manhwa18\.net\//)
    assert.deepEqual(parsePages($, '<p>no images</p>'), [])
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/Manhwa18Net/Manhwa18NetParser.ts'` (ManhwaClub tests still pass).

- [ ] **Step 4: Write the parser**

Create `src/Manhwa18Net/Manhwa18NetParser.ts`:

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all ManhwaClub tests and all 10 Manhwa18 parser tests PASS.

If a fixture-based assertion fails because the captured content differs from what was verified on 2026-10-14 (for example `secret-class` gained a chapter so `chapters[0]` is now `chapter-321`, or the genre count is not 73), check the fixture, confirm the parser output matches the fixture, and update only that expected value.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/Manhwa18Net/Manhwa18NetParser.ts test/manhwa18net.test.ts test/fixtures/manhwa18net
git commit -m "feat: add Manhwa18.net parsers with fixture tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Manhwa18.net source class and bundle

**Files:**
- Create: `src/Manhwa18Net/Manhwa18Net.ts`
- Create: `src/Manhwa18Net/includes/icon.png`
- Modify: `test/manhwa18net.test.ts` (append source tests)

**Interfaces:**
- Consumes: everything Task 3 exports from `Manhwa18NetParser.ts`; `fixture`, `fakeRequests` from `test/helpers.ts`.
- Produces (from `src/Manhwa18Net/Manhwa18Net.ts`):
  - `Manhwa18NetInfo: SourceInfo`
  - `class Manhwa18Net extends Source` with the same public methods as `ManhwaClub`
  - `listUrl(sort: string, page: number): string`
  - `searchUrl(query: SearchRequest, page: number): string`

- [ ] **Step 1: Save the icon through the browser pane**

With the browser pane on `https://manhwa18.net/`, run with `mcp__Claude_Browser__javascript_tool`:

```js
const bytes = new Uint8Array(await (await fetch('/icons/icon-180.png')).arrayBuffer())
let binary = ''
for (const b of bytes) binary += String.fromCharCode(b)
btoa(binary)
```

Write the returned base64 string to `<scratchpad>/m18-icon.b64` with the Write tool, then run (Bash):

```bash
mkdir -p src/Manhwa18Net/includes && base64 -d "<scratchpad>/m18-icon.b64" > src/Manhwa18Net/includes/icon.png && head -c 8 src/Manhwa18Net/includes/icon.png | od -An -tx1
```

Expected: ` 89 50 4e 47 0d 0a 1a 0a` (PNG signature). `<scratchpad>` is the session scratchpad directory.

- [ ] **Step 2: Append the failing source tests**

Add these imports at the top of `test/manhwa18net.test.ts`:

```ts
import { fakeRequests } from './helpers.ts'
import { Manhwa18Net, listUrl, searchUrl } from '../src/Manhwa18Net/Manhwa18Net.ts'
```

Append:

```ts
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
    assert.ok(details.pages.length > 0)
    assert.equal(requests.calls[0].url, 'https://manhwa18.net/manga/secret-class/chapter-320')
    source.requestManager = fakeRequests(() => '<div id="app" data-page="{&quot;props&quot;:{&quot;chapterContent&quot;:&quot;&quot;}}"></div>')
    await assert.rejects(source.getChapterDetails('secret-class', 'chapter-1'), /Manhwa18: no pages found/)
})

test('a Cloudflare block tells the user to run the bypass', async () => {
    const source = new Manhwa18Net(cheerio)
    source.requestManager = fakeRequests(() => 'Just a moment...', 503)
    await assert.rejects(source.getMangaDetails('secret-class'), /Cloudflare/)
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/Manhwa18Net/Manhwa18Net.ts'`.

- [ ] **Step 4: Write the source class**

Create `src/Manhwa18Net/Manhwa18Net.ts`:

```ts
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
    type SourceInterceptor,
    type SourceManga,
    type TagSection,
} from '@paperback/types'
import type { CheerioAPI } from 'cheerio'
import {
    M18_DOMAIN, hasNextPage, parseChapters, parseGenreTags, parseMangaDetails, parseMangaList, parsePages, parseProps,
    type InertiaProps,
} from './Manhwa18NetParser.ts'

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

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

class Manhwa18NetInterceptor implements SourceInterceptor {
    async interceptRequest(request: Request): Promise<Request> {
        // Reassign the whole object: 0.8 does not see in-place header edits.
        request.headers = { ...(request.headers ?? {}), 'user-agent': USER_AGENT, referer: `${M18_DOMAIN}/` }
        return request
    }

    async interceptResponse(response: Response): Promise<Response> {
        return response
    }
}

type PageMetadata = { page?: number } | undefined

export class Manhwa18Net extends Source {
    requestManager = App.createRequestManager({
        requestsPerSecond: 3,
        requestTimeout: 20000,
        interceptor: new Manhwa18NetInterceptor(),
    })

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
            const section = App.createHomeSection({ id: info.id, title: info.title, type: info.type, containsMoreItems: true })
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
        return App.createRequest({
            url: `${M18_DOMAIN}/`,
            method: 'GET',
            headers: { 'user-agent': USER_AGENT, referer: `${M18_DOMAIN}/` },
        })
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: every test in both files PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exit 0. Apply the same `metadata: any` fallback as Task 2 Step 6 if TypeScript rejects the override parameter type.

- [ ] **Step 7: Bundle both sources**

Run: `npx paperback bundle && node -e "console.log(require('./bundles/versioning.json').sources.map(s => s.id + ' ' + s.version + ' intents=' + s.intents))" && grep -c "setTimeout\|setInterval" bundles/Manhwa18Net/source.js || true`
Expected: both `ManhwaClub 1.0.0 intents=21` and `Manhwa18Net 1.0.0 intents=21`, then `0`.

- [ ] **Step 8: Smoke-test the bundled Manhwa18 source in the browser pane**

The browser can reach manhwa18.net, so run the real bundle there with a minimal `App` shim. Read `bundles/Manhwa18Net/source.js`, then with the browser pane on `https://manhwa18.net/manga-list` run with `mcp__Claude_Browser__javascript_tool` (paste the file's contents where marked):

```js
const { load } = await import('https://cdn.jsdelivr.net/npm/cheerio@1.0.0-rc.12/+esm')
globalThis.App = new Proxy({
  createRequestManager: info => ({
    schedule: async request => {
      const r = await fetch(request.url, { method: request.method })
      return { data: await r.text(), status: r.status, headers: {}, request }
    },
  }),
}, { get: (target, key) => target[key] ?? (props => props) })
const module = { exports: {} }
;(function (exports, module) {
  /* PASTE bundles/Manhwa18Net/source.js HERE */
}).call(globalThis, module.exports, module)
const source = new globalThis.Sources.Manhwa18Net({ load })
const home = []; await source.getHomePageSections(s => home.push(s.id + ':' + s.items.length))
const search = await source.getSearchResults({ title: 'secret', includedTags: [], excludedTags: [], parameters: {} })
const genre = await source.getSearchResults({ includedTags: [{ id: 'genre.adult' }], excludedTags: [], parameters: {} })
const id = search.results[0].mangaId
const details = await source.getMangaDetails(id)
const chapters = await source.getChapters(id)
const pages = await source.getChapterDetails(id, chapters[0].id)
;({ home, search: search.results.length, genre: genre.results.length, title: details.mangaInfo.titles[0], chapters: chapters.length, firstDate: String(chapters[0].time), pages: pages.pages.length })
```

Expected: four `home` entries ending in non-zero counts, non-zero `search`, `genre`, `chapters` and `pages`, a real `firstDate`. The interceptor is skipped here (the browser sets its own headers); it is covered on the device.

If the jsDelivr import is blocked, skip this step and rely on the device check in Task 5.

- [ ] **Step 9: Commit**

```bash
git add src/Manhwa18Net test/manhwa18net.test.ts
git commit -m "feat: add Manhwa18.net source

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: GitHub Pages deployment and device check

**Files:**
- Create: `.github/workflows/deploy.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: `npm run typecheck`, `npm test`, `npx paperback bundle` from Tasks 1–4.
- Produces: the Paperback repo URL `https://zureor.github.io/<repo>/`.

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npx paperback bundle
      - uses: actions/upload-pages-artifact@v4
        with:
          path: bundles
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Create `README.md`**

```markdown
# Manhwa Extensions for Paperback 0.8

Sources: **ManhwaClub** (manhwaclub.net) and **Manhwa18.net** (manhwa18.net). Both are 18+.

## Install

In Paperback 0.8: Settings → External Sources → add repository:

    https://zureor.github.io/REPO_NAME/

Both sources are rated Adult, so adult content must be enabled in Paperback to see them.

## Development

    npm install
    npm test          # parser and source tests (fixtures, offline)
    npm run smoke     # live check against manhwaclub.net
    npm run bundle    # build bundles/
    npm run serve     # serve bundles/ on your LAN for testing on a device
```

Replace `REPO_NAME` with the repository name confirmed in Step 4.

- [ ] **Step 3: Verify the full pipeline locally**

Run: `npm run typecheck && npm test && npx paperback bundle`
Expected: exit 0; `bundles/index.html`, `bundles/versioning.json`, `bundles/ManhwaClub/source.js`, `bundles/Manhwa18Net/source.js` all exist.

- [ ] **Step 4: Confirm the repository with the user (gate)**

Ask the user: create `Zureor/paperback-manhwa-extensions` as a **public** repository (GitHub Pages on a free account needs a public repo)? Do not continue until the user confirms a name and public visibility. Then replace `REPO_NAME` in `README.md` with that name.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml README.md
git commit -m "ci: bundle and publish to GitHub Pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Create the repo, enable Pages, push**

Run (with the confirmed name in place of `paperback-manhwa-extensions`):

```bash
gh repo create Zureor/paperback-manhwa-extensions --public --source . --remote origin
gh api -X POST repos/Zureor/paperback-manhwa-extensions/pages -f build_type=workflow
git push -u origin main
```

Expected: repo created, Pages API returns JSON with `"build_type": "workflow"`, push succeeds.

- [ ] **Step 7: Watch the deploy run once**

Run: `gh run watch --repo Zureor/paperback-manhwa-extensions --exit-status $(gh run list --repo Zureor/paperback-manhwa-extensions --limit 1 --json databaseId --jq '.[0].databaseId')`
Expected: both `build` and `deploy` jobs succeed. The run appears a few seconds after the push; if `gh run list` returns nothing yet, run the command again. If `build` fails, read the log with `gh run view --log-failed` and fix the cause before retrying.

- [ ] **Step 8: Verify the published repo**

Run: `curl -s https://zureor.github.io/paperback-manhwa-extensions/versioning.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).sources.map(x=>x.id)))"`
Expected: `[ 'ManhwaClub', 'Manhwa18Net' ]` (order may differ). GitHub Pages can take a minute after the deploy job finishes.

- [ ] **Step 9: Device check (user)**

Give the user the repo URL and this checklist for Paperback 0.8, for each source:

1. Settings → External Sources → add `https://zureor.github.io/<repo>/`, install both sources.
2. Discover tab: all four home rows load; "View more" loads a second page.
3. Search "secret": results appear.
4. Search filters: pick one genre, no text: results appear.
5. Open a title: cover, synopsis, genres and status show; tapping a genre opens that genre.
6. Chapter list: dates show; on ManhwaClub, raw chapters carry the Korean flag.
7. Open a chapter: pages load.
8. Add a title to the library; library refresh completes without errors.

If Manhwa18.net fails with connection errors on home Wi-Fi while ManhwaClub works, that is the ISP TLS reset from the spec's Known Risks; enable Cloudflare 1.1.1.1/WARP or encrypted DNS on the device and retry.
