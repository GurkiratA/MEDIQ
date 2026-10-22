"""
Generates the topographic contour artwork used on the site (public/art/*.svg).

Contour lines are traced with marching squares over smooth value noise and
chained into polylines, so the output is a small, crisp, static SVG.
Re-run after changing a parameter:

    python3 scripts/contours.py
"""
import math
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent.parent / "public" / "art"


def value_noise(w, h, scale, seed, octaves=4):
    rng = np.random.default_rng(seed)
    field = np.zeros((h, w))
    amp, total = 1.0, 0.0
    for o in range(octaves):
        cells = max(2, int(scale * 2**o))
        grid = rng.random((cells + 3, cells + 3))
        ys = np.linspace(0, cells, h)
        xs = np.linspace(0, cells, w)
        yi, xi = ys.astype(int), xs.astype(int)
        fy = (ys - yi)[:, None]
        fx = (xs - xi)[None, :]
        fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
        a = grid[yi][:, xi]
        b = grid[yi][:, xi + 1]
        c = grid[yi + 1][:, xi]
        d = grid[yi + 1][:, xi + 1]
        field += amp * (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy)
        total += amp
        amp *= 0.5
    return field / total


# Corner bits: tl 8, tr 4, br 2, bl 1. Edges: 0 top, 1 right, 2 bottom, 3 left.
SEGMENTS = [[], [(3, 2)], [(2, 1)], [(3, 1)], [(0, 1)], [(0, 3), (2, 1)], [(0, 2)], [(0, 3)],
            [(0, 3)], [(0, 2)], [(0, 1), (3, 2)], [(0, 1)], [(3, 1)], [(2, 1)], [(3, 2)], []]


def trace(field, level, cell):
    h, w = field.shape
    segs = []
    for j in range(h - 1):
        for i in range(w - 1):
            v = (field[j, i], field[j, i + 1], field[j + 1, i + 1], field[j + 1, i])
            idx = (v[0] > level) * 8 | (v[1] > level) * 4 | (v[2] > level) * 2 | (v[3] > level) * 1
            for e1, e2 in SEGMENTS[idx]:
                segs.append((edge(e1, i, j, v, level, cell), edge(e2, i, j, v, level, cell)))
    return chain(segs)


def edge(e, i, j, v, level, cell):
    t = lambda a, b: (level - a) / ((b - a) or 1e-9)
    x, y = i * cell, j * cell
    if e == 0:
        return (x + t(v[0], v[1]) * cell, y)
    if e == 1:
        return (x + cell, y + t(v[1], v[2]) * cell)
    if e == 2:
        return (x + t(v[3], v[2]) * cell, y + cell)
    return (x, y + t(v[0], v[3]) * cell)


def chain(segs):
    """Join segments that share endpoints into polylines."""
    key = lambda p: (round(p[0], 2), round(p[1], 2))
    ends = {}
    for k, (a, b) in enumerate(segs):
        ends.setdefault(key(a), []).append(k)
        ends.setdefault(key(b), []).append(k)
    used = [False] * len(segs)
    lines = []
    for k in range(len(segs)):
        if used[k]:
            continue
        used[k] = True
        line = list(segs[k])
        for grow_front in (False, True):
            while True:
                tip = line[0] if grow_front else line[-1]
                nxt = next((n for n in ends.get(key(tip), []) if not used[n]), None)
                if nxt is None:
                    break
                used[nxt] = True
                a, b = segs[nxt]
                p = b if key(a) == key(tip) else a
                line.insert(0, p) if grow_front else line.append(p)
        lines.append(line)
    return lines


def path(lines, min_len=4):
    out = []
    for line in lines:
        if len(line) < min_len:
            continue
        pts = line[::2] + ([line[-1]] if len(line) % 2 == 0 else [])
        out.append("M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts))
    return "".join(out)


def render(name, w, h, seed, scale, levels, stroke, index_stroke, opacity, index_opacity, cell=8, bias=None):
    gw, gh = w // cell + 1, h // cell + 1
    field = value_noise(gw, gh, scale, seed)
    if bias is not None:
        yy, xx = np.mgrid[0:gh, 0:gw]
        cx, cy, r, s = bias
        field += s * np.exp(-(((xx - cx * gw) ** 2 + (yy - cy * gh) ** 2) / (2 * (r * gw) ** 2)))
    lo, hi = np.percentile(field, 2), np.percentile(field, 99.5)
    minor, major = [], []
    for k in range(1, levels):
        level = lo + (hi - lo) * k / levels
        (major if k % 5 == 0 else minor).extend(trace(field, level, cell))
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid slice">'
        f'<g fill="none" stroke-linecap="round" stroke-linejoin="round">'
        f'<path d="{path(minor)}" stroke="{stroke}" stroke-opacity="{opacity}" stroke-width="1"/>'
        f'<path d="{path(major)}" stroke="{index_stroke}" stroke-opacity="{index_opacity}" stroke-width="1.4"/>'
        f"</g></svg>"
    )
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(svg)
    print(f"{name}: {len(svg) / 1024:.0f} KB")


if __name__ == "__main__":
    # Hero cover panel: light lines on cobalt, a summit off to one side.
    render("contours-cover.svg", 720, 900, seed=11, scale=2.2, levels=26,
           stroke="#f3ede2", index_stroke="#f3ede2", opacity=0.22, index_opacity=0.5, bias=(0.68, 0.38, 0.22, 0.35))
    # Wide band (contact): very quiet.
    render("contours-band.svg", 1600, 700, seed=4, scale=2.6, levels=22,
           stroke="#f3ede2", index_stroke="#f3ede2", opacity=0.12, index_opacity=0.24)
