// The product sea: one fragment pass over the solver's fields and flow
// textures. Water is depth-tinted (shallow teal-navy to deep ink) and lit by a
// directional light through the surface slope, so crest faces catch light and
// troughs fall into shadow. Crest lines are drawn where eta peaks along the
// local direction of travel; foam is drawn as line art (iso-lines of the foam
// scalar plus short streaks carried by the flow). Land is flat theme colour
// with faint topo lines, a soft wet-sand band and a coastline stroke.
//
// Everything is anti-aliased with screen-space derivatives (fwidth), so line
// widths stay in pixels at any zoom.

struct View {
  row0: vec4<f32>,    // grid (ix, iy, 1) -> clip x
  row1: vec4<f32>,    // grid (ix, iy, 1) -> clip y
  dims: vec4<f32>,    // nx, ny, dx (m), device pixels per CSS pixel
  light: vec4<f32>,   // light direction in grid space (x along +ix, y along +iy, z up), strength
  look: vec4<f32>,    // time (s), Hs (m), slope exaggeration, crest line width (px)
  foamLook: vec4<f32>,// foam line width (px), streak density, streak length (cells), foam opacity
  swell: vec4<f32>,   // fallback travel direction in grid space (x, y), unused, unused
  inv0: vec4<f32>,    // clip (x, y, 1) -> grid ix
  inv1: vec4<f32>,    // clip (x, y, 1) -> grid iy
};

struct Theme {
  ink: vec4<f32>, ink2: vec4<f32>, land: vec4<f32>, coast: vec4<f32>,
  teal: vec4<f32>, tealHi: vec4<f32>, foam: vec4<f32>, accent: vec4<f32>, sand: vec4<f32>,
};

@group(0) @binding(0) var<uniform> V: View;
@group(0) @binding(1) var<uniform> T: Theme;
@group(0) @binding(2) var fields: texture_2d<f32>;
@group(0) @binding(3) var flow: texture_2d<f32>;
@group(0) @binding(4) var samp: sampler;

struct VOut { @builtin(position) pos: vec4<f32>, @location(0) g: vec2<f32> };

// a full-screen triangle; each pixel finds its grid coordinates through the
// inverse of the view affine, so the canvas is covered even past the grid
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  let c = vec3<f32>(p[vi], 1.0);
  var o: VOut;
  o.pos = vec4<f32>(c.xy, 0.0, 1.0);
  o.g = vec2<f32>(dot(V.inv0.xyz, c), dot(V.inv1.xyz, c));
  return o;
}

// fields at grid coordinates (cell centres at integers)
fn F(g: vec2<f32>) -> vec4<f32> {
  return textureSampleLevel(fields, samp, (g + 0.5) / V.dims.xy, 0.0);
}
// cubic B-spline reconstruction from four bilinear taps (C2 continuous, so
// slopes and curvatures do not jump at cell edges); used for eta
fn Fs(g: vec2<f32>) -> vec4<f32> {
  let tc = g;
  let f0 = floor(tc);
  let fr = tc - f0;
  let fr2 = fr * fr; let fr3 = fr2 * fr;
  let w0 = (1.0 - fr) * (1.0 - fr) * (1.0 - fr) / 6.0;
  let w1 = (4.0 - 6.0 * fr2 + 3.0 * fr3) / 6.0;
  let w2 = (1.0 + 3.0 * fr + 3.0 * fr2 - 3.0 * fr3) / 6.0;
  let w3 = fr3 / 6.0;
  let s0 = w0 + w1; let s1 = w2 + w3;
  let o0 = f0 - 1.0 + w1 / s0;
  let o1 = f0 + 1.0 + w3 / s1;
  return s0.x * s0.y * F(vec2<f32>(o0.x, o0.y)) + s1.x * s0.y * F(vec2<f32>(o1.x, o0.y))
       + s0.x * s1.y * F(vec2<f32>(o0.x, o1.y)) + s1.x * s1.y * F(vec2<f32>(o1.x, o1.y));
}
fn U(g: vec2<f32>) -> vec2<f32> {
  return textureSampleLevel(flow, samp, (g + 0.5) / V.dims.xy, 0.0).xy;
}
fn hash2(p: vec2<f32>) -> vec2<f32> {
  let q = vec2<f32>(dot(p, vec2<f32>(127.1, 311.7)), dot(p, vec2<f32>(269.5, 183.3)));
  return fract(sin(q) * 43758.5453);
}
// anti-aliased line: 1 on an iso-line of f at level L, w pixels wide
fn isoLine(f: f32, L: f32, fw: f32, w: f32) -> f32 {
  return 1.0 - smoothstep(0.5 * w, 0.5 * w + 1.0, abs(f - L) / max(fw, 1e-6));
}
// distance (in the units of p) from p to the segment a-b
fn segDist(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
  let ab = b - a;
  let t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-9), 0.0, 1.0);
  return length(p - a - t * ab);
}

