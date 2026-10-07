#!/usr/bin/env python3
"""Regenerate public/home-mat-tatami.png.

The shipped tile is fallback-tuck: doubled horizontals beside one vertical,
with vertical mats above, on the original 720x960 image. index.css tiles that
at the original size, var(--mat-tile) by calc(var(--mat-tile) * 4 / 3).

  python3 scripts/generate-home-mat-tatami.py
  python3 scripts/generate-home-mat-tatami.py --layout brick-pair
  python3 scripts/generate-home-mat-tatami.py --layout running-bond
  python3 scripts/generate-home-mat-tatami.py --layout fallback-band
  python3 scripts/generate-home-mat-tatami.py --list

The gate allows the two plain plus junctions on the 720x960 mixed layouts.
It still refuses to write a tile that has a same-chirality pinwheel or an
L-corner. brick-pair and the running bond have zero pluses; brick-pair is
1440x960, so the page CSS would need a 6 by 4 background-size to show it
at the same mat scale.
"""

from __future__ import annotations

import argparse
import struct
import sys
import zlib
from collections import defaultdict, deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "home-mat-tatami.png"

W = 720
H = 960
# Short side of a 2:1 mat. Three columns fill the tile; two mat lengths fill it vertically.
S = 240
L = 480
PHASE = L // 3  # 160
# Narrower and lighter than the old 16px near-black cracks, so a seam
# still reads as a mat edge without becoming a bold continuous figure.
SEAM = 10
HALF = SEAM // 2

# The six panel blues from the previous tile, one per mat.
PANELS = {
    "c0a": (52, 92, 136),
    "c0b": (22, 44, 72),
    "c1c": (28, 54, 86),
    "c1d": (48, 86, 128),
    "c2e": (38, 72, 110),
    "c2f": (32, 62, 96),
}
# Darker than every panel, but lifted off the old near-black (6, 10, 16).
SEAM_RGB = (15, 28, 44)

# column -> (mat key, y0, y1) pieces inside one tile, in seam-center coordinates.
# Pieces that share a key are one mat split by the tile edge.
COLUMN_PIECES = {
    0: (
        ("c0a", 0, L),
        ("c0b", L, H),
    ),
    1: (
        ("c1d", 0, PHASE),
        ("c1c", PHASE, PHASE + L),
        ("c1d", PHASE + L, H),
    ),
    2: (
        ("c2f", 0, 2 * PHASE),
        ("c2e", 2 * PHASE, 2 * PHASE + L),
        ("c2f", 2 * PHASE + L, H),
    ),
}


def lum(rgb: tuple[int, int, int]) -> float:
    r, g, b = rgb
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def write_png(path: Path, width: int, height: int, rgb: bytes) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw = bytearray()
    stride = width * 3
    for y in range(height):
        raw.append(0)
        raw.extend(rgb[y * stride : (y + 1) * stride])
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def render_tile() -> bytes:
    """Fill cracks first, then punch each mat inset from its real seams only."""
    px = bytearray(SEAM_RGB * (W * H))

    def fill(x0: int, y0: int, x1: int, y1: int, color: tuple[int, int, int]) -> None:
        if x1 <= x0 or y1 <= y0:
            raise SystemExit(f"empty mat fill {(x0, y0, x1, y1)}")
        row = bytes(color) * (x1 - x0)
        for y in range(y0, y1):
            start = (y * W + x0) * 3
            px[start : start + (x1 - x0) * 3] = row

    for col, pieces in COLUMN_PIECES.items():
        x0 = col * S
        x1 = x0 + S
        # Vertical cracks are centered on the column lines, including the tile edge.
        left = x0 + HALF
        right = x1 - HALF
        for key, y0, y1 in pieces:
            top = y0 if y0 == 0 and _continues_above(col, key) else y0 + HALF
            bot = y1 if y1 == H and _continues_below(col, key) else y1 - HALF
            fill(left, top, right, bot, PANELS[key])
    return bytes(px)


def _continues_above(col: int, key: str) -> bool:
    """True when this top-edge piece is the rest of a mat from the tile above."""
    return (col, key) in {(1, "c1d"), (2, "c2f")}


def _continues_below(col: int, key: str) -> bool:
    return _continues_above(col, key)


def logical_rects(tiles: int = 3) -> list[tuple[int, int, int, int, tuple]]:
    """Seam-centerline rectangles over a tiles x tiles block. Same id == same mat."""
    rects = []
    for tx in range(tiles):
        for ty in range(tiles):
            ox = tx * W
            oy = ty * H
            for col, pieces in COLUMN_PIECES.items():
                phase = col * PHASE
                gc = tx * 3 + col
                for key, y0, y1 in pieces:
                    # n is stable across the tile edge for a mat that wraps.
                    n = (oy + y0 - phase) // L
                    rects.append((ox + col * S, oy + y0, ox + col * S + S, oy + y1, (gc, n)))
    return _merge_same_id(rects)


