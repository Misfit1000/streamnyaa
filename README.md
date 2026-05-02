<div align="center">
<img width="1200" height="475" alt="StreamNyaa banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# StreamNyaa

StreamNyaa is a React anime discovery and torrent streaming app. It combines anime metadata from AniList/Jikan-style APIs with Nyaa torrent search, magnet generation, watch/download pages, a local list, theme switching, and browser-based torrent player options.

## Features

- Browse trending, popular, upcoming, recently updated, and scheduled anime.
- Search anime with filters for type, airing status, rating, genre, sort order, and SFW/NSFW mode.
- View anime and manga detail pages with posters, banners, synopsis, genres, relations, recommendations, trailers, and episode lists.
- Save anime to a persistent local list and like titles using browser storage.
- Search Nyaa RSS results through the local `/api/nyaa` proxy.
- Generate magnet links with common WebTorrent and BitTorrent trackers.
- Stream magnet links through embedded WebTor or fallback player providers.
- Switch between light and dark themes.
- Deploy as a Vite frontend with an Express server for the Nyaa proxy and production static serving.

## Tech Stack

- React 19
- TypeScript
- Vite 6
- Express
- React Router
- TanStack React Query
- Zustand
- Tailwind CSS 4
- Lucide React icons
- Motion
- WebTor-compatible magnet playback helpers
- fast-xml-parser for Nyaa RSS parsing

## Project Structure

```text
api/                 Serverless API helpers
public/              Static files
src/api/             AniList/Jikan and Nyaa client functions
src/components/      Shared layout and UI components
src/pages/           Route-level pages
src/store/           Zustand persistent app state
server.ts            Express server and Vite dev middleware
vite.config.ts       Vite, React, Tailwind, and path alias config
```

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Home page with spotlight, recent episodes, trending anime, upcoming anime, schedule, and list preview |
| `/search` | Anime browse/search with filters |
| `/schedule` | Airing schedule view |
| `/anime/:id` | Anime detail page |
| `/manga/:id` | Manga detail page |
| `/anime/:id/downloads` | Torrent/download search for a selected anime |
| `/watch/:id` | Episode watch page |
| `/my-list` | Saved anime list |
| `/nyaa` | Nyaa torrent search |
| `/torrent` | Magnet URI streaming player |

## Prerequisites

- Node.js 20 or newer
- npm
- Internet access for anime metadata, Nyaa RSS, poster images, trailers, and streaming providers

## Setup

Install dependencies:

```bash
npm install
```

Create a local env file if you need to set the app URL:

```bash
cp .env.example .env.local
```

The app currently has no required API keys.

## Development

Start the local development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

The Express server runs on port `3000`, exposes `/api/nyaa`, and mounts Vite middleware during development.

## Production

Build the app and server bundle:

```bash
npm run build:local
```

Run the production server:

```bash
npm start
```

The production server serves the built frontend from `dist` and keeps the `/api/nyaa` endpoint available.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Starts the Express/Vite development server |
| `npm run build` | Builds the Vite frontend for Vercel/static hosting |
| `npm run build:server` | Bundles `server.ts` for the local production server |
| `npm run build:local` | Builds the frontend and local production server bundle |
| `npm start` | Runs the bundled production server |
| `npm run preview` | Runs Vite preview |
| `npm run lint` | Runs TypeScript checking without emitting files |
| `npm run clean` | Removes the `dist` folder |

## Data Sources

- AniList GraphQL is used for anime/manga discovery, details, relations, recommendations, schedules, and search.
- Jikan is used for anime episode metadata.
- Nyaa RSS is fetched server-side through `/api/nyaa` so the frontend can receive normalized JSON torrent results.

## Notes

- SFW mode is enabled by default. Toggle it in the navbar to include adult results.
- Torrent streaming depends on torrent health, seeders, browser support, and third-party player availability.
- Some embedded providers may block playback, load slowly, or require trying a fallback player.
- Local list, likes, theme, and SFW/NSFW preference are persisted in browser storage.