@fragment fn fs(@location(0) g: vec2<f32>) -> @location(0) vec4<f32> {
  let f = F(g);
  let fs = Fs(g);
  let h = f.y; let zb = f.w;
  let eta = fs.x;
  let foam = clamp(fs.z, 0.0, 1.0);
  // how far outside the grid this pixel is (cells); fade the motion out there
  let outside = max(max(-0.5 - g.x, g.x - (V.dims.x - 0.5)), max(-0.5 - g.y, g.y - (V.dims.y - 0.5)));
  let inside = 1.0 - smoothstep(0.0, 24.0, outside);
  let depth = -zb;
  // screen-space scale: grid cells per device pixel, and derivatives of the
  // fields used for iso-lines (all taken in uniform control flow)
  let cellsPerPx = max(length(fwidth(g)), 1e-4);
  let fwDepth = fwidth(depth);
  let fwFoam = fwidth(foam);
  let fwZb = fwidth(zb);
  let t = V.look.x;
  let Hs = max(V.look.y, 0.3);

  // ---- land ----
  let wet = smoothstep(0.02, 0.12, h);
  var land = T.land.rgb;
  // faint topo lines every 4 m of elevation
  let topo = isoLine(fract(zb / 4.0 + 0.5), 0.5, fwZb / 4.0, 1.0) * step(1.0, zb);
  land = mix(land, T.teal.rgb, 0.06 * topo * (1.0 - smoothstep(0.0, 2.0, outside)));
  // wet sand: a soft band just above the still-water line
  land = mix(land, T.sand.rgb, (1.0 - smoothstep(0.0, 0.8, zb)) * 0.7);

  // ---- water ----
  // depth tint: shallow ink2 lifted toward teal in the last few metres
  var water = mix(T.ink2.rgb, T.ink.rgb, smoothstep(2.0, 28.0, depth));
  water = mix(water, T.teal.rgb, 0.10 * (1.0 - smoothstep(0.5, 6.0, depth)));

  // surface slope from central differences (one cell each way)
  let ex = (Fs(g + vec2<f32>(1.0, 0.0)).x - Fs(g - vec2<f32>(1.0, 0.0)).x) / (2.0 * V.dims.z);
  let ey = (Fs(g + vec2<f32>(0.0, 1.0)).x - Fs(g - vec2<f32>(0.0, 1.0)).x) / (2.0 * V.dims.z);
  let k = V.look.z * inside;
  let n = normalize(vec3<f32>(-ex * k, -ey * k, 1.0));
  let L = normalize(V.light.xyz);
  let lit = dot(n, L) - L.z;              // 0 on flat water
  water = water + T.teal.rgb * max(lit, 0.0) * V.light.w;      // faces catch light
  water = water * (1.0 + min(lit, 0.0) * 1.6 * V.light.w);      // backs and troughs in shadow

  // crest lines: eta peaks along the local direction of travel. The ridge is
  // found from a parabola through eta at -2, 0 and +2 cells, with the centre
  // value itself averaged across the crest; a 1-cell stencil follows the
  // solver's few-millimetre grid-scale ripple and draws wobbly lines.
  var dir = U(g);
  if (length(dir) < 0.05) { dir = V.swell.xy; }
  dir = normalize(dir);
  let side = vec2<f32>(-dir.y, dir.x);
  let ec = 0.5 * eta + 0.25 * (Fs(g + side).x + Fs(g - side).x);
  let ep = 0.5 * (Fs(g + 2.0 * dir + side).x + Fs(g + 2.0 * dir - side).x);
  let em = 0.5 * (Fs(g - 2.0 * dir + side).x + Fs(g - 2.0 * dir - side).x);
  let d1 = 0.5 * (ep - em);
  let d2 = ep - 2.0 * ec + em;
  var crest = 0.0;
  if (d2 < 0.0) {
    let distCells = 2.0 * abs(d1 / d2);            // cells to the ridge
    let px = distCells / cellsPerPx;
    crest = 1.0 - smoothstep(0.5 * V.look.w, 0.5 * V.look.w + 1.0, px);
  }
  let shoal = 1.0 - smoothstep(1.5, 22.0, depth);
  crest = crest * smoothstep(0.03 * Hs, 0.25 * Hs, eta) * (0.35 + 0.65 * shoal) * inside;
  let crestCol = mix(T.teal.rgb, T.tealHi.rgb, shoal);
  water = mix(water, crestCol, crest * (0.30 + 0.45 * shoal));

  // faint depth contours (chart lines): 3, 10 and 20 m
  let chart = 0.10 * isoLine(depth, 3.0, fwDepth, 1.0) + 0.08 * isoLine(depth, 10.0, fwDepth, 1.0)
            + 0.06 * isoLine(depth, 20.0, fwDepth, 1.0);
  water = mix(water, T.teal.rgb, chart);

  // ---- foam, as line art ----
  let fo = V.foamLook.w;
  let lw = V.foamLook.x;
  var ink = 0.0;
  // iso-lines of the (smoothed) foam scalar: three nested outlines where it is
  // fresh, one fading outline as it decays
  ink = max(ink, 0.35 * isoLine(foam, 0.15, fwFoam, lw * 0.8));
  ink = max(ink, 0.55 * isoLine(foam, 0.40, fwFoam, lw));
  ink = max(ink, 0.80 * isoLine(foam, 0.75, fwFoam, lw));
  // streaks: fine dashes on a jittered lattice, oriented and carried by the
  // flow, more of them and longer where the foam is fresh
  let tile = V.foamLook.z;                         // lattice spacing (cells)
  let gt = g / tile;
  let base = floor(gt);
  var streak = 0.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let cell = base + vec2<f32>(f32(i), f32(j));
      let r = hash2(cell);
      let c0 = (cell + r) * tile;                  // seed in grid cells
      let fs0 = F(c0).z;
      if (fs0 < 0.1 || r.x > V.foamLook.y * fs0) { continue; }
      let u = U(c0);
      let sp = length(u);
      if (sp < 0.1) { continue; }
      let ud = u / sp;
      // drift along the flow, recycling over two lattice spacings
      let travel = (fract(t * sp / (2.0 * tile * V.dims.z) + r.y) * 2.0 - 1.0) * tile;
      let a = c0 + ud * travel;
      let len = tile * (0.35 + 0.5 * fs0);
      let dpx = segDist(g, a, a + ud * len) / cellsPerPx;
      let w = 0.35 * lw;
      streak = max(streak, (1.0 - smoothstep(w, w + 1.0, dpx)) * 0.55 * fs0);
    }
  }
  ink = max(ink, streak);
  // a pale wash under fresh foam so whitewater still reads as a mass
  let wash = 0.16 * smoothstep(0.25, 1.0, foam);
  water = mix(water, T.foam.rgb, clamp(ink * fo + wash * fo, 0.0, 1.0) * inside);

  var col = mix(land, water, wet);
  // coastline stroke on the still-water line
  col = mix(col, T.coast.rgb, 0.45 * isoLine(zb, 0.0, fwZb, 1.2));
  return vec4<f32>(col, 1.0);
}
