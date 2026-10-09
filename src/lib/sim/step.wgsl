// One explicit step of the nonlinear shallow-water equations.
// Port of Run C (surf-sim/webgpu/demo.template.html): first-order HLL fluxes,
// Audusse hydrostatic reconstruction (well-balanced, wet/dry), semi-implicit
// Manning friction, a foam scalar, a relaxation wavemaker on the +ix edge and
// sponges on the iy = 0 and iy = ny - 1 edges. Changes from Run C: the swell
// is a list of components in a storage buffer instead of baked constants, and
// thresholds that were constants are uniforms. The CPU twin in cpu.ts mirrors
// this file line for line; change both together.
//
// Layout: idx = ix * ny + iy. state = (h, hu, hv, foam). bed = zb (m, water < 0).

struct Params {
  nx: u32, ny: u32, ncomp: u32, pad0: u32,
  dx: f32, dt: f32, g: f32, manning: f32,
  t: f32, relaxW: f32, relaxMax: f32, spongeW: f32,
  spongeRate: f32, breakH: f32, froudeT: f32, steepT: f32,
  depthLimT: f32, foamDecay: f32, envPeriod: f32, envDepth: f32,
};

struct Comp { kx: f32, ky: f32, omega: f32, amp: f32, phase: f32, p0: f32, p1: f32, p2: f32 };

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read>       bed:      array<f32>;
@group(0) @binding(2) var<storage, read>       stateIn:  array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> stateOut: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read>       comps:    array<Comp>;

fn cidx(ix: i32, iy: i32) -> u32 {
  let cx = clamp(ix, 0, i32(P.nx) - 1);
  let cy = clamp(iy, 0, i32(P.ny) - 1);
  return u32(cx) * P.ny + u32(cy);
}
fn vel(m: f32, h: f32) -> f32 {
  if (h > 1e-3) { return m / h; }
  return 0.0;
}
// HLL flux, x-split. U = (h, hu, hv); normal momentum = hu.
fn fluxX(UL: vec3<f32>, UR: vec3<f32>) -> vec3<f32> {
  let hL = UL.x; let hR = UR.x;
  if (hL <= 1e-4 && hR <= 1e-4) { return vec3<f32>(0.0); }
  let uL = vel(UL.y, hL); let uR = vel(UR.y, hR);
  let vL = vel(UL.z, hL); let vR = vel(UR.z, hR);
  let cL = sqrt(P.g * hL); let cR = sqrt(P.g * hR);
  let SL = min(uL - cL, uR - cR);
  let SR = max(uL + cL, uR + cR);
  let FL = vec3<f32>(UL.y, UL.y * uL + 0.5 * P.g * hL * hL, UL.y * vL);
  let FR = vec3<f32>(UR.y, UR.y * uR + 0.5 * P.g * hR * hR, UR.y * vR);
  if (SL >= 0.0) { return FL; }
  if (SR <= 0.0) { return FR; }
  return (SR * FL - SL * FR + SL * SR * (UR - UL)) / (SR - SL);
}
// HLL flux, y-split. Normal momentum = hv.
fn fluxY(UL: vec3<f32>, UR: vec3<f32>) -> vec3<f32> {
  let hL = UL.x; let hR = UR.x;
  if (hL <= 1e-4 && hR <= 1e-4) { return vec3<f32>(0.0); }
  let uL = vel(UL.y, hL); let uR = vel(UR.y, hR);
  let vL = vel(UL.z, hL); let vR = vel(UR.z, hR);
  let cL = sqrt(P.g * hL); let cR = sqrt(P.g * hR);
  let SL = min(vL - cL, vR - cR);
  let SR = max(vL + cL, vR + cR);
  let FL = vec3<f32>(UL.z, UL.z * uL, UL.z * vL + 0.5 * P.g * hL * hL);
  let FR = vec3<f32>(UR.z, UR.z * uR, UR.z * vR + 0.5 * P.g * hR * hR);
  if (SL >= 0.0) { return FL; }
  if (SR <= 0.0) { return FR; }
  return (SR * FL - SL * FR + SL * SR * (UR - UL)) / (SR - SL);
}

