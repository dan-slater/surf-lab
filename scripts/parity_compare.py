"""Compare a surf-lab parity run (GPU or CPU twin JSON) with Run A statistics.

    .venv/bin/python scripts/parity_compare.py parity-out/gpu.json [parity-out/runA.npz] [--plots docs/img]

Prints markdown tables used in src/lib/sim/PARITY.md.
"""
import json, sys
import numpy as np

args = [a for a in sys.argv[1:] if not a.startswith("--")]
plots = sys.argv[sys.argv.index("--plots") + 1] if "--plots" in sys.argv else None
if plots in args:
    args.remove(plots)
sim_path = args[0]
ref_path = args[1] if len(args) > 1 else "parity-out/runA.npz"
NX, NY, DX = 192, 512, 12.5
X0, Y0 = -993.75, -2893.75
x = X0 + DX * np.arange(NX)
y = Y0 + DX * np.arange(NY)

S = json.load(open(sim_path))
R = np.load(ref_path)
geo = json.load(open("src/lib/spots/jbay.json"))
shape = (NX, NY)
snx, sny = S.get("nx", NX), S.get("ny", NY)


def field(name):
    a = np.array(S[name], np.float32).reshape(snx, sny)
    bx, by = snx // NX, sny // NY  # finer runs are block-averaged to the 12.5 m grid
    return a.reshape(NX, bx, NY, by).mean(axis=(1, 3)) if bx > 1 else a


sHs, sFm, sFf = field("Hs"), field("foamMean"), field("foamFrac")
rHs, rFm, rFf, depth = R["Hs"], R["foamMean"], R["foamFrac"], R["depth"]

XX, YY = np.meshgrid(x, y, indexing="ij")
# interior: wet, outside both runs' wavemaker bands and sponges
mask = (depth > 0.3) & (XX < 1150) & (YY > -2650) & (YY < 3250)
F = 0.15


def stats(a, b, m):
    d = a[m] - b[m]
    r = np.corrcoef(a[m], b[m])[0, 1] if m.sum() > 2 else float("nan")
    return dict(n=int(m.sum()), runA=float(b[m].mean()), sim=float(a[m].mean()),
                bias=float(d.mean()), rms=float(np.sqrt((d * d).mean())), r=float(r))


SUMMARY = "--summary" in sys.argv
if SUMMARY:
    import io, contextlib
    _buf = io.StringIO()
    _ctx = contextlib.redirect_stdout(_buf)
    _ctx.__enter__()
print(f"## {S.get('engine')} {S.get('scheme', 'first-order')} at {S.get('dx', 12.5)} m: spin-up {S['spinup']} s, record {S['record']} s, dt {S['dt']} s, {S['samples']} samples\n")
print("### Hs field (m), interior wet cells\n")
print("| depth band | cells | Run A mean Hs | sim mean Hs | sim / Run A | RMS diff | r |")
print("|---|---|---|---|---|---|---|")
bands = [(0.3, 3), (3, 6), (6, 10), (10, 15), (15, 20), (20, 40), (0.3, 40)]
for lo, hi in bands:
    m = mask & (depth > lo) & (depth <= hi)
    s = stats(sHs, rHs, m)
    label = "all" if (lo, hi) == (0.3, 40) else f"{lo:g} to {hi:g} m"
    print(f"| {label} | {s['n']} | {s['runA']:.2f} | {s['sim']:.2f} | {s['sim']/s['runA']:.2f} | {s['rms']:.2f} | {s['r']:.2f} |")

# cross-shore profile at Supertubes
sup = next(s for s in geo["sections"] if s["name"] == "Supertubes")
iy = int(round((sup["y"] - Y0) / DX))
print(f"\n### Cross-shore Hs at Supertubes (row y = {y[iy]:.0f} m), distance seaward of the coast\n")
print("| offshore (m) | depth (m) | Run A Hs | sim Hs |")
print("|---|---|---|---|")
for off in [25, 50, 100, 200, 300, 500, 800, 1100, 1300]:
    ix = int(round((sup["x"] + off - X0) / DX))
    if ix >= NX:
        continue
    print(f"| {off} | {depth[ix, iy]:.1f} | {rHs[ix, iy]:.2f} | {sHs[ix, iy]:.2f} |")

# break line per section: most seaward wet cell in the section's row with foam_mean > F
print(f"\n### Breaking line per named section (most seaward cell with mean foam > {F})\n")
print("| section | Run A: offshore (m) / depth (m) | sim: offshore (m) / depth (m) |")
print("|---|---|---|")
brk = {}
for sec in geo["sections"]:
    iy = int(round((sec["y"] - Y0) / DX))
    row = []
    for fm in (rFm, sFm):
        wet = (depth[:, iy] > 0.05) & (fm[:, iy] > F) & (x < 1150)
        idx = np.where(wet)[0]
        if len(idx):
            ix = idx.max()
            row.append((x[ix] - sec["x"], float(depth[ix, iy])))
        else:
            row.append(None)
    brk[sec["name"]] = row
    fmt = lambda v: "none" if v is None else f"{v[0]:.0f} / {v[1]:.1f}"
    print(f"| {sec['name']} | {fmt(row[0])} | {fmt(row[1])} |")

