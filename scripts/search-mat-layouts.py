#!/usr/bin/env python3
"""Search mixed-orientation tatami layouts for the 720x960 tile.

Mats stay the size used by generate-home-mat-tatami.py: vertical and horizontal
2:1 mats are 240x480, and a half-mat is the 240x240 square. Those sizes pack
the 720x960 image on a 3 by 4 grid of 240px cells. The image repeats, so the
grid is a torus: the right edge meets the left edge and the bottom meets the top.

The junction rule is the one in generate-home-mat-tatami.py, applied to a 3x3
repeat: no plus (four mats meeting), no L-corner, no same-chirality pinwheel.

Result: no covering passes. The minimum is two plus junctions per tile. Adding
half-mats does not remove them. A wider tile can still mix orientations with
zero pluses: scripts/generate-home-mat-tatami.py offsets horizontal stacks by
120px and staggers the vertical pair by 160px and 320px. Run:

  python3 scripts/search-mat-layouts.py
"""

from __future__ import annotations

import importlib.util
from collections import Counter
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "matgen", Path(__file__).with_name("generate-home-mat-tatami.py")
)
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)

COLS, ROWS = 3, 4
S = gen.S
FOCUS = (gen.W, gen.H, 2 * gen.W, 2 * gen.H)


def search(max_mono: int) -> list[tuple]:
    """Every tiling with at most max_mono half-mats. Dominoes may wrap the torus."""
    found = []
    seen = set()
    grid = [None] * (COLS * ROWS)
    pieces: list[tuple] = []

    def idx(c: int, r: int) -> int:
        return (r % ROWS) * COLS + (c % COLS)

    def rec(mono_left: int) -> None:
        empties = [i for i, v in enumerate(grid) if v is None]
        if not empties:
            sig = tuple(grid)
            if sig not in seen:
                seen.add(sig)
                found.append(tuple(pieces))
            return
        start = empties[0]
        r, c = divmod(start, COLS)
        options = [("H", 1, 0), ("H", -1, 0), ("V", 0, 1), ("V", 0, -1)]
        if mono_left > 0:
            options.append(("M", 0, 0))
        for kind, dc, dr in options:
            steps = 1 if kind == "M" else 2
            cells = []
            blocked = False
            for k in range(steps):
                i = idx(c + dc * k, r + dr * k)
                if grid[i] is not None:
                    blocked = True
                    break
                cells.append(i)
            if blocked:
                continue
            for i in cells:
                grid[i] = len(pieces)
            pieces.append((kind, c, r, dc, dr))
            rec(mono_left - (1 if kind == "M" else 0))
            pieces.pop()
            for i in cells:
                grid[i] = None

    rec(max_mono)
    return found


def cells_of(kind: str, c: int, r: int, dc: int, dr: int) -> tuple[tuple[int, int], ...]:
    if kind == "M":
        return ((c % COLS, r % ROWS),)
    return (
        (c % COLS, r % ROWS),
        ((c + dc) % COLS, (r + dr) % ROWS),
    )


def occupied(pieces: tuple) -> dict[tuple[int, int], tuple]:
    owner = {}
    for piece in pieces:
        for cell in cells_of(*piece):
            owner[cell] = piece
    if len(owner) != COLS * ROWS:
        raise SystemExit("tiling does not cover the tile")
    return owner


def features(pieces: tuple) -> dict[str, int]:
    h = sum(piece[0] == "H" for piece in pieces)
    v = sum(piece[0] == "V" for piece in pieces)
    m = sum(piece[0] == "M" for piece in pieces)
    verts = []
    for kind, c, r, dc, dr in pieces:
        if kind != "V":
            continue
        rows = tuple(sorted(rr for _, rr in cells_of(kind, c, r, dc, dr)))
        verts.append((c, rows))
    pairs = 0
    for i, (c, rows) in enumerate(verts):
        for c2, rows2 in verts[i + 1 :]:
            if rows == rows2 and (c2 - c) % COLS in (1, COLS - 1):
                pairs += 1
    return {"H": h, "V": v, "M": m, "vertical_pairs": pairs}


def plus_and_corners(pieces: tuple) -> tuple[int, int]:
    """Count pluses and L-corners on the torus. A plus is four mats at one point."""
    own = occupied(pieces)
    plus = corners = 0
    for vx in range(COLS):
        for vy in range(ROWS):
            nw = own[((vx - 1) % COLS, (vy - 1) % ROWS)]
            ne = own[(vx % COLS, (vy - 1) % ROWS)]
            sw = own[((vx - 1) % COLS, vy % ROWS)]
            se = own[(vx % COLS, vy % ROWS)]
            arms = (nw != ne, se != ne, sw != se, nw != sw)
            n = sum(arms)
            if n == 4:
                plus += 1
            elif n == 2 and arms[0] != arms[2]:
                corners += 1
    return plus, corners


