# Manhwa Extensions for Paperback 0.8

Sources: **ManhwaClub** (manhwaclub.net) and **Manhwa18.net** (manhwa18.net). Both are 18+.

## Install

In Paperback 0.8: Settings → External Sources → add repository:

    https://zureor.github.io/manwha-paperback/

Both sources are rated Adult, so adult content must be enabled in Paperback to see them.

## Development

    npm install
    npm test          # parser and source tests (fixtures, offline)
    npm run smoke     # live check against manhwaclub.net
    npm run bundle    # build bundles/
    npm run serve     # serve bundles/ on your LAN for testing on a device