def _merge_same_id(rects: list[tuple]) -> list[tuple]:
    pending = list(rects)
    merged: list[tuple] = []
    while pending:
        x0, y0, x1, y1, ident = pending.pop()
        grew = True
        while grew:
            grew = False
            rest = []
            for rx0, ry0, rx1, ry1, rid in pending:
                if rid != ident:
                    rest.append((rx0, ry0, rx1, ry1, rid))
                    continue
                if rx0 == x0 and rx1 == x1 and ry0 == y1:
                    y1 = ry1
                    grew = True
                elif rx0 == x0 and rx1 == x1 and ry1 == y0:
                    y0 = ry0
                    grew = True
                elif ry0 == y0 and ry1 == y1 and rx0 == x1:
                    x1 = rx1
                    grew = True
                elif ry0 == y0 and ry1 == y1 and rx1 == x0:
                    x0 = rx0
                    grew = True
                else:
                    rest.append((rx0, ry0, rx1, ry1, rid))
            pending = rest
        merged.append((x0, y0, x1, y1, ident))
    return merged


def shared_seams(rects: list[tuple]) -> tuple[list[tuple], list[tuple]]:
    horizontal: list[tuple[int, int, int]] = []  # (y, x0, x1)
    vertical: list[tuple[int, int, int]] = []  # (x, y0, y1)
    for i, a in enumerate(rects):
        ax0, ay0, ax1, ay1, aid = a
        for b in rects[i + 1 :]:
            bx0, by0, bx1, by1, bid = b
            if aid == bid:
                continue
            if ay1 == by0 or by1 == ay0:
                y = ay1 if ay1 == by0 else by1
                x0 = max(ax0, bx0)
                x1 = min(ax1, bx1)
                if x1 > x0:
                    horizontal.append((y, x0, x1))
            if ax1 == bx0 or bx1 == ax0:
                x = ax1 if ax1 == bx0 else bx1
                y0 = max(ay0, by0)
                y1 = min(ay1, by1)
                if y1 > y0:
                    vertical.append((x, y0, y1))
    return _merge_collinear(horizontal, axis="h"), _merge_collinear(vertical, axis="v")


def _merge_collinear(segs: list[tuple], axis: str) -> list[tuple]:
    groups: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for fixed, a, b in segs:
        groups[fixed].append((a, b))
    merged = []
    for fixed, spans in groups.items():
        spans.sort()
        cur_a, cur_b = spans[0]
        for a, b in spans[1:]:
            if a <= cur_b:
                cur_b = max(cur_b, b)
            else:
                merged.append((fixed, cur_a, cur_b))
                cur_a, cur_b = a, b
        merged.append((fixed, cur_a, cur_b))
    if axis not in ("h", "v"):
        raise SystemExit(axis)
    return merged


def junction_report(rects: list[tuple], focus: tuple[int, int, int, int]) -> dict:
    """Classify interior junctions. focus is the rectangle of junctions we trust
    (fully surrounded by the tiled block)."""
    horizontal, vertical = shared_seams(rects)
    fx0, fy0, fx1, fy1 = focus
    plus = []
    corners = []
    tees = []  # (x, y, stem_dx, stem_dy)

    def inside(x: int, y: int) -> bool:
        return fx0 <= x <= fx1 and fy0 <= y <= fy1

    for y, hx0, hx1 in horizontal:
        for x, vy0, vy1 in vertical:
            h_through = hx0 < x < hx1
            v_through = vy0 < y < vy1
            h_ends = x == hx0 or x == hx1
            v_ends = y == vy0 or y == vy1
            if not (h_through or h_ends) or not (v_through or v_ends):
                continue
            if not inside(x, y):
                continue
            if h_through and v_through:
                plus.append((x, y))
                continue
            if h_through and v_ends:
                # Vertical seam dies on a horizontal through-line.
                stem_dy = 1 if y == vy0 else -1
                tees.append((x, y, 0, stem_dy))
                continue
            if v_through and h_ends:
                stem_dx = 1 if x == hx0 else -1
                tees.append((x, y, stem_dx, 0))
                continue
            if h_ends and v_ends:
                corners.append((x, y))

    pinwheels = _same_chirality_pinwheels(tees, focus)
    return {
        "plus": plus,
        "corners": corners,
        "tees": tees,
        "pinwheels": pinwheels,
        "horizontal": horizontal,
        "vertical": vertical,
    }


