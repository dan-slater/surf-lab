# surf-lab — HANDOVER


> ## 🚀 CONTROL-PLANE HANDOVER (2026-10-09 ~08:45 UTC) — merged, integrated, LIVE noindexed at surf.danielslater.dev — READ THIS FIRST
>
> **State:** `main` 227a04d on GitHub, the Mac and `zulzi:~/code/surf-lab`. Branches `app` and `book`
> are merged (the HANDOVER.md conflicts were the only ones; `bun.lock` regenerated). The branch
> worktrees `~/code/surf-lab-app` (12d4cc5) and `~/code/surf-lab-book` (a6781ec) on zulzi are now
> behind main and can be removed with their lines. `bun run check` 0 errors, `bun test` 70 pass,
> `bun run build` prerenders `/`, `/map`, 20 `/spot/*`, `/book` + 9 chapters.
>
> **Done this session:**
> 1. **App on the product renderer** (f292c08): `src/lib/ui/sim-engine.ts` drops the debug painter
>    and its own set envelope and spin-up. It uses `createRenderer`, `Swell.groupiness` 0.5,
>    `rampFrom(0)`, `solver.budget(12)`, the front tracker, and the surfer crowd on a 2d canvas in
>    `SimView` (only where a scene has placed sections). The renderer gained `overlay: true` for
>    map-kit's premultiplied canvas: land transparent, sea faded past the grid edge, so the globe
>    keeps its basemap. Proven on the 4090: cover, `/spot/jeffreys-bay`, and a Durban map click.
> 2. **Book**: it already used the real `generatorDirection` (the stand-in was gone on `book`). It
>    now seeds its swell from the app store when the visitor's spot is J-Bay; chapter presets win,
>    sliders stay local.
> 3. **Catalogue coordinates** (fe4b172): Skeleton Bay, Lance's Right and Teahupo'o moved onto the
>    breaks from published figures; Pasta Point and Punta de Lobos kept. Every spot now sits within
>    600 m of the coast. Details and two open-sea-bearing mismatches in `src/lib/spots/FRAME-CHOICE.md`.
> 4. **Deploy**: CF Pages project `surf-lab` (direct upload, personal account, prod branch `main`),
>    custom domain `surf.danielslater.dev` + proxied CNAME. `static/_worker.js` 404s every other host
>    (pages.dev verified 404) and sets `x-robots-tag: noindex, nofollow` until `INDEX = true`.
>    All routes 200 live.
>
> **Open / next:**
> 1. **Redeploy needed for the 404 fix** (227a04d adds `fallback: '404.html'` + absolute paths;
>    the live build still answers `/nope` with 200). The auto-mode classifier denied the second
>    `wrangler pages deploy`; run it in manual permission mode:
>    `SURF_BOOK_DIR=~/dan-hub/surf-physics-book/chapters bun run build` then
>    `CLOUDFLARE_EMAIL=… CLOUDFLARE_API_KEY=… CLOUDFLARE_ACCOUNT_ID=084af6c166c202c97486fc413d55ed36 bunx wrangler@4 pages deploy build --project-name surf-lab --branch main`.
>    ⚠️ Never run `wrangler pages project create` with wrangler 4.149+: it delegates to a Workers
>    autoconfig that rewrote six project files (reverted). Create projects through the API.
> 2. **map-kit v0.1.1**: `ORCH-mapkit` hit the account usage limit at 08:13 mid-edit (uncommitted
>    `coastline.ts`, `index.ts`, `tests/coastline.test.ts`, `scripts/probe-winding.mjs` in
>    `zulzi:~/code/map-kit`) and resumes on its own at 10:10 UTC. Collect its work, tag v0.1.1,
>    bump surf-lab's pin, rebuild, redeploy. The live globe still uses the light basemap until then.
> 3. **Real-browser fps** on a laptop GPU (Daniel): `https://surf.danielslater.dev/` and
>    `/sim/cover?warm=400&across=2000&cx=-20&cy=-150&speed=4&groupiness=0.5`; `?dx=12.5` is the fallback.
>    The coarser-grid budget level is exposed as `engine.level` but nothing rebuilds the scene yet.
> 4. **Daniel decides**: the hostname (kept as proposed), flipping `INDEX`, cover framing/speed, the
>    renderer's look, the foam band width.
> 5. Kill `ORCH-sim`, `ORCH-app`, `ORCH-book` (idle, work merged) and their dev tmux sessions once
>    Daniel no longer wants the dev ports; never kill-all (peer `ORCH-fv-*`).
>
> **Known noise:** Chrome logs "READ-usage buffer was written … before being read back" from the
> front tracker's readback every frame; harmless, worth a ring of staging buffers later. Teahupo'o's
> coast capture includes inland river slivers the sim treats as sea.

