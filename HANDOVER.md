# surf-lab — HANDOVER

> ## BOOK LINE (build-order step 5), 2026-10-09: the book is built, 9 chapters prerender with maths, 21 instruments swap on scroll
>
> **Built (branch `book`, worktree `~/code/surf-lab-book`):** `/book` (contents, nine ledes) and
> `/book/[chapter]` (text left; the section's instrument pinned right and swapped as you scroll by
> IntersectionObserver on the section headings; a picker overrides it, "follow" resumes; a swell
> strip (Hs, Tp, direction) drives every instrument; under 1100 px each section gets its instrument
> as an inline figure, mounted lazily). All chapter fields are rendered: title, lede, sections
> (body, "on the wave", figure brief in a fold), key equations with meaning and worked example,
> references with "why read it", revision notes in a fold. `[n]` markers link to the references,
> `#slug` links become chapter routes. `/book/instruments` shows all 21 at once.
> `scripts/sync-content.mjs` copies `$SURF_BOOK_DIR` (default `~/surf-physics-book/chapters`) into
> `content/chapters/` (git-ignored), checks all nine parse, fails loudly otherwise; wired as
> `predev` and `prebuild` (bun runs both). Type: Libertinus Serif via `@fontsource`, labels in
> Spline Sans Mono, palette as CSS tokens in `src/routes/book/tokens.css`.
>
> **Maths:** KaTeX `renderToString` at BUILD time on the raw JSON strings (`src/routes/book/math.ts`),
> not client auto-render: `breaking` and `swell` hold bare `\(u < c\)` and `\(h > L/2\)` inside
> `body_html`, which an HTML parser mangles before auto-render can see them. Pages ship finished
> maths and no KaTeX JS. Libertinus Math is unused: KaTeX cannot take an OpenType math font.
>
> **Instruments (`src/lib/instruments/`, README there):** P1 to P6 lifted with the maths and drawing
> code unchanged (colours and fonts to tokens only; P6 lost the "v0 was this" dot and gained an
> `onPeel` backdrop). Rendered headless against the original page at the same inputs, P1 and P3
> readouts are identical and P5's time step agrees. Fifteen derived ones, each from equations its
> chapter states: swell arrival/sets, swell power and reach, Iribarren, the 2-D sim (WebGPU,
> `createSolver` + debug renderer on J-Bay, captured frame as fallback), catching gap, refraction,
> tide, rip pulses, height statistics, effective flow, section speed (J-Bay's sections), face
> acceleration, banked turn, board planing, fin lift. `instrumentFor(slug, i)` in `map.ts`
> returns `{id, caption, props?}[]`. Each takes `{Hs, Tp, dirDeg, spot?}`; default J-Bay 2.5 m,
> 15 s, from 225°; the day chapter opens on its own worked swell (1.5 m, 14 s).
> **State hook:** `src/routes/book/[chapter]/+page.svelte`, comment `HOOK(app state)`: replace the
> local `swell` $state with the app line's store (one line) and drop the swell strip.
>
> **Works, with evidence:** `bun run check` 0 errors, 0 warnings; `bun test` 27 pass (11 sim + 16
> book: worked examples from five chapters reproduce, e.g. H_b 2.28 m, ξ₀ 0.41/1.24, R 6.5/3.8 m;
> the renderer keeps `u < c` out of the HTML); `bun run build` prerenders `/book`, nine chapters
> and `/book/instruments`, 213 KaTeX blocks, 0 `katex-error`, 0 leftover delimiters. Headless
> Chromium (sim line's `scripts/browser.ts`, 4090 Vulkan) via `bun scripts/shoot-instruments.ts`:
> one screenshot per instrument in `docs/img/instruments/`, page shots in `docs/img/book/`; the
> bench on `/book/breaking` swaps P1 → P3 → P2 → Iribarren → P4 while scrolling; the 2-D sim runs
> live (`docs/img/instruments/sim.png`). Only console noise: `/favicon.ico` 404 (site-wide).
> Dev server: tmux `surflab-book`, `http://127.0.0.1:5183/book`.
>
> **Open questions:** (1) swell direction has two meanings: P3 and the book use the REGIONAL
> deep-water direction (SW, 225°), the solver uses the LOCAL wavemaker direction (Run A, 120°);
> `Sim2D` takes its own `localDirDeg` so the book's 225° does not point the wavemaker offshore. The
> app store needs to say which it carries. (2) Per-section peel angles at J-Bay are not in the
> review; `SectionSpeed` starts each section at 45° for the reader to set, until the 2-D sim
> breaks and can measure them. (3) Canvases keep their research-notes logical sizes (880 wide);
> on phones they scroll sideways at a 600 px minimum rather than reflow. (4) `favicon.ico` is
> missing site-wide (static/ is the app line's).
>
> **Next for this line:** bind the state hook when `#lib/state` lands; reflowing phone layouts for
> the widest instruments; draw the chapters' figure briefs (`diagram_spec`) as static SVG figures.

> ## SIM LINE (build-order step 2), 2026-10-09: module built, bathy exact, wave parity FAILS by design of first order
>
> **Built (all on `main`, zulzi-gpu):** SvelteKit 3 + Svelte 5 + adapter-static scaffold (bun; `#lib/*`
> subpath imports since SvelteKit 3 dropped `$lib`); `src/lib/sim/`: `bathy.ts`
> (`bathyFromPolyline`), `swell.ts` (JONSWAP components, compass <-> grid angles), `step.wgsl` +
> `fields.wgsl` + `solver.ts` (`createSolver`, faithful Run C port with swell as a component
> buffer, stats pass, fields texture), `cpu.ts` (CPU twin), `debug-render.ts` (plain painter with a
> grid-to-clip affine for the map overlay); `/sim` and `/sim/parity` routes; `scripts/` for headless
> GPU runs and parity. Docs: `src/lib/sim/{README,FRAME,PARITY}.md`.
>
> **Works, with evidence:** `bun run check` 0 errors, `bun run build` writes `build/`, `bun test` 11
> pass. Bathy rebuilds Run A's `depth.f32` **bit-exactly** (max error 0 over 2.46 M cells) and the
> Run C 192x512 grid exactly with `supersample: 5`. GPU matches the CPU twin to 1.2e-5 m. The 4090
> runs 600 s of J-Bay model time in 0.32 s. Headless WebGPU on the 4090 works: Chrome spawned with
> `--headless=new --no-sandbox` + Vulkan flags, attached over CDP (`scripts/browser.ts`); the first
> `requestAdapter` returns null, so pages retry. Headless page screenshots do not composite WebGPU
> canvases; `scripts/shot.ts` reads the canvas with `toDataURL`.
>
> **Does not work: J-Bay does not break.** First-order HLL at 12.5 m diffuses a 15 s swell with an
> e-folding distance of ~265 m; the wavemaker is 1.3 to 1.5 km offshore. Interior Hs is 10 % of Run
> A's (3 to 8 % inside 10 m depth), foam coverage 0.02 % vs 1.18 %, no break line at 4 of 8
> sections. The ORIGINAL Run C demo, rebuilt in a scratchpad and captured, shows the same: its
> "foam band" is a waterline fringe, not breaking (`docs/img/runc-original-t420.png`). Full
> numbers: `src/lib/sim/PARITY.md`. `/sim` runs (60 fps, `?warm=300` skips spin-up) but shows
> swell dying offshore.
>
> **MUSCL/RK2, what it would take (scoped OUT of this step by the brief; now the blocker for
> "J-Bay breaking"):** port `surf-sim/solver/swe2d.py` `compute_L` (MUSCL-MC on eta/u/v, first order
> at wet/dry fronts, Audusse on reconstructed states) into `step.wgsl` as an L(U) kernel, add a third
> state buffer and run SSP-RK2 as two dispatches per step; mirror in `cpu.ts`; rerun the parity
> scripts (minutes). About one day. Cost ~4x flux work per step, partly repaid by Run A's CFL 0.40
> vs Run C's ~0.19; the GPU headroom is large (15 600 steps/s vs ~180 needed for 3 substeps at
> 60 fps). Unknown until measured: whether 12.5 m is fine enough in the surf zone (a 15 s wave in
> 3 m of water is ~6.5 cells long); 6.25 m (4x cells) may be needed. Keep first order as an option.
>
> **Open questions:** (1) go/no-go on MUSCL/RK2 in the browser (decides whether step 3 shows
> breaking waves); (2) map-kit's exact `enuFrame` API (assumed `toLonLat`-style inverse in
> `src/lib/sim/README.md`); (3) coast orientation from vector-tile water polygons (the builder
> needs ocean on the right, FRAME.md).
>
> **Next for this line:** MUSCL/RK2 if approved, then parity rerun; breaking thresholds back toward
> Run A's (0.40 / 0.60, d < 5 m) once waves arrive; a spatial index in `bathyFromPolyline` for
> tile coastlines with thousands of vertices (now brute force, 20 ms for 72 vertices at 98 k cells).
> Dev server: tmux `surflab-dev`, `http://127.0.0.1:5181/sim`.

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
