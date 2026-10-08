# surf-lab

A public surf program with three doors on one engine: a full-screen breaking-wave **cover**,
a **dial** (Hs, Tp, direction, plus today's Open-Meteo marine forecast), and the
**Surf Physics Review** book with a live instrument beside each section. A **world map**
(via [map-kit](https://github.com/dan-slater/map-kit)) lets you click any coast and simulate
it: bathymetry is modelled from the coastline, not surveyed, with per-spot overrides in a
catalogue.

SvelteKit static. Layout: `src/lib/sim/` (WGSL shallow-water solver, bathymetry from a
coastline polyline), `src/lib/instruments/` (P1–P6), `src/lib/spots/` (catalogue JSON),
`src/lib/forecast/` (Open-Meteo, cached), `content/` (book chapters, copied at build from
the book repo).

Status: scaffold. Read `HANDOVER.md` first.