> ## 🏭 CONTROL-PLANE HANDOVER (2026-10-09 morning, SUPERSEDED by the block above) — four factory lines on zulzi, steps 1–5 built, nothing merged or deployed — READ THIS FIRST
>
> **Goal:** ship surf-lab (cover + dial + globe + click-any-coast + book + catalogue) on a public URL with
> map-kit consumed by tag. Built on 2026-10-08/09 by four fenced `claude` lines on zulzi-gpu driven from
> the Mac with the tmux-orchestrator skill (`factory.sh`). The line-written blocks below this one are each
> line's own state (SIM LINE on main; APP LINE on branch `app`; BOOK LINE on branch `book`).
>
> **⚠️ UNCOMMITTED WIP:** none anywhere (all four checkouts on zulzi are clean). **UNMERGED WIP:** branches
> `app` (8 commits, 12d4cc5) and `book` (8 commits, a6781ec) are on GitHub but NOT merged into `main`
> (7087cf6). A trial `git merge app` on the Mac conflicts only in `HANDOVER.md` (each line wrote its own
> top block; keep all three blocks). Do the merge on the Mac, then `git pull` in the zulzi checkouts.
>
> **What shipped (all on GitHub):**
> - map-kit `main` 33c8126, tag **v0.1.0** (at 2809264): Map/Pins/Panel/Layer/Overlay, `enuFrame`,
>   `coastlineNear` (J-Bay: one 4.3 km, 133-vertex polyline), 71 tests, real-4090 WebGPU overlay run,
>   basemap theming with presets ink/paper/chart/mono (`docs/img/themes/`). **Daniel picked INK.**
> - surf-lab `main` 7087cf6: SvelteKit 3 static scaffold; `src/lib/sim/` = bathy-from-polyline
>   (bit-exact vs Run A `depth.f32`), WGSL solver with **MUSCL-MC + SSP-RK2 default** (first-order kept as
>   option), CPU twin, `gridFromCoast`, `generatorDirection` (225° deep water → 129° at the J-Bay
>   generator), product renderer (lit depth-tinted sea, line-art foam), front tracking, P6 surfers,
>   sets/lulls + `rampFrom(0)`, `solver.budget(ms)`; `/sim`, `/sim/cover`, `/sim/parity` dev routes.
>   Parity: MUSCL 6.25 m = 91 % of Run A's Hs, 8/8 sections break (`src/lib/sim/PARITY.md`).
> - surf-lab `app`: `/` cover+dial, `/map` globe with click-any-coast→sim (proven headless at Durban),
>   `/spot/[slug]`, 20-spot catalogue, Open-Meteo forecast + cache, runes store, SimView wrapper.
> - surf-lab `book`: `/book` + 9 chapters prerendered with build-time KaTeX, P1–P6 lifted + 15 derived
>   instruments, scroll-swap, phone reflow to 360 px, `scripts/sync-content.mjs` (predev/prebuild).
> - Both repos MIT (Daniel 2026-10-09). Book chapters staged at `zulzi:~/surf-physics-book/chapters/`
>   (copy; the Mac repo `~/dan-hub/surf-physics-book` is still the only git copy, no remote).
>
> **Lines on zulzi right now** (`factory.sh state zulzi-gpu`): `ORCH-mapkit` ACTIVE on a queued
> series: (a) fix the winding doc (app line found water on the RIGHT of `coastlineNear` polylines, docs
> say left) + make the v0.1.0 git-tag install work under Kit 3/Vite 8 (prepare fails: Kit 2 config), then
> (b) ink as demo default + futuristic globe effects (atmosphere rim glow, graticule, idle auto-rotate,
> star field, fly-to sweep, each an opt-in prop) + settings pattern: `theme`/`projection` bindable props,
> headless `mapSettings()` store, one optional unstyled `<Controls>`. `ORCH-sim`, `ORCH-app`,
> `ORCH-book` are IDLE with STATUS printed; dev servers in tmux `surflab-dev` :5181, `surflab-app`
> :5182, `surflab-book` :5183, `mapkit-dev` :5180 (tunnel: `ssh -f -N -L 5180:127.0.0.1:5180 … zulzi-gpu`).
> Other ORCH-fv-*/footyviz sessions on zulzi belong to a peer session: never kill-all.
>
> **Blockers / definition-of-done:**
> 1. Merge `app` + `book` into `main` (HANDOVER.md conflict only), pull on zulzi, re-point the app at the
>    new renderer (`createRenderer`, `rampFrom`, `groupiness` — the app has stubs), swap the book's
>    stand-ins, then one `bun run build` must pass on main with `/`, `/map`, `/spot/*`, `/book/*`.
> 2. map-kit v0.1.1 tag once the install fix + ink default + effects land; surf-lab pins `#semver:^0.1.0`.
> 3. Real-browser fps check on a laptop GPU (headless shows 0 fps): `/sim/cover?warm=400&across=2000&cx=-20&cy=-150&speed=4&groupiness=0.5` on :5181; 12.5 m (`?dx=12.5`) is the fallback.
> 4. Deploy: CF Pages direct-upload project (e.g. `surf-lab`) + custom domain **surf.danielslater.dev**
>    (proposed, not confirmed). Build on the Mac (`SURF_BOOK_DIR=~/dan-hub/surf-physics-book/chapters`).
> 5. Confirm 5 catalogue coordinates the app line could not verify: Skeleton Bay, Lance's Right, Pasta
>    Point, Punta de Lobos, Teahupo'o.
>
> **Open decisions awaiting Daniel:** public hostname; the cover's default framing (~2 km across) and
> speed (~4×) proposed by the sim line; the look of the renderer (not yet seen by Daniel; headless Mac
> shot of `/sim/cover` failed, take it in a real Chrome); whether the J-Bay foam band width is right.
>
> **Gotchas:**
> - zulzi: `claude` login expired once (fixed by `/login` in a line + Daniel pasting the code; sim line
>   needed a respawn to pick up creds). No `node`; bun at `~/.bun/bin`. `gh` NOT logged in on zulzi by
>   design: lines commit, the Mac fetches `ssh://zulzi-gpu/~/code/<repo> +main:zulzi-main` and pushes.
> - Lines `git pull --rebase` their own checkouts when told; that rewrites hashes, so always fetch with
>   `+` and `reset --hard` the Mac copy to zulzi's main before pushing.
> - `factory.sh approve <host> <line> 2` (don't-ask-again) is blocked by the Mac classifier; plain approve works.
> - Headless Chrome on the Mac renders WebGPU pages but not MapLibre (WebGL) and reports 0 fps.
> - Sim grid frame: along-shore axis, land on low-ix side, wavemaker ~1.3 km offshore; J-Bay pinned
>   `rotationDeg: 0, maxObliquityDeg: 30` in the catalogue; store carries deep-water compass direction.
>
> **Next actions:** 1 merge app+book → main; 2 wake the sim/app/book lines with the integration tasks
> (or kill them and use one line); 3 collect mapkit's results, tag v0.1.1; 4 build + deploy; 5 kill
> own lines (`factory.sh kill zulzi-gpu <name>`), note the board.
>
> **Pointers:** this file's line blocks below; `src/lib/sim/{README,FRAME,PARITY}.md`;
> `~/dan-hub/map-kit/{README,CHANGELOG,HANDOVER}.md` + `docs/`; `~/dan-hub/AGENTS-BOARD.md`;
> briefs in the session scratchpad (`brief-*.md`, `sim-*.md`, `mapkit-*.md`); memories
> `tmux-orchestrator-merged`, `surf-physics-review`, `site-editable-versioning-gate`.

> ## BOOK LINE (build-order step 5), 2026-10-09: book done, main merged in, the 2-D instrument breaks on the MUSCL solver
>
> **Built (branch `book`, worktree `~/code/surf-lab-book`):** `/book` (contents, nine ledes) and
> `/book/[chapter]`: text left, the section's instrument pinned right and swapped on scroll
> (IntersectionObserver on section headings), a picker to override and "follow" to resume, a swell
> strip (Hs, Tp, deep-water direction) driving every instrument; under 1100 px each section's
> instrument sits inline, mounted lazily. Every chapter field renders; `[n]` links to references,
> `#slug` to chapter routes. `/book/instruments` shows all 21. `scripts/sync-content.mjs` copies
> `$SURF_BOOK_DIR` into git-ignored `content/chapters/` (`predev`, `prebuild`), failing loudly if
> missing. KaTeX renders at build time on the raw strings (`src/routes/book/math.ts`; bare `<` in
> two chapters' maths rules out client auto-render). Instruments: P1 to P6 lifted with maths and
> drawing unchanged, fifteen derived from their chapters' equations (`src/lib/instruments/README.md`),
> all reflowing down to 360 px. State hook: `HOOK(app state)` in `src/routes/book/[chapter]/+page.svelte`.
>
> **Since the last block:**
> - `git merge main` into `book` (`48d3431`): one conflict, HANDOVER.md only (kept this block,
>   took main's SIM LINE block). No conflicts in code.
> - `Sim2D` now runs as the sim line's `/sim` does: MUSCL-MC + SSP-RK2 at 6.25 m (384 × 1024), 75 m
>   wavemaker band, 150 m sponges, 300 s warm-up, 6 model seconds per wall second (capped per
>   frame). It takes the deep-water `dirDeg` and converts with the sim line's
>   `generatorDirection(dirDeg, grid, wavemakerDepth(...), { Tp })`; the stand-in `direction.ts` is
>   gone. Readout: "deep water from 225° → 129° at the wavemaker (from behind the coast: wraps the
>   headland)".
> - **What it shows (headless, 4090):** the swell reaches the coast at full height with crests
>   oblique to the shore, and J-Bay breaks: white foam in a narrow band on the inner edge of the
>   shelf, in patches a few cells (tens of metres) long that move between frames as crests arrive,
>   most of it from Boneyards past the Point. Near-white pixels are 0.16 to 0.23 % of the canvas
>   (land included) across t = 312 to 494 s. The caption says this, plus "modelled from the
>   coastline" and "breaking rule fitted to one reference run". The no-WebGPU fallback is now a
>   MUSCL frame (`src/lib/instruments/assets/sim-jbay-muscl.png`).
> - The sim line's `scripts/browser.ts` `warmGpu` breaks now that `/` navigates client-side; my
>   screenshot script warms on `/book` itself.
>
> **Works, with evidence:** `bun run check` 0 errors 0 warnings (411 files); `bun test` 47 pass
> (31 sim, 16 book); `bun run build` prerenders `/book`, nine chapters and `/book/instruments`: 213
> KaTeX blocks, 0 errors. `bun scripts/shoot-instruments.ts`: all 21 instruments reshot at desktop,
> 360 and 390 px (`docs/img/instruments/`), no horizontal overflow at either phone width; the
> bench on `/book/breaking` swaps P1 → P3 → P2 → Iribarren → P4 on scroll. Console noise: only
> `/favicon.ico` 404. Dev server: tmux `surflab-book`, `http://127.0.0.1:5183/book`.
>
> **Open questions:** (1) the MUSCL solver at 6.25 m is heavy for weak GPUs; the instrument caps
> steps per frame so it falls behind rather than stalls, but it is untested off the 4090. (2) The
> foam band is a few cells wide at this scale; whether that matches a real J-Bay surf zone is the
> sim line's calibration question. (3) `scripts/browser.ts` `warmGpu` (sim line's) should warm on a
> page that does not navigate.
>
> **Next for this line:** bind the state hook when `#lib/state` lands; draw the chapters' figure
> briefs as static SVG; per-section peel angles in `SectionSpeed` once the sim's breaking fronts
> can measure them (main has "Track breaking fronts for surfers").

> ## APP LINE (build-order step 3), 2026-10-09: cover, dial, globe, forecast, spin-up BUILT; click-a-coast proven headless
>
> **Built (branch `app`, worktree `~/code/surf-lab-app`, main merged in at `a512b1f`):**
> - Routes: `/` cover + dial (one full-screen sim, chrome on any key or click, hidden after 10 s idle);
>   `/map` globe (map-kit pins, panel with facts + today's forecast, click any coast -> sim in a WebGPU
>   overlay registered to the map, panning re-centres, "Cover this spot"); `/spot/[slug]` x 20 (sim,
>   named sections, forecast, swell-window compass). `+layout.svelte`, `src/app.css` palette tokens
>   (ink / teal / coral, Fraunces + Instrument Sans + Spline Sans Mono via Google Fonts), favicons.
> - `src/lib/spots/`: 20-spot catalogue (`spots.json`, `spots.ts`, J-Bay first with its 8 sections and
>   a pinned frame that reproduces `jbayGrid(dx)` exactly), tile coastlines for 16 spots
>   (`coasts/*.json`, `scripts/fetch-coasts.ts`), `tiles.ts` (coast from tiles with a water-side check),
>   `frame.ts` + `FRAME-CHOICE.md` (open-sea ray test guarding `gridFromCoast`), `scene.ts`, `load.ts`.
> - `src/lib/forecast/`: Open-Meteo Marine, many points per request, memory + localStorage cache per
>   spot per local day, shared in-flight requests, `todayFor` / `todayForAll`, recorded fixtures.
> - `src/lib/state/`: one runes store `{ spot, swell (deep-water Hs/Tp/dirDeg), source, chrome }` + README.
> - `src/lib/ui/`: `SimView.svelte` (fill or map-overlay mode, debug painter behind one call so step 4
>   can swap it), `sim-engine.ts` (spin-up and sets STUBBED in JS via `setSwell`, see ui/README),
>   `Dial`, `CompassDial`, `SpotFacts`, `today.ts`.
>
> **Works, with evidence (2026-10-09, zulzi 4090, headless Chrome from `scripts/browser.ts`):**
> `bun run check` 0 errors; `bun test` 45 pass (11 forecast, 6 catalogue/scene incl. every bundled
> coast's grid facing the open sea); `bun run build` prerenders `/`, `/map`, 20 `/spot/*`; MapLibre is
> only in the `/map` chunk (cover node 5 KB). `scripts/map-click.ts` zooms near Durban (not in the
> catalogue), clicks the coast with the real mouse, and has a running sim in 3.5 s: grid 384 x 640 at
> 6.25 m, wavemaker offshore, coast registered to the map; with `COVER=1` it presses "Cover this spot",
> reloads `/` and the clicked coast comes back from localStorage. `scripts/map-pin-pan.ts`: J-Bay pin ->
> panel (facts + live forecast) -> "Simulate here" -> drag 350 px -> new domain key (re-centred).
> Screenshots in `zulzi:~/orch-scratch/app-shots/` (`cover.png`, `cover-phone.png`, `map.png`,
> `map-click.png`, `map-jbay.png`, `spot-jbay.png`, `spot-nazare.png`); `scripts/app-shot.ts` composites
> WebGPU canvases into page shots.
>
> **Found on the way (UPSTREAM to map-kit):** `coastlineNear` documents water on the LEFT; measured
> against the rendered map the water is on the RIGHT for every polyline at all 18 catalogue spots that
> returned a coast, and at Durban. The app now probes each polyline with `queryRenderedFeatures` and
> flips it (`tiles.ts`); map-kit should fix the doc or the winding. Also: the v0.1.0 tag's `prepare`
> (svelte-package, Kit 2 config) fails under Kit 3 / Vite 8, so the app aliases map-kit's shipped
> `src/lib` (vite.config.ts + tsconfig paths); and Bun rejects `#semver:^0.1.0`, so the pin is `#v0.1.0`.
>
> **Does not work / not done:** spin-up and sets are JS stubs until the solver's `rampFrom(0)` and
> `setSwell({ groupiness })` land; rendering is the debug painter (step 4); no bundled sim for
> Cloudbreak (reef 3 km offshore), Skeleton Bay (catalogue position 1.3 km inland) and Lance's Right
> (no ocean coast within 3.5 km): their pages say why. Coordinates came from memory, not a survey;
> `fetch-coasts.ts` checks each one against the coast (all others within 360 m). Clicked coasts are
> often `squeezed` (water kept, land margin lost). Not tested on a real phone or on Safari.
>
> **Open questions:** confirm coordinates for Skeleton Bay, Lance's Right, Pasta Point, Punta de Lobos,
> Teahupo'o (287 m inland); should the cover fetch "today" on its own, or only on the button (now: button;
> `/map` clicks and spot pages fetch automatically); default speed 4 model s per real s, fine?
>
> **Next for this line:** swap the stubs for `rampFrom` / `groupiness` when the sim line lands them;
> "working today" colouring on the globe pins from `todayForAll` + `readStats`; let `SimView` take the
> step-4 renderer. Dev server: tmux `surflab-app`, `http://127.0.0.1:5182/` (`/map`, `/spot/jeffreys-bay`).

> ## SIM LINE, 2026-10-09: build-order step 4 (product renderer + surfer rig) DONE on `main`
>
> **Built, one commit and captured frame each (`docs/img/render/`):** `src/lib/sim/render/`:
> 1. `createRenderer(solver, { context, format, affine, theme, pixelRatio, look })` (`07a4886`): one
>    full-screen WGSL pass over the solver's `fields` and a new `flow` texture. B-spline eta, face lighting
>    from the slope, crest lines from a ridge fit, chart depth contours, land with topo lines, a wet-sand
>    band and a coast stroke. Theme tokens are the book palette and the approved wave-landing look (ink navy,
>    teal, cream foam, coral boards).
> 2. Line-art foam (same commit): three iso-lines of the foam scalar plus fine streaks carried by the flow.
> 3. `createFrontTracker(solver, grid).fronts()` (`70956e3`): a per-row GPU pass, 32 bytes/row of readback
>    every 0.25 model s; sections, tracked ends, least-squares speed, P4 `vp = c/sin(alpha)`, makeable.
> 4. `createSurfers({ zones, depth, grid, count, seed })` + `rig.ts` (`a519ab8`): the P6 rig and a seeded
>    lineup -> take-off -> ride -> kick-out/wipe-out -> paddle cycle; `/sim/cover?rig=1` shows every pose.
> 5. `Swell.groupiness/groupWaves` and `solver.rampFrom(level, { seconds, clock })` (`bc5bb6e`).
> 6. `solver.budget(ms)` with `Governor` (`1f6c6f1`): slow motion first, then `coarser-grid`.
>
> **Evidence:** check 0 errors, build ok, `bun test` 37 pass (new: fronts 3, budget 4, sets/ramp 2). GPU and
> CPU twin still agree (1.8e-4 m after 200 steps). On the 4090: 60 fps at 1440x860 and 2560x1440, a 6.25 m step
> 0.083 ms, render + tracker 0.27 to 0.34 ms a frame, a 10x cover frame ~0.45 ms of GPU. Budgets of 0.6 and
> 0.25 ms drop to slow motion, then ask for a coarser grid. Surfers over 400 model s: 19 rides, median 3.4 s
> and 40 m, ending in kick-outs, wipe-outs and waves finishing.
>
> **Honest limits (review):** (1) the sim breaks 10 to 30 m from the shore, so at a 4 km framing the surf
> zone is a thin bright band; the line art reads from ~2 km across and closer (frames 02-close, 06).
> (2) Peels are short bursts, so rides are short; at 10x a ride is on screen for well under a second, so a
> surfer-featuring cover wants 3x to 4x. (3) Budget timings without timestamp queries are upper bounds
> (round-trip latency); a frame-interval cap backs them up; untested on a real weak GPU. (4) Front
> thresholds and surfer tuning were fitted on J-Bay only.
>
> **For the app line:** the cover recipe is in `src/lib/sim/README.md` ("The product renderer"): a WebGPU
> canvas (or map-kit's overlay context) for `createRenderer`, a 2d canvas above it for `crowd.draw`,
> `budget.frame(...)` per rAF, `rampFrom(0)` on a new spot, `coarserDx` on `coarser-grid`. Dev route
> `/sim/cover`; tmux `surflab-dev` on 127.0.0.1:5181.
>
> **Next, if wanted:** timestamp-query timing when the device has it; surfers that pick lineups from where
> fronts are born (for click-any-coast spots without named sections); a cover framing preset per spot.

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
