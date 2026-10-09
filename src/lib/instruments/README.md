# instruments

Interactive canvas figures that sit beside the Surf Physics Review text
(`/book`). Each is a Svelte 5 component that takes the swell props
`{ Hs, Tp, dirDeg, spot? }` (offshore significant height, peak period, compass
direction the swell comes from, and an ENU spot; J-Bay, 2.5 m, 15 s, 225° by
default) plus a few optional extras from its chapter's worked numbers.

Screenshots of every instrument: [`docs/img/instruments/`](../../../docs/img/instruments/).
All of them on one page: `/book/instruments`.

## Lifted from the research notes

`surf-sim/making-of-research.html` held six working demos. They are ported with
the maths and drawing code unchanged (same expressions, same logical canvas
size); only colours and fonts were moved to CSS tokens and the DOM sliders to
Svelte state. Rendered headless against the original at the same inputs, P1
and P3 give identical readouts and P5 the same time step.

| file | what |
|---|---|
| `P1Dispersion.svelte` | linear dispersion by Newton, phase and group speed, shoaling factor against depth |
| `P2Snell.svelte` | plane-beach refraction (Snell), break depth from H₀K<sub>s</sub>K<sub>r</sub> = 0.78 d, Iribarren |
| `P3Rays.svelte` | wave rays and crest isochrones over the real J-Bay coastline (OSM, ODbL) |
| `P4Peel.svelte` | peel angle and makeability, V<sub>p</sub> = c / sin α, animated |
| `P5Nswe.svelte` | live 1-D nonlinear shallow-water surf zone (HLL + Audusse) |
| `P6Rig.svelte` | surfer pose rig: FK upper body, two-bone IK legs, six key poses |

## Derived from the chapters

Small instruments built only from equations and numbers their chapter states.
Where the chapter is silent (the shape of lift past stall, per-section peel
angles at J-Bay) the instrument says so on the canvas or in its caption rather
than inventing a value.

| file | chapter | equations |
|---|---|---|
| `SwellArrival.svelte` | swell | t = 4πX / gT; T<sub>group</sub> = T / (Δf/f) |
| `SwellPower.svelte` | swell | P = ρg²H<sub>s</sub>²T<sub>p</sub> / 64π; wave base gT² / 4π |
| `Iribarren.svelte` | breaking | ξ₀ = tan α / √(H₀/L₀) |
| `Sim2D.svelte` | breaking | the WebGPU solver in `src/lib/sim` on J-Bay; a captured frame without WebGPU |
| `CatchGap.svelte` | catching | c<sub>b</sub> = √(2gH<sub>b</sub>); d = (c − u₀)² / 2g sin θ |
| `Refraction.svelte` | day | sin a / sin a₀ = c / c₀; K<sub>R</sub>; H = H₀K<sub>R</sub>K<sub>S</sub> |
| `Tide.svelte` | day | h<sub>b</sub> = 1.28H<sub>b</sub> on a 1:50 / 1:15 profile, sinusoidal tide, ξ₀ at the break |
| `RipPulse.svelte` | day | U<sub>rms,ig</sub> = η√(g/h) plus a mean |
| `HeightStats.svelte` | day | Rayleigh heights, H<sub>rms</sub>, H<sub>s</sub>√(½ ln N), 0.75 d cap |
| `EffectiveFlow.svelte` | riding | V<sub>w</sub>(h) = √(V<sub>crest</sub>² + 2g(H − h)) |
| `SectionSpeed.svelte` | riding, turns | c<sub>b</sub> / sin α against c<sub>b</sub> + √(2gH<sub>b</sub>), J-Bay sections |
| `FaceAccel.svelte` | riding | ½g sin 2θ; P = Mc g sin θ cos θ |
| `BankedTurn.svelte` | turns | R = v² / g tan θ; N/Mg = 1/cos θ; s = Rφ; W = MgΔh / cos θ; \|Δv\| |
| `BoardPlaning.svelte` | board, catching | 1.34√L knots; F<sub>n</sub>; A = W / ½ρU²C<sub>L</sub>; D; L/D = cot α |
| `FinLift.svelte` | fins | C<sub>L</sub>(α) peaks reported; L = ½ρv²AC<sub>L</sub>; σ |

The review's shoaling chain (H<sub>b</sub> from H<sub>s</sub> and T<sub>p</sub>,
h<sub>b</sub> = 1.28H<sub>b</sub>, c<sub>b</sub> = √(2gH<sub>b</sub>)) lives in
`physics.ts` with the lifted dispersion maths; `instruments.test.ts` checks it
against the chapters' worked examples.

## Plumbing

- `index.ts`: the components, `INSTRUMENTS` (id → component and name), and
  re-exports from `map.ts`.
- `map.ts`: `instrumentFor(chapterSlug, sectionIndex)` → a list of
  `{ id, caption, props? }` (first is shown, the rest are tabs; empty keeps the
  previous instrument), `instrumentsInChapter(slug)` for the picker, and
  `CHAPTER_SWELL` for chapters whose worked examples share one swell.
- `stage.ts`, `use-stage.svelte.ts`: a fixed logical canvas size scaled to the
  CSS width times devicePixelRatio, redrawn on resize, DPR change and any
  reactive input; animation loops pause off screen.
- `palette.ts`: colours and the mono face from CSS custom properties
  (`--ink`, `--teal`, `--coral`, ...; see `src/routes/book/tokens.css`).
- `Frame.svelte`, `Slider.svelte`, `plot.ts`: the card, a labelled range, and
  small chart helpers.
