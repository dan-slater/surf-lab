// Shared by step.wgsl (first order) and muscl.wgsl (MUSCL + SSP-RK2): the
// uniforms, the bindings and `finish`, which applies friction, foam, the
// breaking trigger, the relaxation wavemaker and the along-shore sponges to a
// flux update. The CPU twin in cpu.ts mirrors these files; change both.
//
// Layout: idx = ix * ny + iy. state = (h, hu, hv, foam). bed = zb (m, water < 0).

struct Params {
  nx: u32, ny: u32, ncomp: u32, breakHmin: f32,
  dx: f32, dt: f32, g: f32, manning: f32,
  t: f32, relaxW: f32, relaxMax: f32, spongeW: f32,
  spongeRate: f32, breakH: f32, froudeT: f32, steepT: f32,
  depthLimT: f32, foamDecay: f32, envPeriod: f32, envDepth: f32,
};

struct Comp { kx: f32, ky: f32, omega: f32, amp: f32, phase: f32, p0: f32, p1: f32, p2: f32 };

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read>       bed:      array<f32>;
// state at the start of the step (Un)
@group(0) @binding(2) var<storage, read>       stateIn:  array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> stateOut: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read>       comps:    array<Comp>;
// RK stage U1 (muscl.wgsl stage 2 only; bound to stateIn otherwise)
@group(0) @binding(5) var<storage, read>       stage:    array<vec4<f32>>;

fn cidx(ix: i32, iy: i32) -> u32 {
  let cx = clamp(ix, 0, i32(P.nx) - 1);
  let cy = clamp(iy, 0, i32(P.ny) - 1);
  return u32(cx) * P.ny + u32(cy);
}
fn vel(m: f32, h: f32) -> f32 {
  if (h > 1e-3) { return m / h; }
  return 0.0;
}

// Friction, foam, breaking, wavemaker and sponge for cell (ixi, iyi), given
// the flux update (nh0, nhu0, nhv0). Foam transport and the breaking slope use
// stateIn (the start of the step).
fn finish(ixi: i32, iyi: i32, nh0: f32, nhu0: f32, nhv0: f32) -> vec4<f32> {
  var nh = nh0; var nhu = nhu0; var nhv = nhv0;
  let C  = stateIn[cidx(ixi, iyi)];   let zbC = bed[cidx(ixi, iyi)];
  let Rr = stateIn[cidx(ixi+1, iyi)]; let Ll = stateIn[cidx(ixi-1, iyi)];
  let Uu = stateIn[cidx(ixi, iyi+1)]; let Dd = stateIn[cidx(ixi, iyi-1)];
  let etaC = C.x + zbC;
  let etaR = Rr.x + bed[cidx(ixi+1, iyi)]; let etaL = Ll.x + bed[cidx(ixi-1, iyi)];
  let etaU = Uu.x + bed[cidx(ixi, iyi+1)]; let etaD = Dd.x + bed[cidx(ixi, iyi-1)];
  let foam = C.w;
  let uC = vel(C.y, C.x); let vC = vel(C.z, C.x);
  let r = P.dt / P.dx;

  // wet/dry + Manning friction (semi-implicit)
  if (nh < 1e-3) {
    nh = max(nh, 0.0); nhu = 0.0; nhv = 0.0;
  } else {
    let u = nhu / nh; let v = nhv / nh; let sp = sqrt(u*u + v*v);
    let cf = P.g * P.manning * P.manning * sp / pow(nh, 4.0/3.0);
    let denom = 1.0 + P.dt * cf;
    nhu = nhu / denom; nhv = nhv / denom;
  }

  // foam: donor-cell advection + decay + breaking source
  var fx: f32; if (uC > 0.0) { fx = uC * (foam - Ll.w); } else { fx = uC * (Rr.w - foam); }
  var fy: f32; if (vC > 0.0) { fy = vC * (foam - Dd.w); } else { fy = vC * (Uu.w - foam); }
  var nf = foam - r * (fx + fy);
  nf = nf * P.foamDecay;
  if (nh > P.breakHmin && nh < P.breakH) {
    let u = vel(nhu, nh); let v = vel(nhv, nh); let sp = sqrt(u*u + v*v);
    let froude = sp / sqrt(P.g * nh);
    let steep = 0.5 * sqrt((etaR-etaL)*(etaR-etaL) + (etaU-etaD)*(etaU-etaD)) / P.dx;
    let depthLim = etaC / nh;
    if (froude > P.froudeT || steep > P.steepT || depthLim > P.depthLimT) { nf = max(nf, 1.0); }
  }
  nf = clamp(nf, 0.0, 1.0);

  let dC = -zbC;   // still-water depth (> 0 in the ocean)

  // offshore (+ix) wavemaker: relax toward the linear target of all components
  let band = f32(P.nx - 1u) - f32(ixi);
  if (band < P.relaxW && dC > 0.5) {
    let x = f32(ixi) * P.dx; let y = f32(iyi) * P.dx;
    let env = 1.0 + P.envDepth * 0.5 * (sin(6.2831853 * P.t / max(P.envPeriod, 1.0)) - 1.0);
    let c = sqrt(P.g / dC);
    var etaT = 0.0; var uT = 0.0; var vT = 0.0;
    for (var i = 0u; i < P.ncomp; i++) {
      let k = comps[i];
      let e = env * k.amp * cos(k.kx * x + k.ky * y - k.omega * P.t + k.phase);
      let kmag = sqrt(k.kx * k.kx + k.ky * k.ky) + 1e-9;
      etaT += e;
      uT += e * c * k.kx / kmag;
      vT += e * c * k.ky / kmag;
    }
    let hT = max(0.0, dC + etaT);
    let a = P.relaxMax * (1.0 - band / P.relaxW);   // strongest at the edge
    nh  = mix(nh,  hT,      a);
    nhu = mix(nhu, hT * uT, a);
    nhv = mix(nhv, hT * vT, a);
  }

  // along-shore sponges (iy = 0 and iy = ny - 1)
  let sN = f32(iyi);
  let sS = f32(P.ny - 1u) - f32(iyi);
  var damp = 0.0;
  if (sN < P.spongeW) { damp = max(damp, 1.0 - sN / P.spongeW); }
  if (sS < P.spongeW) { damp = max(damp, 1.0 - sS / P.spongeW); }
  if (damp > 0.0 && dC > 0.5) {
    let b = P.spongeRate * damp;
    nhu = nhu * (1.0 - b);
    nhv = nhv * (1.0 - b);
    nh  = mix(nh, dC, b * 0.5);
  }
  return vec4<f32>(nh, nhu, nhv, nf);
}
