"""Reduce Run A's recorded fields (out/A4-full, read-only) to statistics on
the Run C grid: Hs = 4 std(eta), mean foam, fraction of frames with foam >
0.15, computed per 2.5 m cell over the 120 s record, then 5x5 block-averaged
to 192x512. Streams the 3.3 GB zstd stacks one frame at a time.

    .venv/bin/python scripts/runa_stats.py [~/surf-sim/out/A4-full] [parity-out/runA.npz]
"""
import json, os, sys, time
import numpy as np
import zstandard as zstd

src = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/surf-sim/out/A4-full")
out = sys.argv[2] if len(sys.argv) > 2 else "parity-out/runA.npz"
m = json.load(open(os.path.join(src, "manifest.json")))
nx, ny, nf = m["grid"]["nx"], m["grid"]["ny"], m["frame_count"]
FOAM_T = 0.15


def frames(name, dtype):
    size = nx * ny * np.dtype(dtype).itemsize
    with open(os.path.join(src, name), "rb") as fh:
        r = zstd.ZstdDecompressor().stream_reader(fh, read_size=1 << 24)
        for _ in range(nf):
            buf = bytearray()
            while len(buf) < size:
                chunk = r.read(size - len(buf))
                if not chunk:
                    raise EOFError(name)
                buf += chunk
            yield np.frombuffer(bytes(buf), dtype).reshape(nx, ny)


t0 = time.time()
s1 = np.zeros((nx, ny)); s2 = np.zeros((nx, ny))
for k, e in enumerate(frames("eta.f16.zst", np.float16)):
    e = e.astype(np.float64); s1 += e; s2 += e * e
    if k == nf // 2:
        eta_mid = e.astype(np.float32)
    if k % 200 == 0:
        print(f"eta frame {k}/{nf} {time.time()-t0:.0f}s", flush=True)
eta_last = e.astype(np.float32)
mean = s1 / nf
Hs = 4 * np.sqrt(np.maximum(s2 / nf - mean * mean, 0))
fsum = np.zeros((nx, ny)); fhit = np.zeros((nx, ny))
for k, f in enumerate(frames("foam.f16.zst", np.float16)):
    f = f.astype(np.float64); fsum += f; fhit += f > FOAM_T
foam_last = f.astype(np.float32)
print(f"read {nf} frames in {time.time()-t0:.0f}s")


def block(a):
    return a.reshape(nx // 5, 5, ny // 5, 5).mean(axis=(1, 3)).astype(np.float32)


depth = np.fromfile(os.path.join(src, "depth.f32"), "<f4").reshape(nx, ny)
np.savez_compressed(out, Hs=block(Hs), foamMean=block(fsum / nf), foamFrac=block(fhit / nf),
                    setup=block(mean), depth=block(depth), eta_mid=block(eta_mid),
                    eta_last=block(eta_last), foam_last=block(foam_last), frames=nf)
print(f"wrote {out}")
