# GTFS Viz 🚉

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/nJ-5yD?referralCode=r6T2Zn)

Browser-based GTFS visualization and editing tool. Process transit data entirely in your browser using DuckDB WASM.

![GTFS Viz Demo](images/gtfs-viz.gif)

## What is GTFS Viz?

GTFS Viz enables transit agencies, developers, and transit enthusiasts to visualize, analyze, and edit GTFS files without backend servers. All data processing happens client-side for privacy and speed.

### Key Features

**Data Management**
- Upload GTFS zip files or load example datasets
- Process large datasets entirely in-browser with DuckDB WASM
- Export edited stops and stations back to GTFS format

**Stations & Stops**
- View in both table and interactive map formats
- See station entrances, exits, platforms, and pathways
- Add, edit, and delete stations and their components
- Upgrade stops to stations or downgrade stations to stops

**Pathways & Navigation**
- Visualize pathway connections within stations
- Calculate routes between different points
- Identify accessible routes and barriers

## Installation

```bash
yarn
yarn dev
```

App runs at `http://localhost:5173`

This repo now uses Vite+ through local package scripts:

- `yarn dev`: `vp dev` for HMR and route generation
- `yarn build`: `vp build` for production output
- `yarn lint`: `vp lint`
- `yarn check`: `vp check`

The dev flow still keeps TanStack Router route generation enabled, so edits to route files and normal React modules participate in the live HMR flow during development.

### How Deployment Works

1. **Build**: Railway uses Railpack via [railway.json](railway.json) and [railpack.json](railpack.json)
2. **Install**: Railpack uses the custom install step in `railpack.json` and runs `yarn install --non-interactive`
3. **Build**: Railpack runs `yarn build`, which uses Vite+ and emits the same `dist` output for production
4. **Deploy**: Railway serves the SPA from `dist` via the `RAILPACK_SPA_OUTPUT_DIR=dist` service variable
5. **Serve**: App available at your Railway URL

Configuration:
- `railway.json`: Railway builder and restart policy
- `railpack.json`: Railpack Node runtime configuration
- `Caddyfile`: Static file server with caching and security headers
- `build.watchPatterns`: Railway only redeploys on app and deploy file changes

## Tech Stack

- **Vite+**: Unified dev, build, lint, and check commands
- **DuckDB WASM**: In-browser SQL database
- **TanStack Router**: Type-safe routing
- **TanStack Query**: Data fetching and caching
- **Deck.gl**: WebGL-powered map visualization
- **Shadcn UI**: Component library

## Performance

- Dedicated GPU recommended for large datasets
- DuckDB caches data in IndexedDB for faster subsequent loads
- Large GTFS files (>100MB) may take longer on initial load
