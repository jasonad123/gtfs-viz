# GTFS Viz

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/nJ-5yD?referralCode=r6T2Zn)
[![npm](https://img.shields.io/npm/v/@gabrielahn/gtfs-viz-cli)](https://www.npmjs.com/package/@gabrielahn/gtfs-viz-cli)

Visualize, analyze, and edit GTFS transit data entirely in-browser with DuckDB WASM. No backend required.

![GTFS Viz Demo](images/gtfs-viz.gif)

## Features

- Upload GTFS zips or load example datasets — all processing client-side
- Interactive maps and tables for stations, stops, and pathways
- Edit stations, stops, and pathway connections with live preview
- Pathfinding between station parts with traversal times
- Export edited data back to GTFS CSV format
- CLI with local DuckDB database and browser dashboard
- DuckDB extension installable from any DuckDB instance

## Quick Start

### Web App

Visit [gtfs-viz-production-f1a4.up.railway.app](https://gtfs-viz-production-f1a4.up.railway.app) or run locally:

```bash
yarn install --ignore-engines && yarn build:extension && yarn dev
```

### CLI

![GTFS Viz CLI Demo](images/cli.gif)

```bash
npm install -g @gabrielahn/gtfs-viz-cli
gtfs-viz import /path/to/feed.zip
gtfs-viz stations --name "Park"
gtfs-viz station "Park Street"
gtfs-viz examples                    # See all commands
```

### DuckDB Extension

The CLI and web app use the GTFS DuckDB extension for all station analysis, pathway queries, and pathfinding. See the [extension docs](packages/duckdb-extension#readme) for standalone usage.

## Project Structure

```
packages/
  duckdb-extension/ DuckDB extension (C++ native + TypeScript API + SQL)
  web/              React web application (DuckDB WASM, Deck.gl, TanStack)
  cli/              CLI tool (npm: @gabrielahn/gtfs-viz-cli)
```

## Development

```bash
yarn install --ignore-engines
yarn build              # Build all (extension -> web -> cli)
yarn dev                # Web dev server at localhost:5173
yarn build:extension    # Build DuckDB extension TS layer
yarn build:cli          # Build CLI only
yarn check              # Type-check all packages
```

## Deploy

Railway via [railpack.json](railpack.json): `yarn build` outputs to `dist/`, served by Caddy as SPA.

## Links

- [CLI on npm](https://www.npmjs.com/package/@gabrielahn/gtfs-viz-cli)
- [CLI docs](packages/cli#readme)
- [DuckDB extension](packages/duckdb-extension#readme)
- [Agent skills](packages/cli/skills/gtfs-viz)
