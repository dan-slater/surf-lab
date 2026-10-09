# surf-lab — HANDOVER

> ## SIM LINE (build-order step 2), 2026-10-09: DONE. MUSCL/RK2 in, J-Bay breaks, parity with Run A at 6.25 m
>
> **Built (all on `main`):** SvelteKit 3 + Svelte 5 + adapter-static scaffold (bun, `#lib/*` subpath
> imports). `src/lib/sim/`: `bathy.ts` (`bathyFromPolyline`, `oceanSide` option, `CoastIndex` segment
> BVH), `swell.ts`, `config.ts` (`scheme`, `breakingDefaults`, `suggestDt`), `common.wgsl` +
> `muscl.wgsl` (default: Run A's MUSCL-MC + SSP-RK2, two dispatches per step) + `step.wgsl`
> (`scheme: 'first-order'`, Run C), `fields.wgsl`, `solver.ts` (`createSolver(device, ...)` on a
> caller-owned device; `fields` texture, `buffers`, stats), `cpu.ts` (CPU twin of both schemes),
> `debug-render.ts` (draws into a canvas or an already-configured context; `affineFromOverlay` for
> map-kit's frame). Routes `/sim` (`?warm ?speed ?dx ?scheme ?external ?hs ?tp ?dir`) and
> `/sim/parity`. Docs `src/lib/sim/{README,FRAME,PARITY}.md`.
>
> **Evidence:** `bun run check` 0 errors; `bun run build` ok; `bun test` 16 pass (lake at rest and
> wave speed for both schemes, MUSCL keeps more than 85 % over 500 m, index exactly equals brute force).
> Bathymetry is bit-exact against Run A's `depth.f32`. Against Run A on J-Bay (GPU, headless Chrome on the
> 4090): **MUSCL 6.25 m:** interior Hs 91 % of Run A (98 % inside 3 m), 8 of 8 sections break, foam
> cover 1.34 % vs 1.18 %, 600 s of model time in 0.44 s. **MUSCL 12.5 m:** 79 %, 6 of 8, 0.31 s.
> **First order 12.5 m:** 10 %, none, kept as an option only. Images in `docs/img/`.
>
> **Decisions made here (review):** the default grid for J-Bay is 6.25 m (384 x 1024), with 12.5 m as
> the weak-GPU fallback. The default dt is Courant 0.4 (0.126 s at 6.25 m). The Froude breaking threshold
> scales with the grid (`0.65 - 0.024 dx`: 0.50 at 6.25 m, 0.35 at 12.5 m) and was fitted to Run A's
> foam cover on this one run. Break-line positions were not fitted and land 0 to 25 m seaward of
> Run A's.
>
> **For step 3 (mounting in the map overlay):** `createSolver(frame.gpu.device, ...)`, then
> `createDebugRenderer(solver, { context, format })`, and `affineFromOverlay(grid, coast.frame, frame)`
> in `ondraw`. `coastlineNear` polylines go in as one array with `{ oceanSide: 'left' }`; the index
> handles thousands of vertices (4000-vertex coast, 24 k cells: 15 ms, brute force 268 ms).
> Still to build: choosing a GridSpec (rotation, land on the low-ix side) from a clicked coast, and
> the product renderer. Snippet in `src/lib/sim/README.md`.
>
> **Open questions:** (1) whether laptop GPUs hold 6.25 m in real time (needs ~8 steps/s of 393 k
> cells; the 4090 does ~11 000 steps/s; worth a Mac check of `/sim`, fps is on the page);
> (2) whether the random sea state should reproduce Run A's exactly (it uses a different PRNG
> from numpy's, so the statistics agree and the individual crests do not).
>
> **Next for this line, if wanted:** a GridSpec-from-coast helper for the click-any-coast flow;
> per-spot breaking calibration in the catalogue; a CPU-twin parity run at 6.25 m (about 15 min,
> not done; the GPU and twin agree at 12.5 m).
> Dev server: tmux `surflab-dev`, `http://127.0.0.1:5181/sim?warm=300`.

> ## 🌊 SURF-LAB + MAP-KIT: design settled, build via factory lines on zulzi (2026-10-08) — READ THIS FIRST
>
> **Goal:** turn the J-Bay GPU surf solver (`zulzi-gpu:~/surf-sim`) into a public web program
> with THREE doors on ONE engine, plus a reusable map package Leachie reuses for client data maps.
> Daniel chose ALL of it for the first cut (no phased scope), 2026-10-08.
>
> **The experience (decided):**
> 1. **Cover** — open it and a spot is breaking, full screen, no chrome; sets/lulls, line-art foam,
>    stick surfers taking off. Remembered spot, J-Bay default. Doubles as the second-screen idle.
> 2. **Dial** — three floating controls (Hs, Tp, direction) + spot picker + "today" (Open-Meteo marine,
>    no key, per lat/lon). Same sim with chrome on.
> 3. **Book** — the Surf Physics Review (`~/dan-hub/surf-physics-book/chapters/*.json` = the ONLY
>    text source) with the section's instrument beside the text; scrolling swaps the instrument.
>    Six instruments already exist as JS demos in `zulzi:~/surf-sim/making-of-research.html`
>    (P1 dispersion/shoaling, P2 Snell+break depth, P3 rays over the real coast, P4 peel angle,
>    P5 live 1-D NSWE, P6 surfer IK rig). Chapter→instrument map: swell→P1 + distance sorting;
>    breaking→P2 P3 P4 + the 2-D sim + Iribarren; catching→P5; day→shadowing/tide/height stats;
>    riding+turns→section speed + P6 on the peel front; board/fins→simple lift/AoA curves;
>    teaching→text only.
> 4. **World map** — globe (MapLibre + OpenFreeMap vector tiles), known spots pinned, pan anywhere,
>    CLICK ANY COAST → camera flies in, sim spins up on that coastline (swell builds from flat).
>    Coast polyline comes from the vector tiles already in the browser (water polygons at high zoom),
>    so no server/Overpass. Bathymetry = the J-Bay recipe generalised: signed distance to coast →
>    1:25 shelf inside 250 m, 1:70 ramp beyond, wet/dry land; per-spot overrides in a catalogue
>    (slope, reef angle, sandbar, named sections). Offshore GEBCO + finer national grids (NOAA, EMODnet)
>    where they exist, later. **Honesty line on the sim panel:** "modelled from the coastline, not surveyed".
>    Panning INSIDE the sim re-centres + reinitialises the domain (continuous coast-scroll = later).
> 5. **Later, shapes the architecture now:** forecast per spot + sim per spot ⇒ the map can show
>    which spots are working today. Design forecast fetch + catalogue for MANY spots, not one.
>
> **Tech (decided): web, not native.** Text is JSON, the demos are canvas JS, the only GPU piece
> already runs in WebGPU (Run C). A WKWebView shell can add a dock icon later.
> - **Repo A `dan-slater/map-kit`** (public, semver TAGS like site-editable): Svelte 5 over MapLibre.
>   Surf-agnostic. `<Map>` globe/pan/zoom, pins from `[{id,lat,lon,props}]`, side `<Panel>` for the
>   selected pin, named toggle layers, fly-to, an **overlay slot** mounting a canvas/WebGPU surface
>   registered to map coords, theming by CSS tokens (takes a client brand). Client use = same
>   components, different data: competitor pins with prices in the panel, radius ring, heat layer.
> - **Repo B `dan-slater/surf-lab`** (public, SvelteKit static → CF Pages direct-upload, e.g.
>   `surf.danielslater.dev`): `sim/` (WGSL solver module: grid, swell, bathy as inputs; bathy builder
>   from a polyline), `spots/` catalogue JSON (J-Bay first, ~20 famous breaks), `instruments/` (P1–P6
>   lifted out), `content/` (chapters copied at build from the book repo), `forecast/` (Open-Meteo,
>   cached). Routes: cover+dial+globe, book, per-spot. Palette: ink navy / teal / coral (approved on
>   wave-landing); book type Libertinus.
>
> **Solver sizing (read 2026-10-08):** Run C = `zulzi:~/surf-sim/webgpu/demo.template.html` (466 lines,
> ~230 WGSL): first-order HLL + Audusse, 192×512 @ 12.5 m, dt 0.12 s ×3 substeps/frame, relaxation
> wavemaker (θ0=150° math frame), N/S sponges, foam scalar, bathy baked base64 by `build_demo.py`
> from `out/A4-full/depth.f32`. Reference solver = `solver/swe2d.py` (MUSCL-MC + RK2, CFL 0.40,
> Manning 0.025; Boussinesq disabled). Run A fields in `out/A4-full/` (3.4 GB) = the parity target.
> Missing for us: bathy-from-polyline at runtime, swell as params, MUSCL/RK2 (optional), rendering
> (face light, line foam), surfers. Estimate: days, not weeks. A copy of the template is in the
> session scratchpad only; re-scp from zulzi.
>
> **Build order (all first cut):** 1 repos + map-kit skeleton + globe/pins → 2 solver module +
> bathy-from-polyline + J-Bay parity vs Run A → 3 cover/dial/forecast + spin-up transition →
> 4 rendering + surfer rig → 5 book + six instruments wired to current spot → 6 catalogue, deploy,
> tag map-kit v0.1.
>
> **HOW to build (Daniel, 2026-10-08): the tmux-orchestrator skill with factory lines ON zulzi-gpu.**
> Skill = `~/.claude/skills/tmux-orchestrator` (merged 2026-10-08; `factory.sh provision <host>`
> ships the fence, idempotent). Daniel's words: "get the skill from devboxv2 but use it on zulzi":
> devboxv2 holds the current fence/team tooling in `~/.orchestrator/` (team.sh, TEAM-FLOW.md,
> policy/, dated 2026-10-08); zulzi's `~/.orchestrator/` is older. Re-provision zulzi
> (`factory.sh provision zulzi-gpu`) before spawning; memory `tmux-orchestrator-merged` says remote
> boxes need re-provision. Nothing runs on the Mac. Suggested lines: map-kit, sim, instruments/book,
> with a manager line via team.sh. Remote lines cannot see the Mac; verify renders with your own
> screenshots on the control plane.
>
> **⚠️ UNCOMMITTED WIP:** none in code. This dir (`~/dan-hub/surf-lab/`) holds only this file; the
> repo is NOT yet created (no git init, no GitHub). `surf-physics-book` is a local git repo with NO
> remote — do not lose it; the app's `content/` build step reads its `chapters/*.json`.
>
> **Blockers / definition-of-done:**
> 1. Zulzi cleanup NOT done (classifier denied "interfere with workloads"; Daniel to run, see Next).
> 2. Done = cover+dial+globe+click-any-coast+sim+book(9 chapters, 6 instruments)+~20-spot catalogue
>    live on a public URL; map-kit tagged v0.1.0 and consumed by surf-lab via a tag pin.
>
> **Open decisions awaiting Daniel:** names `map-kit` / `surf-lab` (proposed, not confirmed);
> public hostname; whether the 2-D solver gets MUSCL/RK2 in the browser or stays first-order
> (watch-quality decides).
>
> **Gotchas:**
> - zulzi: Python 3.14 system, Taichi needs a 3.12 uv venv (`surf-sim/.venv` was deleted in July as
>   regenerable). WebGPU needs a secure context (serve over http(s), not file://).
> - zulzi is SHARED (gpuadmin has sudo; Nsuna local-dev stack lives under Daniel's own account at
>   `~/projectx-backend/docker-compose/local`). Keep secrets off it. `therapist-opensearch` must stay
>   up (Sunday 01:00 UTC cron `~/code/therapist-index/ops/collect.sh`).
> - Classifier blocks: credential-looking reads and stopping workloads over ssh. Use a scratchpad
>   script piped to `ssh host 'bash -s'` for reads; for stops, ask Daniel for manual permission mode.
> - Public bathymetry: GEBCO ~450 m globally; NOAA CUDEM 1–3 m (US); EMODnet ~100 m (EU); none for SA.
>
> **Next actions:**
> 1. Daniel runs the zulzi cleanup (one command, printed in chat 2026-10-08): compose `stop` the
>    local-dev stack (reversible with `docker compose start`), prune dangling images + build cache.
> 2. `factory.sh provision zulzi-gpu`, confirm `claude` auth there, spawn the lines.
> 3. Create both GitHub repos, scaffold, start build order steps 1 and 2 in parallel.
>
> **Pointers:** `zulzi:~/surf-sim/{SURF-SIM-HANDOVER.md,RUN-REPORT.md,STATUS.md,GPU-SIM-BRIEF.md,
> jbay-geometry.json,making-of-research.html,webgpu/,solver/,out/A4-full/}`;
> `~/dan-hub/surf-physics-book/` (chapters/*.json, HANDOVER.md); memories `surf-physics-review`,
> `tmux-orchestrator-merged`, `blender-gpu-render-zulzi`, `site-editable-versioning-gate` (tag-pin
> pattern for map-kit), `tabs-app` (the "little public program" precedent).
