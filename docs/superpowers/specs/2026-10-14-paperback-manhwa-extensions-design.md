# Paperback 0.8 Extensions: ManhwaClub and Manhwa18.net

Date: 2026-10-14
Status: Approved design, pending spec review

## Goal

One Paperback 0.8 extension repository with two sources, installed into the
user's Paperback 0.8 app from a GitHub Pages URL. Both sources must support
home page rows, search with genre/sort/status filters, title details, chapter
lists, and reading. Library update checks come for free: Paperback 0.8 calls
`getChapters` for library titles itself.

Success: both sources appear in the app after adding the repo URL, and for each
source the home rows load, search and a genre filter return results, a title's
details and chapter list show, and a chapter's pages render.

## Constraints

- Paperback app version is **0.8**. 0.9 bundles (`@paperback/types` 1.x,
  `pbconfig.ts`) do not load. Use `@paperback/types` and
  `@paperback/toolchain` **0.8.7**.
- 0.8 runtime has no `setTimeout`/`setInterval`. Throttling is done by the
  request manager's `requestsPerSecond`.
- Requests go through Apple's network stack, so the user agent should be a
  Safari one.
- manhwa18.net is reachable from the user's PC browser (ECH) but plain-SNI
  clients (curl, node) get a TLS reset. Live verification of manhwa18.net is
  done through the in-app browser pane; node-based tests use captured fixtures.
- GitHub Pages on a free account requires a public repository. Repo name and
  visibility are confirmed with the user before any push.

## Approach

Two standalone sources with no shared base class. The sites share no
structure (one is WordPress Madara HTML, the other is Inertia.js JSON), so a
common layer would only hold a few one-line helpers. A generic Madara base can
be extracted later if more Madara sites are added.

