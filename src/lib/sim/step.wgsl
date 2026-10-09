// First-order step (scheme 'first-order'), a port of Run C
// (surf-sim/webgpu/demo.template.html): HLL fluxes with Audusse hydrostatic
// reconstruction, then common.wgsl's finish. Changes from Run C: the swell is
// a list of components in a buffer, and its constants are uniforms.
// Prepended with common.wgsl at pipeline creation.

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
  let nh  = h  - r * ((Fp.x - Fm.x) + (Gp.x - Gm.x));
  var nhu = hu - r * ((Fp.y - Fm.y) + (Gp.y - Gm.y));
  var nhv = hv - r * ((Fp.z - Fm.z) + (Gp.z - Gm.z));
  // well-balanced bed source (cancels the flux pressure imbalance at rest)
  nhu = nhu - r * (0.5 * P.g * (hCm*hCm - hCp*hCp));
  nhv = nhv - r * (0.5 * P.g * (hCd*hCd - hCu*hCu));

  stateOut[cidx(ixi, iyi)] = finish(ixi, iyi, nh, nhu, nhv);
}
