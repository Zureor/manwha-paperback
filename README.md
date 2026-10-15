# Manhwa Extensions for Paperback 0.8

Sources:

- **ManhwaClub** (manhwaclub.net) — 18+
- **Manhwa18.net** (manhwa18.net) — 18+
- **Vortex Scans** (vortexscans.org) — paid early-access chapters are hidden until they become free

## Install

In Paperback 0.8: Settings → External Sources → add repository:

    https://zureor.github.io/manwha-paperback/

ManhwaClub and Manhwa18.net are rated Adult, so adult content must be enabled in Paperback to see them.

## Development

    npm install
    npm test          # parser and source tests (fixtures, offline)
    npm run smoke     # live checks against manhwaclub.net and vortexscans.org
    npm run bundle    # build bundles/
    npm run serve     # serve bundles/ on your LAN for testing on a device