def _same_chirality_pinwheels(tees: list[tuple], focus: tuple[int, int, int, int]) -> list[tuple]:
    """Four T-junctions, one stem in each cardinal direction, all rotating the
    same way around their centroid. That is the hooked cross / windmill.
    A running bond only has left/right stems, so it cannot match.
    """
    by_dir: dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)
    for x, y, dx, dy in tees:
        by_dir[(dx, dy)].append((x, y))
    dirs = [(1, 0), (-1, 0), (0, 1), (0, -1)]
    if any(not by_dir[d] for d in dirs):
        return []
    fx0, fy0, fx1, fy1 = focus
    # One cell inside the surrounding tile, so a pinwheel that straddles the
    # tile edge is included and junctions clipped by the sample border are not.
    span = max(fx1 - fx0, fy1 - fy0)
    pad = max(L, span - S)
    found = []
    # Bound the search: stems are local. Compare each east-stem T to nearby others.
    for ex, ey in by_dir[(1, 0)]:
        for wx, wy in by_dir[(-1, 0)]:
            if abs(wx - ex) > 2 * L or abs(wy - ey) > 2 * L:
                continue
            for sx, sy in by_dir[(0, 1)]:
                if max(abs(sx - ex), abs(sx - wx), abs(sy - ey), abs(sy - wy)) > 2 * L:
                    continue
                for nx, ny in by_dir[(0, -1)]:
                    pts = [(ex, ey, 1, 0), (wx, wy, -1, 0), (sx, sy, 0, 1), (nx, ny, 0, -1)]
                    xs = [p[0] for p in pts]
                    ys = [p[1] for p in pts]
                    if max(xs) - min(xs) > 2 * L or max(ys) - min(ys) > 2 * L:
                        continue
                    cx = sum(xs) / 4
                    cy = sum(ys) / 4
                    if not (fx0 <= cx <= fx1 and fy0 <= cy <= fy1):
                        continue
                    if min(xs) < fx0 - pad or max(xs) > fx1 + pad:
                        continue
                    if min(ys) < fy0 - pad or max(ys) > fy1 + pad:
                        continue
                    crosses = []
                    for x, y, dx, dy in pts:
                        rx, ry = x - cx, y - cy
                        crosses.append(rx * dy - ry * dx)
                    if any(c == 0 for c in crosses):
                        continue
                    if all(c > 0 for c in crosses) or all(c < 0 for c in crosses):
                        found.append(tuple(pts))
                        return found
    return found


def assert_clean(label: str, rects: list[tuple], focus: tuple[int, int, int, int]) -> dict:
    report = junction_report(rects, focus)
    problems = []
    if report["plus"]:
        problems.append(f"{len(report['plus'])} plus junctions, first {report['plus'][:4]}")
    if report["corners"]:
        problems.append(f"{len(report['corners'])} corner junctions, first {report['corners'][:4]}")
    if report["pinwheels"]:
        problems.append(f"same-chirality pinwheel at {report['pinwheels'][0]}")
    stems = {(dx, dy) for _, _, dx, dy in report["tees"]}
    vertical_stems = stems & {(0, 1), (0, -1)}
    if vertical_stems:
        problems.append(f"vertical stems present {vertical_stems}; through-lines are not all parallel")
    if not report["tees"]:
        problems.append("no T-junctions; tile has no mat seams")
    if problems:
        raise SystemExit(label + " failed the junction rule:\n  " + "\n  ".join(problems))
    return report


def legacy_pinwheel_rects(tiles: int = 3) -> list[tuple]:
    """The previous art: six mats whose seams hook the same way around the middle."""
    pieces = (
        (0, 0, 2 * S, S, "a"),
        (2 * S, 0, W, 2 * S, "b"),
        (0, S, 2 * S, 2 * S, "c"),
        (0, 2 * S, S, H, "d"),
        (S, 2 * S, W, 3 * S, "e"),
        (S, 3 * S, W, H, "f"),
    )
    rects = []
    for tx in range(tiles):
        for ty in range(tiles):
            ox, oy = tx * W, ty * H
            for x0, y0, x1, y1, key in pieces:
                rects.append((ox + x0, oy + y0, ox + x1, oy + y1, (tx, ty, key)))
    return rects


def assert_detector_catches_legacy() -> None:
    focus = (W, H, 2 * W, 2 * H)
    report = junction_report(legacy_pinwheel_rects(), focus)
    if not report["pinwheels"]:
        raise SystemExit(
            "junction detector did not flag the old pinwheel layout; "
            f"tees={len(report['tees'])} plus={len(report['plus'])} corners={len(report['corners'])}"
        )