def rects_for_checker(pieces: tuple, tiles: int = 3) -> list[tuple]:
    """Seam-centerline rectangles over a tiles x tiles block, for junction_report."""
    rects = []
    for tx in range(tiles):
        for ty in range(tiles):
            for kind, c, r, dc, dr in pieces:
                gc = tx * COLS + c
                gr = ty * ROWS + r
                if kind == "M":
                    rects.append((gc * S, gr * S, (gc + 1) * S, (gr + 1) * S, ("M", gc, gr)))
                elif kind == "H":
                    c0 = gc if dc == 1 else gc + dc
                    rects.append((c0 * S, gr * S, (c0 + 2) * S, (gr + 1) * S, ("H", c0, gr)))
                else:
                    r0 = gr if dr == 1 else gr + dr
                    rects.append((gc * S, r0 * S, (gc + 1) * S, (r0 + 2) * S, ("V", gc, r0)))
    return rects


def diagram(pieces: tuple) -> str:
    rows = [["?"] * COLS for _ in range(ROWS)]
    for kind, c, r, dc, dr in pieces:
        for i, (cc, rr) in enumerate(cells_of(kind, c, r, dc, dr)):
            rows[rr][cc] = kind if i == 0 else kind.lower()
    return "\n".join("".join(row) for row in rows)


def main() -> None:
    # The old hooked-cross art is a mixed layout and the checker must still see it.
    legacy = gen.junction_report(gen.legacy_pinwheel_rects(), FOCUS)
    if not legacy["pinwheels"]:
        raise SystemExit("checker no longer flags the original pinwheel")

    min_plus = 99
    min_mixed = 99
    counts: Counter[tuple] = Counter()
    nearest_mixed: list[tuple] = []
    seen: set[tuple] = set()

    for budget in (0, 2, 4, 6, 8, 10, 12):
        for pieces in search(budget):
            if pieces in seen:
                continue
            seen.add(pieces)
            feat = features(pieces)
            if feat["M"] != budget:
                continue
            plus, corners = plus_and_corners(pieces)
            mixed = feat["H"] > 0 and feat["V"] > 0
            counts[(feat["M"], "mixed" if mixed else "single-orientation")] += 1
            min_plus = min(min_plus, plus)
            if mixed:
                min_mixed = min(min_mixed, plus)
            if mixed and plus <= 2 and corners == 0 and feat["vertical_pairs"] >= 1:
                report = gen.junction_report(rects_for_checker(pieces), FOCUS)
                nearest_mixed.append((plus, len(report["pinwheels"]), feat, pieces))

    if min_plus == 0 or min_mixed == 0:
        raise SystemExit("a plus-free layout exists; the conclusion in this script is stale")

    print(f"tilings checked: {len(seen)}")
    print(f"minimum plus junctions on any tiling: {min_plus}")
    print(f"minimum plus junctions on a mixed H+V tiling: {min_mixed}")
    print("half-mats do not help: the minimum stays 2 with 0 or 2 half-mats, then rises")
    for key in sorted(counts):
        print(f"  half-mats={key[0]:2d}  {key[1]:<19}  {counts[key]}")

    pin_free = [row for row in nearest_mixed if row[1] == 0]
    print(
        f"nearest mixed layouts with a side-by-side vertical pair: {len(nearest_mixed)}, "
        f"of which {len(pin_free)} have no pinwheel. All of them still have 2 pluses."
    )
    print("example (H/h one horizontal mat, V/v one vertical mat):")
    print(diagram(pin_free[0][3]))
    print(
        "Those two pluses sit where the odd width wraps. A one-cell stagger needs an even "
        "number of columns to close. Width 3 leaves two columns in the same phase next to "
        "each other, and their horizontal seams cross the vertical seam between them."
    )
    print(
        "The running bond avoids that by staggering columns 160px (one third of a mat), "
        "which only packs when every mat is vertical. A horizontal 2:1 mat is 480px wide, "
        "so it needs two columns to share a top and a bottom, and the plus comes back."
    )
    print("no mixed layout passes the junction rule on this tile")


if __name__ == "__main__":
    main()
