// Plain diagnostic paint of the solver fields: eta on a diverging map, foam
// in white, land in brown. Not the product renderer (build-order step 4).

struct View {
  row0: vec4<f32>,   // grid (ix, iy, 1) -> clip x
  row1: vec4<f32>,   // grid (ix, iy, 1) -> clip y
  dims: vec4<f32>,   // nx, ny, eta scale (m), unused
};
@group(0) @binding(0) var<uniform> V: View;
@group(0) @binding(1) var fields: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

struct VOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };

@vertex fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  let cx = f32(vi & 1u);
  let cy = f32((vi >> 1u) & 1u);
  let g = vec3<f32>(cx * V.dims.x - 0.5, cy * V.dims.y - 0.5, 1.0);
  var o: VOut;
  o.pos = vec4<f32>(dot(V.row0.xyz, g), dot(V.row1.xyz, g), 0.0, 1.0);
  o.uv = vec2<f32>(cx, cy);
  return o;
}

@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let f = textureSampleLevel(fields, samp, uv, 0.0);   // (eta, h, foam, zb)
  let eta = f.x; let h = f.y; let foam = f.z; let zb = f.w;
  if (h < 0.02 && zb > -0.05) {
    let e = clamp(zb / 20.0, 0.0, 1.0);
    return vec4<f32>(mix(vec3<f32>(0.45, 0.38, 0.28), vec3<f32>(0.25, 0.22, 0.18), e), 1.0);
  }
  let s = clamp(eta / V.dims.z, -1.0, 1.0);
  let trough = vec3<f32>(0.10, 0.25, 0.75);
  let still = vec3<f32>(0.12, 0.16, 0.22);
  let crest = vec3<f32>(0.90, 0.35, 0.20);
  var col = select(mix(still, trough, -s), mix(still, crest, s), s > 0.0);
  col = mix(col, vec3<f32>(1.0), clamp(foam, 0.0, 1.0));
  return vec4<f32>(col, 1.0);
}
