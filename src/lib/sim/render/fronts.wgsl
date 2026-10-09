// One thread per along-shore row: scan from the offshore edge toward land and
// record the first wet cell with fresh foam (just broken). That is the
// seaward edge of the active break in this row. Output per row:
//   a = (ix of the edge, or -1; foam there; h there; eta there)
//   b = (u, v at the edge, eta one cell seaward, h one cell seaward)

struct P { nx: u32, ny: u32, skip: u32, thr: f32 };
@group(0) @binding(0) var<uniform> D: P;
@group(0) @binding(1) var<storage, read> bed: array<f32>;
@group(0) @binding(2) var<storage, read> state: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> rows: array<vec4<f32>>;

@compute @workgroup_size(64)
fn edges(@builtin(global_invocation_id) gid: vec3<u32>) {
  let iy = gid.x;
  if (iy >= D.ny) { return; }
  var a = vec4<f32>(-1.0, 0.0, 0.0, 0.0);
  var b = vec4<f32>(0.0);
  // skip the wavemaker band
  var ix = i32(D.nx) - 1 - i32(D.skip);
  loop {
    if (ix < 0) { break; }
    let i = u32(ix) * D.ny + iy;
    let s = state[i];
    if (s.x > 0.05 && s.w > D.thr) {
      a = vec4<f32>(f32(ix), s.w, s.x, s.x + bed[i]);
      var u = vec2<f32>(0.0);
      if (s.x > 0.05) { u = s.yz / s.x; }
      let j = u32(min(ix + 1, i32(D.nx) - 1)) * D.ny + iy;
      let o = state[j];
      b = vec4<f32>(u, o.x + bed[j], o.x);
      break;
    }
    ix = ix - 1;
  }
  rows[iy * 2u] = a;
  rows[iy * 2u + 1u] = b;
}
