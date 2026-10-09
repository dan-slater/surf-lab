// Second-order step (scheme 'muscl'), a port of Run A's core
// (surf-sim/solver/swe2d.py compute_L, _euler, _combine): MC-limited MUSCL
// reconstruction of (w = h + zb, zb, u, v), first order next to cells
// shallower than HWET, Audusse hydrostatic reconstruction on the face states,
// HLL flux, SSP-RK2 as two dispatches:
//   stage1: U1 = Un + dt L(Un)                      (stateIn -> stateOut = stage buffer)
//   stage2: U  = 0.5 Un + 0.5 (U1 + dt L(U1)), then common.wgsl's finish
// Prepended with common.wgsl at pipeline creation. Mirrored in cpu.ts.

const HWET: f32 = 0.10;
const DRY: f32 = 1e-4;

struct Prim { w: f32, zb: f32, u: f32, v: f32, h: f32 };

fn load(ix: i32, iy: i32, useStage: bool) -> Prim {
  let i = cidx(ix, iy);
  var s: vec4<f32>;
  if (useStage) { s = stage[i]; } else { s = stateIn[i]; }
  let zb = bed[i];
  var u = 0.0; var v = 0.0;
  if (s.x > DRY) { u = s.y / s.x; v = s.z / s.x; }
  return Prim(s.x + zb, zb, u, v, s.x);
}

// MC (monotonised central) limiter: zero slope at rest, so well-balanced
fn mc(qm: f32, q0: f32, qp: f32) -> f32 {
  let a = qp - q0; let b = q0 - qm;
  if (a * b <= 0.0) { return 0.0; }
  let c = 0.5 * (a + b);
  return sign(c) * min(min(2.0 * abs(a), 2.0 * abs(b)), abs(c));
}

// edge value of cell c toward side (+1 / -1): (w, zb, u, v)
fn recon(m: Prim, c: Prim, p: Prim, side: f32) -> vec4<f32> {
  var f = 0.5 * side;
  if (m.h < HWET || c.h < HWET || p.h < HWET) { f = 0.0; }
  return vec4<f32>(c.w + f * mc(m.w, c.w, p.w), c.zb + f * mc(m.zb, c.zb, p.zb),
                   c.u + f * mc(m.u, c.u, p.u), c.v + f * mc(m.v, c.v, p.v));
}

struct Face { m: f32, n: f32, t: f32, sL: f32, sR: f32 };

// HLL on a face from reconstructed left and right edge states. xdir: the
// normal velocity is u (x faces) or v (y faces). Returns mass, normal and
// transverse momentum fluxes and the Audusse corrections for each side.
fn face(L: vec4<f32>, R: vec4<f32>, xdir: bool) -> Face {
  let heL = max(0.0, L.x - L.y); let heR = max(0.0, R.x - R.y);
  let zst = max(L.y, R.y);
  let hsL = max(0.0, L.x - zst); let hsR = max(0.0, R.x - zst);
  let unL = select(L.w, L.z, xdir); let utL = select(L.z, L.w, xdir);
  let unR = select(R.w, R.z, xdir); let utR = select(R.z, R.w, xdir);
  let cL = sqrt(P.g * hsL); let cR = sqrt(P.g * hsR);
  let SL = min(min(unL - cL, unR - cR), 0.0);
  let SR = max(max(unL + cL, unR + cR), 0.0);
  var o = Face(0.0, 0.0, 0.0, 0.5 * P.g * (heL * heL - hsL * hsL), 0.5 * P.g * (heR * heR - hsR * hsR));
  if (SR - SL > 1e-8) {
    let inv = 1.0 / (SR - SL);
    let FLm = hsL * unL; let FRm = hsR * unR;
    let FLn = hsL * unL * unL + 0.5 * P.g * hsL * hsL; let FRn = hsR * unR * unR + 0.5 * P.g * hsR * hsR;
    let FLt = hsL * unL * utL; let FRt = hsR * unR * utR;
    o.m = (SR * FLm - SL * FRm + SL * SR * (hsR - hsL)) * inv;
    o.n = (SR * FLn - SL * FRn + SL * SR * (hsR * unR - hsL * unL)) * inv;
    o.t = (SR * FLt - SL * FRt + SL * SR * (hsR * utR - hsL * utL)) * inv;
  }
  return o;
}

// L(U) for cell (ix, iy): (dh/dt, dhu/dt, dhv/dt)
fn rate(ix: i32, iy: i32, useStage: bool) -> vec3<f32> {
  let x0 = load(ix - 2, iy, useStage); let x1 = load(ix - 1, iy, useStage);
  let c  = load(ix, iy, useStage);
  let x3 = load(ix + 1, iy, useStage); let x4 = load(ix + 2, iy, useStage);
  let y0 = load(ix, iy - 2, useStage); let y1 = load(ix, iy - 1, useStage);
  let y3 = load(ix, iy + 1, useStage); let y4 = load(ix, iy + 2, useStage);

  let eL = recon(x1, c, x3, 1.0);  let eR = recon(c, x3, x4, -1.0);
  let wL = recon(x0, x1, c, 1.0);  let wR = recon(x1, c, x3, -1.0);
  let nL = recon(y1, c, y3, 1.0);  let nR = recon(c, y3, y4, -1.0);
  let sL = recon(y0, y1, c, 1.0);  let sR = recon(y1, c, y3, -1.0);
  let E = face(eL, eR, true);  let W = face(wL, wR, true);
  let N = face(nL, nR, false); let S = face(sL, sR, false);

  // well-balanced source: far-side Audusse terms plus the bed-only slope term
  let bsx = -E.sL + W.sR - P.g * c.h * (eL.y - wR.y);
  let bsy = -N.sL + S.sR - P.g * c.h * (nL.y - sR.y);
  let dx = P.dx;
  return vec3<f32>(
    -(E.m - W.m) / dx - (N.m - S.m) / dx,
    -(E.n - W.n) / dx - (N.t - S.t) / dx + bsx / dx,
    -(E.t - W.t) / dx - (N.n - S.n) / dx + bsy / dx);
}

fn dryFix(u: vec3<f32>) -> vec3<f32> {
  if (u.x < DRY) { return vec3<f32>(max(u.x, 0.0), 0.0, 0.0); }
  return u;
}

@compute @workgroup_size(16, 16)
fn stage1(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.nx || gid.y >= P.ny) { return; }
  let ix = i32(gid.x); let iy = i32(gid.y);
  let s = stateIn[cidx(ix, iy)];
  let u1 = dryFix(s.xyz + P.dt * rate(ix, iy, false));
  stateOut[cidx(ix, iy)] = vec4<f32>(u1, s.w);
}

@compute @workgroup_size(16, 16)
fn stage2(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.nx || gid.y >= P.ny) { return; }
  let ix = i32(gid.x); let iy = i32(gid.y);
  let i = cidx(ix, iy);
  let un = stateIn[i].xyz;
  let u1 = stage[i].xyz;
  let u = dryFix(0.5 * un + 0.5 * (u1 + P.dt * rate(ix, iy, true)));
  stateOut[i] = finish(ix, iy, u.x, u.y, u.z);
}