@compute @workgroup_size(16, 16)
fn step(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.nx || gid.y >= P.ny) { return; }
  let ixi = i32(gid.x); let iyi = i32(gid.y);

  let C  = stateIn[cidx(ixi, iyi)];   let zbC = bed[cidx(ixi, iyi)];
  let Rr = stateIn[cidx(ixi+1, iyi)]; let zbR = bed[cidx(ixi+1, iyi)];
  let Ll = stateIn[cidx(ixi-1, iyi)]; let zbL = bed[cidx(ixi-1, iyi)];
  let Uu = stateIn[cidx(ixi, iyi+1)]; let zbU = bed[cidx(ixi, iyi+1)];
  let Dd = stateIn[cidx(ixi, iyi-1)]; let zbD = bed[cidx(ixi, iyi-1)];

  let h = C.x; let hu = C.y; let hv = C.z; let foam = C.w;
  let etaC = h + zbC;
  let etaR = Rr.x + zbR; let etaL = Ll.x + zbL;
  let etaU = Uu.x + zbU; let etaD = Dd.x + zbD;

  let uC = vel(hu, h); let vC = vel(hv, h);

  // x interfaces (Audusse hydrostatic reconstruction)
  let zbfR = max(zbC, zbR);
  let hCp = max(0.0, etaC - zbfR);
  let hRp = max(0.0, etaR - zbfR);
  let Fp = fluxX(vec3<f32>(hCp, hCp*uC, hCp*vC),
                 vec3<f32>(hRp, hRp*vel(Rr.y,Rr.x), hRp*vel(Rr.z,Rr.x)));
  let zbfL = max(zbL, zbC);
  let hLm = max(0.0, etaL - zbfL);
  let hCm = max(0.0, etaC - zbfL);
  let Fm = fluxX(vec3<f32>(hLm, hLm*vel(Ll.y,Ll.x), hLm*vel(Ll.z,Ll.x)),
                 vec3<f32>(hCm, hCm*uC, hCm*vC));
  // y interfaces
  let zbfU = max(zbC, zbU);
  let hCu = max(0.0, etaC - zbfU);
  let hUu = max(0.0, etaU - zbfU);
  let Gp = fluxY(vec3<f32>(hCu, hCu*uC, hCu*vC),
                 vec3<f32>(hUu, hUu*vel(Uu.y,Uu.x), hUu*vel(Uu.z,Uu.x)));
  let zbfD = max(zbD, zbC);
  let hDd = max(0.0, etaD - zbfD);
  let hCd = max(0.0, etaC - zbfD);
  let Gm = fluxY(vec3<f32>(hDd, hDd*vel(Dd.y,Dd.x), hDd*vel(Dd.z,Dd.x)),
                 vec3<f32>(hCd, hCd*uC, hCd*vC));

  let r = P.dt / P.dx;
  var nh  = h  - r * ((Fp.x - Fm.x) + (Gp.x - Gm.x));
  var nhu = hu - r * ((Fp.y - Fm.y) + (Gp.y - Gm.y));
  var nhv = hv - r * ((Fp.z - Fm.z) + (Gp.z - Gm.z));
  // well-balanced bed source (cancels the flux pressure imbalance at rest)
  nhu = nhu - r * (0.5 * P.g * (hCm*hCm - hCp*hCp));
  nhv = nhv - r * (0.5 * P.g * (hCd*hCd - hCu*hCu));

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
  // Breaking trigger. Run C loosened Run A's thresholds (steepness 0.40,
  // Froude 0.60) because a first-order 12.5 m scheme diffuses the swell below
  // true breaking; the depth-limited term eta/h ~ H/d does most of the work.
  if (nh > 0.05 && nh < P.breakH) {
    let u = vel(nhu, nh); let v = vel(nhv, nh); let sp = sqrt(u*u + v*v);
    let froude = sp / sqrt(P.g * nh);
    let steep = 0.5 * sqrt((etaR-etaL)*(etaR-etaL) + (etaU-etaD)*(etaU-etaD)) / P.dx;
    let depthLim = etaC / nh;
    if (froude > P.froudeT || steep > P.steepT || depthLim > P.depthLimT) { nf = max(nf, 1.0); }
  }
  nf = clamp(nf, 0.0, 1.0);

  let dC = -zbC;   // still-water depth (> 0 in the ocean)

  // offshore (+ix) wavemaker: relax toward the linear target of all components
  let band = f32(P.nx - 1u) - f32(gid.x);
  if (band < P.relaxW && dC > 0.5) {
    let x = f32(gid.x) * P.dx; let y = f32(gid.y) * P.dx;
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
  let sN = f32(gid.y);
  let sS = f32(P.ny - 1u) - f32(gid.y);
  var damp = 0.0;
  if (sN < P.spongeW) { damp = max(damp, 1.0 - sN / P.spongeW); }
  if (sS < P.spongeW) { damp = max(damp, 1.0 - sS / P.spongeW); }
  if (damp > 0.0 && dC > 0.5) {
    let b = P.spongeRate * damp;
    nhu = nhu * (1.0 - b);
    nhv = nhv * (1.0 - b);
    nh  = mix(nh, dC, b * 0.5);
  }

  stateOut[cidx(ixi, iyi)] = vec4<f32>(nh, nhu, nhv, nf);
}