def raster_rects(rgb: bytes, tiles: int = 3) -> list[tuple]:
    """Flood-fill a tiles x tiles repeat. Returns seam-free rectangles in pixel
    coordinates, expanded back to seam centerlines is unnecessary: shared edges
    of the content rects are inset by HALF, so we expand each rect back out to
    the crack centerline before classifying junctions.
    """
    tw, th = tiles * W, tiles * H
    seen = bytearray(tw * th)

    def pix_seam(x: int, y: int) -> bool:
        sx = x % W
        sy = y % H
        i = (sy * W + sx) * 3
        return rgb[i : i + 3] == bytes(SEAM_RGB)

    def color_at(x: int, y: int) -> bytes:
        sx = x % W
        sy = y % H
        i = (sy * W + sx) * 3
        return rgb[i : i + 3]

    rects = []
    for y in range(th):
        row = y * tw
        for x in range(tw):
            if seen[row + x] or pix_seam(x, y):
                continue
            target = color_at(x, y)
            q = deque([(x, y)])
            seen[row + x] = 1
            minx = maxx = x
            miny = maxy = y
            while q:
                cx, cy = q.popleft()
                if cx < minx:
                    minx = cx
                if cx > maxx:
                    maxx = cx
                if cy < miny:
                    miny = cy
                if cy > maxy:
                    maxy = cy
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if nx < 0 or ny < 0 or nx >= tw or ny >= th:
                        continue
                    ni = ny * tw + nx
                    if seen[ni] or pix_seam(nx, ny):
                        continue
                    if color_at(nx, ny) != target:
                        continue
                    seen[ni] = 1
                    q.append((nx, ny))
            # Content bounds are inclusive. Expand to the crack centerline when the
            # content was inset, and to the sample edge when the mat was cut off.
            x0 = minx - HALF if minx > 0 else 0
            y0 = miny - HALF if miny > 0 else 0
            x1 = maxx + 1 + HALF if maxx < tw - 1 else tw
            y1 = maxy + 1 + HALF if maxy < th - 1 else th
            rects.append((x0, y0, x1, y1, (minx, miny, target)))
    return rects


def assert_raster_matches_logic(rgb: bytes) -> None:
    focus = (W + S, H + S, 2 * W - S, 2 * H - S)
    # Keep the check off the sample border, where expansion is clipped.
    rects = raster_rects(rgb)
    report = assert_clean("raster", rects, focus)
    # Every interior T from the logical model should exist in the raster too.
    logical = junction_report(logical_rects(), (W, H, 2 * W, 2 * H))
    raster_pts = {(x, y) for x, y, _, _ in report["tees"]}
    missing = [
        (x, y, dx, dy)
        for x, y, dx, dy in logical["tees"]
        if W + S <= x <= 2 * W - S and H + S <= y <= 2 * H - S and (x, y) not in raster_pts
    ]
    if missing:
        raise SystemExit(f"raster is missing logical T-junctions {missing[:6]}")


def assert_contrast() -> None:
    seam_l = lum(SEAM_RGB)
    panels = list(PANELS.values())
    darkest = min(panels, key=lum)
    lightest = max(panels, key=lum)
    if any(lum(p) <= seam_l for p in panels):
        raise SystemExit("seam is not darker than every panel")
    # Old seam (6,10,16) vs darkest panel is about 4.3x and reads as a black figure.
    if lum(darkest) / seam_l > 3.0:
        raise SystemExit(f"seam is too strong against the darkest mat ({lum(darkest) / seam_l:.2f}x)")
    if lum(lightest) / seam_l < 2.2:
        raise SystemExit("seam disappears against the lightest mat")