Rejected: porting a generic Madara base to 0.8 (about 5x the code for one
site), and forking a third-party 0.9-on-0.8 compatibility layer (1000+ lines
of someone else's abstraction for two simple sources).

## Repository layout

```
package.json                    @paperback/toolchain 0.8.7, @paperback/types 0.8.7, typescript, cheerio (dev, for tests)
tsconfig.json
.github/workflows/deploy.yml    on push to main: npm ci, paperback bundle, publish bundles/ to GitHub Pages
src/ManhwaClub/ManhwaClub.ts          exports ManhwaClubInfo (SourceInfo) and class ManhwaClub extends Source
src/ManhwaClub/ManhwaClubParser.ts    pure functions: (cheerio $) -> Paperback objects
src/ManhwaClub/includes/icon.png
src/Manhwa18Net/Manhwa18Net.ts
src/Manhwa18Net/Manhwa18NetParser.ts
src/Manhwa18Net/includes/icon.png
test/parsers.test.ts            node --test, fixture based
test/fixtures/                  saved HTML/JSON from both sites
```

Icons come from each site's favicon. Parsers are pure functions so they can be
tested without the Paperback runtime.

## Source info (both sources)

- `contentRating: ContentRating.ADULT`, `language: 'en'`
- `intents: MANGA_CHAPTERS | HOMEPAGE_SECTIONS | CLOUDFLARE_BYPASS_REQUIRED`
- `getCloudflareBypassRequestAsync()` returns a GET of the site root. Both
  sites are behind Cloudflare; without this a challenge would make a source
  unusable until a rebuild.
- Request manager: `requestsPerSecond` around 3, `requestTimeout` 20000.
- Interceptor sets a Mac Safari `user-agent` and `referer: <site>/` on every
  request, including image requests.
- `getMangaShareUrl(mangaId)` returns `<site>/manga/<mangaId>`.
- On a 403/503 response with a Cloudflare challenge, throw an error telling the
  user to run the Cloudflare bypass from the source settings.

## ManhwaClub (manhwaclub.net) — verified live 2026-10-14

WordPress Madara theme.

| Item | Value |
| --- | --- |
| mangaId | URL slug, e.g. `a-quiet-cat` |
| chapterId | chapter slug, e.g. `chapter-26-raw` |
| Home rows | Latest Updates `m_orderby=latest`, Trending `trending`, Most Viewed `views`, New `new-manga` |
| Home/view-more URL | `/manga/page/<N>/?m_orderby=<order>` (page 1: `/manga/?m_orderby=<order>`) |
| Home list items | `.page-item-detail` (link `.item-thumb a` / `h3 a`, image `img` data-src or src) |
| Search URL | `/page/<N>/?s=<q>&post_type=wp-manga` plus `genre[]=<slug>`, `status[]=<x>`, `m_orderby=<x>` |
| Search items | `.c-tabs-item__content` |
| Paging | more pages while the page has a `.nav-previous` link (Madara's "older posts" link) |
| Genre tags | scraped from `input[name="genre[]"]` checkboxes on `/?s=&post_type=wp-manga` (27 genres); tag id = value (genre slug), title = its label |
| Status tags | static: `on-going`, `end`, `canceled`, `on-hold` |
| Sort tags | static: latest, trending, views, new-manga, alphabet, rating |
| Details page | `/manga/<slug>/` — `.post-title h1`, `.summary_image img`, `.description-summary`, `.genres-content a`, `.author-content a`, `.artist-content a`, status and alternative-name rows from `.post-content_item` |
| Chapter list | read numeric id from `#manga-chapters-holder[data-id]` on the details page, then `POST /wp-admin/admin-ajax.php` with `action=manga_get_chapters&manga=<id>`; items `li.wp-manga-chapter` |
| Chapter number | parsed from slug: `chapter-125-5` → 125.5 |
| Chapter language | slug ending `-raw` → `langCode: 'ko'`, else `'en'`. Both versions are kept. |
| Chapter date | `.chapter-release-date i`: absolute date (`October 3, 2026`) or relative (`3 days ago`, via `convertTime`) |
| Pages | `/manga/<slug>/<chapterId>/` — `img.wp-manga-chapter-img`, `data-src` then `src`, trimmed |

## Manhwa18.net — verified live 2026-10-14 via browser pane

Inertia.js app. Every page is fetched as HTML; the data is the JSON in
`#app[data-page]` (HTML-entity decoded by cheerio's `attr`), and the source
reads its `props`.

| Item | Value |
| --- | --- |
| mangaId | slug, e.g. `secret-class` |
| chapterId | chapter slug, e.g. `chapter-320` |
| Home rows | Latest Updates `sort=update`, Most Viewed `top`, Newest `new`, Most Liked `like` |
| Home/view-more URL | `/manga-list?sort=<sort>&page=<N>` → `props.paginate` |
| List item fields | `name`, `slug`, `cover_url` (fallback `thumb_url`), `latest_chapter.name` as subtitle |
| Paging | next page exists while `paginate.next_page_url` is not null |
| Text search | `/tim-kiem?q=<q>&page=<N>` → `props.mangas` (same paginate shape). Filters are ignored when a text query is present (the site does not combine them). |
| Filter search (no text) | with genre: `/genre/<slug>?sort=<s>&page=<N>&<status>=1`; without genre: `/manga-list?sort=<s>&page=<N>&<status>=1` → `props.paginate`. Only the first selected genre is used. |
| Status params | `Ongoing=1`, `Onhold=1`, `completed=1` |
| Genre tags | `props.genres` from `/tim-kiem?q=` (73 genres, `{id, name, slug}`); tag id = slug |
| Details | `/manga/<slug>` → `props.manga`: `name`, `other_name`, `cover_url`/`thumb_url`, `pilot` (HTML, stripped to text), `genres[{name,slug}]`, `artists[{name}]`, `status_id` |
| status_id | 0 = Ongoing, 1 = Completed, 2 = On Hold |
| Chapter list | same details page → `props.chapters[{name, slug, created_at, order}]` |
| Chapter number | parsed from `name` (`Chapter 320`, `Chap 01`); fallback `order` |
| Chapter date | `created_at` (ISO 8601) |
| Pages | `/manga/<slug>/<chapterSlug>` → `props.chapterContent` HTML, every `img` `src` (fallback `data-src`) |

## Error handling

- Missing `#app[data-page]`, unparseable JSON, or missing
  `#manga-chapters-holder[data-id]` throws an `Error` naming the source and the
  URL, so the app shows a clear message.
- HTTP 403/503 with a Cloudflare challenge throws the bypass instruction above.
- Missing optional fields (author, synopsis, dates) fall back to empty values,
  never throw.

## Testing

1. `npx tsc --noEmit` is clean.
2. `npx paperback bundle` succeeds and lists both sources in
   `bundles/versioning.json`.
3. `node --test test/` runs fixture-based parser checks for both sites: list
   items, paging flag, details fields, chapter numbers/languages/dates, page
   URLs. ManhwaClub fixtures are saved with curl; Manhwa18 fixtures are
   captured through the browser pane.
4. A live smoke script runs search → details → chapters → pages against
   manhwaclub.net. manhwa18.net cannot be reached from node on this network and
   relies on fixtures plus the device check.
5. Device check by the user: add the GitHub Pages repo URL in Paperback 0.8 and
   for both sources check home rows, search, a genre filter, details, chapter
   list (KR flag on raw chapters), and reading a chapter.

## Deployment

GitHub Actions workflow on push to `main`: `npm ci`, `npx paperback bundle`,
then publish `bundles/` to GitHub Pages. The repo URL added in Paperback is
`https://zureor.github.io/<repo>/`. Repo name and public visibility are
confirmed with the user before the first push.

## Known risks

- Paperback on iOS may hit the same ISP TLS reset for manhwa18.net that
  plain-SNI clients hit on the user's PC. If so, the fix is on the device
  (Cloudflare 1.1.1.1/WARP or encrypted DNS), not in the source.
- Both sites can change markup or JSON shape at any time; the fixture tests
  make that visible but cannot prevent it.

## Out of scope

- Settings UI (no toggles needed; raw chapters are always shown).
- Login, favorites, or tracking integration.
- Tag exclusion (neither site supports it).
