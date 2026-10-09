// Post-step passes that read the current state: pack it into a texture for
// renderers, and accumulate wave statistics. Layout: idx = ix * ny + iy.

struct Dims { nx: u32, ny: u32, foamT: f32, pad0: f32 };

@group(0) @binding(0) var<uniform> D: Dims;
@group(0) @binding(1) var<storage, read> bed: array<f32>;
@group(0) @binding(2) var<storage, read> state: array<vec4<f32>>;
@group(0) @binding(3) var fields: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var<storage, read_write> stats: array<vec4<f32>>;

// texel (ix, iy) = (eta, h, foam, zb); eta = h + zb is the free surface
@compute @workgroup_size(16, 16)
fn pack(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= D.nx || gid.y >= D.ny) { return; }
  let i = gid.x * D.ny + gid.y;
  let s = state[i];
  let zb = bed[i];
  textureStore(fields, vec2<u32>(gid.x, gid.y), vec4<f32>(s.x + zb, s.x, s.w, zb));
}

// stats[i] += (eta, eta^2, foam, foam > foamT) over wet cells
@compute @workgroup_size(16, 16)
fn accumulate(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= D.nx || gid.y >= D.ny) { return; }
  let i = gid.x * D.ny + gid.y;
  let s = state[i];
  let zb = bed[i];
  var eta = 0.0;
  if (s.x > 1e-3 && zb < 0.0) { eta = s.x + zb; }
  var hit = 0.0;
  if (s.w > D.foamT) { hit = 1.0; }
  stats[i] = stats[i] + vec4<f32>(eta, eta * eta, s.w, hit);
}
