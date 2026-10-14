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