print("\n### Foam coverage, interior wet cells\n")
print("| metric | Run A | sim |")
print("|---|---|---|")
print(f"| cells with mean foam > {F} (share of interior wet cells) | {(rFm[mask] > F).mean()*100:.2f} % | {(sFm[mask] > F).mean()*100:.2f} % |")
m5 = mask & (depth < 5)
print(f"| mean foam, depth < 5 m | {rFm[m5].mean():.3f} | {sFm[m5].mean():.3f} |")
print(f"| time share foam > {F}, depth < 5 m | {rFf[m5].mean()*100:.1f} % | {sFf[m5].mean()*100:.1f} % |")
m1 = mask & (depth < 1.5)
print(f"| time share foam > {F}, depth < 1.5 m | {rFf[m1].mean()*100:.1f} % | {sFf[m1].mean()*100:.1f} % |")

# long-shore Hs along the 3 m isobath around Supertubes
print("\n### Long-shore Hs along the 3 m isobath, Supertubes +/- 800 m (south to north)\n")
print("| y rel. Supertubes (m) | Run A Hs | sim Hs |")
print("|---|---|---|")
ra, sa = [], []
for dy in range(-800, 801, 100):
    iy = int(round((sup["y"] + dy - Y0) / DX))
    col = depth[:, iy]
    cand = np.where((col > 0) & (col <= 3.0))[0]
    ix = cand.max() if len(cand) else None
    if ix is None:
        continue
    ra.append(rHs[ix, iy]); sa.append(sHs[ix, iy])
    print(f"| {dy:+d} | {rHs[ix, iy]:.2f} | {sHs[ix, iy]:.2f} |")
ra, sa = np.array(ra), np.array(sa)
print(f"\nmean along the isobath: Run A {ra.mean():.2f} m, sim {sa.mean():.3f} m (ratio {sa.mean()/ra.mean():.3f}); r = {np.corrcoef(ra, sa)[0,1]:.2f}")

if SUMMARY:
    _ctx.__exit__(None, None, None)
    a = stats(sHs, rHs, mask)
    m3 = mask & (depth <= 3)
    nb = sum(1 for v in brk.values() if v[1] is not None)
    print(f"{sim_path}: Hs ratio {a['sim']/a['runA']:.2f} r {a['r']:.2f} | Hs<3m ratio {sHs[m3].mean()/rHs[m3].mean():.2f} | "
          f"foam cells {(sFm[mask] > F).mean()*100:.2f}% (A 1.18) | foam time d<5 {sFf[m5].mean()*100:.1f}% (A 7.4) "
          f"d<1.5 {sFf[m1].mean()*100:.1f}% (A 28.6) | break lines {nb}/8 | isobath r {np.corrcoef(ra, sa)[0,1]:.2f}")
    sys.exit(0)

if plots:
    import matplotlib; matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    ext = [y[0] - DX / 2, y[-1] + DX / 2, x[-1] + DX / 2, x[0] - DX / 2]
    fig, axes = plt.subplots(3, 1, figsize=(10, 8.4))
    for ax, a, title in [(axes[0], rHs, "Run A (MUSCL + RK2, 2.5 m) Hs, block-averaged to 12.5 m"),
                         (axes[1], sHs, f"surf-lab {S.get('engine')} ({S.get('scheme', 'first-order')}, {S.get('dx', 12.5)} m) Hs")]:
        im = ax.imshow(np.where(depth > 0.3, a, np.nan), extent=ext, cmap="magma", vmin=0, vmax=2.8, aspect="equal")
        ax.contour(y, x, rFm, levels=[F], colors=["cyan"], linewidths=0.7)
        ax.set_title(title, fontsize=9); ax.set_ylabel("x east (m)")
        fig.colorbar(im, ax=ax, shrink=0.8, label="Hs (m)")
    for name, rowv in brk.items():
        pass
    sup_iy = int(round((sup["y"] - Y0) / DX))
    offs = x - sup["x"]
    m = depth[:, sup_iy] > 0.3
    axes[2].plot(offs[m], rHs[m, sup_iy], label="Run A")
    axes[2].plot(offs[m], sHs[m, sup_iy], label=f"surf-lab {S.get('scheme', 'first-order')} {S.get('dx', 12.5)} m")
    axes[2].set_xlabel("distance seaward of the coast at Supertubes (m)"); axes[2].set_ylabel("Hs (m)")
    axes[2].legend(fontsize=8); axes[2].set_title("cross-shore Hs at Supertubes (cyan contour above: Run A mean foam 0.15)", fontsize=9)
    fig.tight_layout(); name = f"parity-hs-{S.get('scheme', 'first-order')}-{S.get('dx', 12.5)}.png"
    fig.savefig(f"{plots}/{name}", dpi=80)
    print(f"\nwrote {plots}/{name}")
