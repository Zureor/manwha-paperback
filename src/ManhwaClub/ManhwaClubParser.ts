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