def assert_png_roundtrip(rgb: bytes) -> None:
    raw = OUT.read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit("output is not a png")
    if len(raw) > 64_000:
        raise SystemExit(f"png is {len(raw)} bytes; keep the tile small for page load")
    # Spot-check a few content pixels and a crack pixel against the buffer we drew.
    def at(x: int, y: int) -> tuple[int, int, int]:
        i = (y * W + x) * 3
        return tuple(rgb[i : i + 3])

    # Column 0 carries a half crack on the top and bottom tile edges.
    # Columns 1 and 2 wrap a mat across that edge, so those pixels stay panel color.
    if at(S // 2, HALF // 2) != SEAM_RGB or at(S // 2, H - 2) != SEAM_RGB:
        raise SystemExit("tile edge is missing its half crack")
    if at(S + S // 2, 1) == SEAM_RGB or at(S + S // 2, H - 2) == SEAM_RGB:
        raise SystemExit("staggered column drew a seam across a mat that wraps the tile")


def _overlap(a0: int, a1: int, b0: int, b1: int) -> bool:
    return min(a1, b1) > max(a0, b0)


def _stack_pieces(height: int, phase: int, length: int) -> list[tuple[int, int, int]]:
    """(y0, y1, k) inside one tile. A mat that crosses the edge shares k."""
    if phase == 0:
        return [(k * length, (k + 1) * length, k) for k in range(height // length)]
    frags: list[tuple[int, int, int]] = []
    y = phase
    k = 0
    while y < height:
        y1 = y + length
        if y1 <= height:
            frags.append((y, y1, k))
        else:
            frags.append((y, height, k))
            frags.append((0, y1 - height, k))
        k += 1
        y += length
    return frags


def _column_mats(columns: tuple, height: int) -> list[list[tuple[int, int, int, int]]]:
    groups: dict[tuple, list[tuple[int, int, int, int]]] = {}
    order: list[tuple] = []
    for ci, (x, cw, phase, length) in enumerate(columns):
        for y0, y1, k in _stack_pieces(height, phase, length):
            mid = (ci, k)
            if mid not in groups:
                groups[mid] = []
                order.append(mid)
            groups[mid].append((x, y0, x + cw, y1))
    return [groups[mid] for mid in order]


def _column_rects(columns: tuple, width: int, height: int, tiles: int = 3) -> list[tuple]:
    rects = []
    for tx in range(tiles):
        for ty in range(tiles):
            ox, oy = tx * width, ty * height
            for ci, (x, cw, phase, length) in enumerate(columns):
                for y0, y1, _k in _stack_pieces(height, phase, length):
                    n = (oy + y0 - phase) // length
                    rects.append((ox + x, oy + y0, ox + x + cw, oy + y1, (ci, tx, n)))
    return _merge_same_id(rects)


def _grid_mats(pieces: tuple, cols: int = 3, rows: int = 4) -> list[list[tuple[int, int, int, int]]]:
    width, height = cols * S, rows * S
    mats = []
    for kind, c, r, dc, dr in pieces:
        cells = [((c + dc * k) % cols, (r + dr * k) % rows) for k in range(1 if kind == "M" else 2)]
        if kind == "M":
            cc, rr = cells[0]
            mats.append([(cc * S, rr * S, (cc + 1) * S, (rr + 1) * S)])
            continue
        if kind == "H":
            ys = cells[0][1]
            xs = [cc for cc, _rr in cells]
            y0, y1 = ys * S, ys * S + S
            if abs(xs[0] - xs[1]) == 1:
                x0 = min(xs) * S
                mats.append([(x0, y0, x0 + 2 * S, y1)])
            else:
                mats.append([((cols - 1) * S, y0, width, y1), (0, y0, S, y1)])
            continue
        xs = cells[0][0]
        ys = [rr for _cc, rr in cells]
        x0, x1 = xs * S, xs * S + S
        if abs(ys[0] - ys[1]) == 1:
            y0 = min(ys) * S
            mats.append([(x0, y0, x1, y0 + 2 * S)])
        else:
            mats.append([(x0, (rows - 1) * S, x1, height), (x0, 0, x1, S)])
    return mats


def _grid_rects(pieces: tuple, cols: int = 3, rows: int = 4, tiles: int = 3) -> list[tuple]:
    rects = []
    for tx in range(tiles):
        for ty in range(tiles):
            for pi, (kind, c, r, dc, dr) in enumerate(pieces):
                gc = tx * cols + c
                gr = ty * rows + r
                if kind == "M":
                    rects.append((gc * S, gr * S, (gc + 1) * S, (gr + 1) * S, ("M", gc, gr, pi)))
                elif kind == "H":
                    c0 = gc if dc == 1 else gc + dc
                    rects.append((c0 * S, gr * S, (c0 + 2) * S, (gr + 1) * S, ("H", c0, gr, pi)))
                else:
                    r0 = gr if dr == 1 else gr + dr
                    rects.append((gc * S, r0 * S, (gc + 1) * S, (r0 + 2) * S, ("V", gc, r0, pi)))
    return rects


def _share_edge(a: list[tuple], b: list[tuple], width: int, height: int) -> bool:
    shifts = ((0, 0), (width, 0), (-width, 0), (0, height), (0, -height))
    for ax0, ay0, ax1, ay1 in a:
        for bx0, by0, bx1, by1 in b:
            for dx, dy in shifts:
                u0, v0, u1, v1 = bx0 + dx, by0 + dy, bx1 + dx, by1 + dy
                if (ax1 == u0 or u1 == ax0) and _overlap(ay0, ay1, v0, v1):
                    return True
                if (ay1 == v0 or v1 == ay0) and _overlap(ax0, ax1, u0, u1):
                    return True
    return False


def _color_mats(mats: list[list[tuple]], width: int, height: int) -> list[tuple[int, int, int]]:
    palette = list(PANELS.values())
    adj = [set() for _ in mats]
    for i, a in enumerate(mats):
        for j in range(i + 1, len(mats)):
            if _share_edge(a, mats[j], width, height):
                adj[i].add(j)
                adj[j].add(i)
    chosen: list[int | None] = [None] * len(mats)
    for i in range(len(mats)):
        used = {chosen[j] for j in adj[i] if chosen[j] is not None}
        for color in range(len(palette)):
            if color not in used:
                chosen[i] = color
                break
        if chosen[i] is None:
            raise SystemExit(f"six blues cannot color mat {i}; adjacent mats would share a color")
    return [palette[i] for i in chosen]


def _continues(pieces: list[tuple], edge: str, box: tuple, width: int, height: int) -> bool:
    x0, y0, x1, y1 = box
    for u0, v0, u1, v1 in pieces:
        if (u0, v0, u1, v1) == box:
            continue
        if edge == "left" and u1 == width and x0 == 0 and _overlap(y0, y1, v0, v1):
            return True
        if edge == "right" and x1 == width and u0 == 0 and _overlap(y0, y1, v0, v1):
            return True
        if edge == "top" and v1 == height and y0 == 0 and _overlap(x0, x1, u0, u1):
            return True
        if edge == "bottom" and y1 == height and v0 == 0 and _overlap(x0, x1, u0, u1):
            return True
    return False


def _render_mats(mats: list[list[tuple]], width: int, height: int) -> bytes:
    colors = _color_mats(mats, width, height)
    px = bytearray(bytes(SEAM_RGB) * (width * height))

    def fill(x0: int, y0: int, x1: int, y1: int, color: tuple[int, int, int]) -> None:
        if x1 <= x0 or y1 <= y0:
            return
        row = bytes(color) * (x1 - x0)
        for y in range(y0, y1):
            start = (y * width + x0) * 3
            px[start : start + (x1 - x0) * 3] = row

    for pieces, color in zip(mats, colors):
        for box in pieces:
            x0, y0, x1, y1 = box
            left = x0 if _continues(pieces, "left", box, width, height) else x0 + HALF
            right = x1 if _continues(pieces, "right", box, width, height) else x1 - HALF
            top = y0 if _continues(pieces, "top", box, width, height) else y0 + HALF
            bot = y1 if _continues(pieces, "bottom", box, width, height) else y1 - HALF
            fill(left, top, right, bot, color)
    return bytes(px)


def _assert_partition(mats: list[list[tuple]], width: int, height: int) -> None:
    boxes = [box for pieces in mats for box in pieces]
    area = 0
    for x0, y0, x1, y1 in boxes:
        if x0 < 0 or y0 < 0 or x1 > width or y1 > height or x1 <= x0 or y1 <= y0:
            raise SystemExit(f"mat fragment {(x0, y0, x1, y1)} leaves the tile")
        area += (x1 - x0) * (y1 - y0)
    if area != width * height:
        raise SystemExit(f"mats cover {area}px of a {width * height}px tile")
    for i, a in enumerate(boxes):
        ax0, ay0, ax1, ay1 = a
        for b in boxes[i + 1 :]:
            bx0, by0, bx1, by1 = b
            if _overlap(ax0, ax1, bx0, bx1) and _overlap(ay0, ay1, by0, by1):
                raise SystemExit(f"mats overlap {a} and {b}")


def _raster_report(rgb: bytes, width: int, height: int, tiles: int = 3) -> dict:
    tw, th = tiles * width, tiles * height
    seam = bytes(SEAM_RGB)
    seen = bytearray(tw * th)

    def pix(x: int, y: int) -> bytes:
        i = ((y % height) * width + (x % width)) * 3
        return rgb[i : i + 3]

    rects = []
    for y in range(th):
        for x in range(tw):
            if seen[y * tw + x] or pix(x, y) == seam:
                continue
            target = pix(x, y)
            q = deque([(x, y)])
            seen[y * tw + x] = 1
            minx = maxx = x
            miny = maxy = y
            while q:
                cx, cy = q.popleft()
                if cx < minx:
                    minx = cx
                if cx > maxx:
                    maxx = cx
                if cy < miny:
                    miny = cy
                if cy > maxy:
                    maxy = cy
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if nx < 0 or ny < 0 or nx >= tw or ny >= th:
                        continue
                    ni = ny * tw + nx
                    if seen[ni] or pix(nx, ny) == seam or pix(nx, ny) != target:
                        continue
                    seen[ni] = 1
                    q.append((nx, ny))
            x0 = minx - HALF if minx > 0 else 0
            y0 = miny - HALF if miny > 0 else 0
            x1 = maxx + 1 + HALF if maxx < tw - 1 else tw
            y1 = maxy + 1 + HALF if maxy < th - 1 else th
            rects.append((x0, y0, x1, y1, (minx, miny)))
    focus = (width, height, 2 * width, 2 * height)
    return junction_report(rects, focus)


def _distinct(points: list[tuple], focus: tuple[int, int, int, int]) -> set[tuple[int, int]]:
    """Fold the far edge of an inclusive focus back onto the near edge."""
    fx0, fy0, fx1, fy1 = focus
    folded = set()
    for x, y in points:
        if x == fx1:
            x = fx0
        if y == fy1:
            y = fy0
        folded.add((x, y))
    return folded


# Horizontal stacks at x=0 (seams on the tile edge) and x=960 (offset 120).
# The vertical pair sits in the middle, phases 160 and 320, so its ends miss
# both horizontal seam sets. CSS --mat-cols/--mat-rows for this image: 6 and 4.
BRICK_COLUMNS = (
    (0, 480, 0, 240),
    (480, 240, 160, 480),
    (720, 240, 320, 480),
    (960, 480, 120, 240),
)
BRICK_SIZE = (1440, 960)

# 720x960 mixed layouts from the 3x4 search: 2 distinct pluses, no pinwheel, no L.
# Band: two stacked horizontals over a vertical field, with a side-by-side pair.
FALLBACK_BAND = (
    ("H", 0, 0, 1, 0),
    ("V", 2, 0, 0, -1),
    ("H", 0, 1, 1, 0),
    ("V", 2, 1, 0, 1),
    ("V", 0, 2, 0, 1),
    ("V", 1, 2, 0, 1),
)
# Tuck: doubled horizontals beside one vertical, vertical mats above them.
FALLBACK_TUCK = (
    ("V", 0, 0, 0, 1),
    ("V", 1, 0, 0, 1),
    ("V", 2, 0, 0, -1),
    ("V", 2, 1, 0, 1),
    ("H", 0, 2, 1, 0),
    ("H", 0, 3, 1, 0),
)


def _spot_check_seams(rgb: bytes, columns: tuple, width: int, height: int) -> None:
    def at(x: int, y: int) -> tuple[int, int, int]:
        i = (y * width + x) * 3
        return tuple(rgb[i : i + 3])

    for x, cw, phase, _length in columns:
        cx = x + cw // 2
        if phase == 0:
            if at(cx, HALF // 2) != SEAM_RGB or at(cx, height - 2) != SEAM_RGB:
                raise SystemExit("tile edge is missing its half crack")
        elif at(cx, 1) == SEAM_RGB or at(cx, height - 2) == SEAM_RGB:
            raise SystemExit("drew a seam across a mat that wraps the tile")


def _gate(name: str, report: dict, focus: tuple[int, int, int, int], plus_allowed: int) -> int:
    """Plain plus junctions may match plus_allowed. A pinwheel or L-corner never may."""
    if report["pinwheels"]:
        raise SystemExit(f"{name} has a same-chirality pinwheel {report['pinwheels'][0]}")
    if report["corners"]:
        raise SystemExit(f"{name} has {len(report['corners'])} L-corners, first {report['corners'][:4]}")
    found = len(_distinct(report["plus"], focus))
    if found != plus_allowed:
        raise SystemExit(f"{name} has {found} plus junctions; this layout allows {plus_allowed}")
    return found


def _assert_gate_rejects_hook() -> None:
    """The old hooked cross must fail even if pluses are waved through."""
    focus = (W, H, 2 * W, 2 * H)
    legacy = junction_report(legacy_pinwheel_rects(), focus)
    try:
        _gate("legacy pinwheel", legacy, focus, plus_allowed=99)
    except SystemExit as error:
        if "pinwheel" not in str(error):
            raise
        return
    raise SystemExit("gate accepted the hooked-cross layout")


def _check_generated(name: str, rgb: bytes, logical: dict, width: int, height: int, plus_allowed: int) -> None:
    focus = (width, height, 2 * width, 2 * height)
    _gate(name, logical, focus, plus_allowed)
    raster = _raster_report(rgb, width, height)
    _gate(f"{name} raster", raster, focus, plus_allowed)
    if _distinct(raster["plus"], focus) != _distinct(logical["plus"], focus):
        raise SystemExit(f"{name} raster pluses {_distinct(raster['plus'], focus)}")
    logical_tees = {(x, y, dx, dy) for x, y, dx, dy in logical["tees"]}
    raster_tees = {(x, y, dx, dy) for x, y, dx, dy in raster["tees"]}
    if logical_tees != raster_tees:
        raise SystemExit(
            f"{name} raster tees differ: missing {list(logical_tees - raster_tees)[:4]} "
            f"extra {list(raster_tees - logical_tees)[:4]}"
        )


def _build_brick() -> tuple[bytes, dict]:
    width, height = BRICK_SIZE
    mats = _column_mats(BRICK_COLUMNS, height)
    _assert_partition(mats, width, height)
    rgb = _render_mats(mats, width, height)
    _spot_check_seams(rgb, BRICK_COLUMNS, width, height)
    logical = junction_report(_column_rects(BRICK_COLUMNS, width, height), (width, height, 2 * width, 2 * height))
    _check_generated("brick-pair", rgb, logical, width, height, 0)
    return rgb, logical


def _build_grid(name: str, pieces: tuple) -> tuple[bytes, dict]:
    width, height = 3 * S, 4 * S
    mats = _grid_mats(pieces)
    _assert_partition(mats, width, height)
    rgb = _render_mats(mats, width, height)
    logical = junction_report(_grid_rects(pieces), (width, height, 2 * width, 2 * height))
    _check_generated(name, rgb, logical, width, height, 2)
    return rgb, logical


def _write_checked(path: Path, rgb: bytes, width: int, height: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    write_png(path, width, height, rgb)
    raw = path.read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit("output is not a png")
    if len(raw) > 64_000:
        raise SystemExit(f"png is {len(raw)} bytes; keep the tile small for page load")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Regenerate the home tatami tile.")
    parser.add_argument(
        "--layout",
        default="fallback-tuck",
        choices=("fallback-tuck", "brick-pair", "running-bond", "fallback-band"),
        help="fallback-tuck is the shipped 720x960 image (2 pluses, no pinwheel)",
    )
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args(argv)
    if args.list:
        print("fallback-tuck   720x960  default  plus=2 pinwheel=0  doubled horizontals beside one vertical")
        print("fallback-band   720x960           plus=2 pinwheel=0  stacked horizontals over verticals")
        print("brick-pair     1440x960           plus=0 pinwheel=0  horizontal brick, vertical pair centered")
        print("running-bond    720x960           plus=0 pinwheel=0  all-vertical stagger")
        return

    assert_detector_catches_legacy()
    _assert_gate_rejects_hook()
    assert_contrast()
    assert_clean("running bond", logical_rects(), (W, H, 2 * W, 2 * H))

    if args.layout == "running-bond":
        rgb = render_tile()
        _write_checked(args.out, rgb, W, H)
        if args.out == OUT:
            assert_png_roundtrip(rgb)
            assert_raster_matches_logic(rgb)
        logical = junction_report(logical_rects(), (W, H, 2 * W, 2 * H))
        print(f"wrote {args.out} ({args.out.stat().st_size} bytes) layout=running-bond")
    elif args.layout == "brick-pair":
        rgb, logical = _build_brick()
        _write_checked(args.out, rgb, *BRICK_SIZE)
        print(f"wrote {args.out} ({args.out.stat().st_size} bytes) layout=brick-pair")
        print("page CSS is the 720x960 size; brick-pair needs a 6 by 4 background-size")
    elif args.layout == "fallback-band":
        rgb, logical = _build_grid("fallback-band", FALLBACK_BAND)
        _write_checked(args.out, rgb, 3 * S, 4 * S)
        print(f"wrote {args.out} ({args.out.stat().st_size} bytes) layout=fallback-band")
    else:
        rgb, logical = _build_grid("fallback-tuck", FALLBACK_TUCK)
        _write_checked(args.out, rgb, 3 * S, 4 * S)
        print(f"wrote {args.out} ({args.out.stat().st_size} bytes) layout=fallback-tuck")

    focus_w = BRICK_SIZE[0] if args.layout == "brick-pair" else W
    focus_h = BRICK_SIZE[1] if args.layout == "brick-pair" else H
    distinct = len(_distinct(logical["plus"], (focus_w, focus_h, 2 * focus_w, 2 * focus_h)))
    stems = sorted({(dx, dy) for *_, dx, dy in logical["tees"]})
    print(f"T-junctions in the center tile: {len(logical['tees'])} stems={stems}")
    print(
        f"distinct plus={distinct} corners={len(logical['corners'])} "
        f"pinwheels={len(logical['pinwheels'])}"
    )
    print("legacy pinwheel layout is still detected")


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        sys.exit(0)
