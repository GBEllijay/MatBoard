#!/usr/bin/env python3
"""Regenerate public/home-mat-tatami.png as a pinwheel-free tatami tile.

The previous tile was a clockwise hooked-cross (pinwheel) of 2:1 mats. This
script draws a running bond instead and refuses to write the PNG unless the
junction rule holds on a 3x3 repeat, including across tile edges.

Layout
  Vertical 2:1 mats (short side 240px, long side 480px) on the existing
  720x960 tile, so on-screen scale matches the old art. Columns are staggered
  by one third of the mat length (0, 160, 320). Three columns close that
  stagger when the tile repeats, and adjacent columns never share a horizontal
  seam, so a plus junction cannot form. Every interior junction is a T whose
  through-line is vertical. Stems only point left or right, so four seams
  cannot turn the same way around a point.

Seams
  10px cracks, 5px on the tile edge so two tiles meet as one 10px line.
  The crack is a dark navy, not the old near-black, so the lines stay quiet.
  A mat that crosses the top/bottom edge is one color with no seam on that
  edge; the other half of the mat is on the neighboring tile.

Check
  python3 scripts/generate-home-mat-tatami.py

Mixed horizontal and vertical mats were searched (scripts/search-mat-layouts.py).
None tile this 720x960 repeat without a plus junction, so the running bond stays
the default.
"""

from __future__ import annotations

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
    # Pad so a pinwheel centered in the focus tile is fully included, without
    # using T-junctions on the outer sample border (those can be truncated).
    pad = L
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


def main() -> None:
    assert_detector_catches_legacy()
    assert_contrast()
    focus = (W, H, 2 * W, 2 * H)
    logical = assert_clean("layout", logical_rects(), focus)
    rgb = render_tile()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    write_png(OUT, W, H, rgb)
    assert_png_roundtrip(rgb)
    assert_raster_matches_logic(rgb)
    stems = sorted({(dx, dy) for *_, dx, dy in logical["tees"]})
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes)")
    print(f"interior T-junctions in the center tile: {len(logical['tees'])}")
    print(f"stem directions: {stems}")
    print(f"plus={len(logical['plus'])} corners={len(logical['corners'])} pinwheels={len(logical['pinwheels'])}")
    print("legacy pinwheel layout is detected; new tile is clean across a 3x3 repeat")


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        sys.exit(0)
