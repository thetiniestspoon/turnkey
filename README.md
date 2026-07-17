# Turnkey

Real estate deal management dashboard for agents — scouting, pipeline tracking, map view, and AI-powered predictions.

## Overview

A full-featured real estate investor platform with property scouting, stage-based deal pipeline tracking, geospatial map visualization with marker clustering, AI deal recommendations, contact management, and watchlists. Includes agent pulse metrics and month-to-date AI cost tracking.

## Tech Stack

- Frontend: React 19 + TypeScript + Vite
- Styling: Tailwind CSS v4 + Base UI
- Maps: Leaflet + React Leaflet (marker clustering)
- Animation: Framer Motion
- Backend: Supabase (Auth, Database)
- Routing: React Router

## Key Pages

| Route | Description |
|-------|-------------|
| `/dashboard` | KPI cards, recommended deals, activity marquee, agent pulse |
| `/scout` | Property discovery and scouting |
| `/pipeline` | Stage-based deal tracking workflow |
| `/map-view` | Geospatial visualization with marker clusters |
| `/predictions` | AI-powered deal recommendations |
| `/contacts` | Contact management |
| `/watchlists` | Saved property collections |

## Getting Started

```bash
npm install
npm run dev
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
