/**
 * Canvas stage from assessment-d8.html.
 * Pointed pyramids are the original drawing. Curved relief bows the same apex edges.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReliefScore } from './geometry.ts';
import { TOPO_LEVEL, TOPO_REVISION, reliefScale, tileTone, toneForName, topoWords, type TileTone, type TopoModel, type Vec } from './topo.ts';
import {
  EXAMPLE_OPPONENT_FACTORS,
  EXAMPLE_OPPONENT_SWEEPS,
  EXAMPLE_SELF_FACTORS,
  EXAMPLE_SELF_SWEEPS,
  type CompareFactors,
} from './overlay.ts';
import { assignDrillCells, barycentric, classifyTap, connectionLayout, labelVisible, midpointQuarters, pointToSegment, screenSides } from './demoLinks.ts';
import {
  FOCUS_FRAME_ZOOM,
  REST_ZOOM,
  ZOOM_STEP,
  clampCrystalZoom,
  crystalLabelState,
  drillAfterZoom,
  tileShowsTechniqueLabel,
  zoomAfterClosingDrill,
  zoomPastRest,
} from './labels.ts';

export type TopoStyle = 'pyramid' | 'curved';

type Props = {
  model: TopoModel;
  style: TopoStyle;
  focus: number;
  selected: number;
  comparison: boolean;
  pair: boolean;
  /** Real self and opponent face scores. Omitted, the example factors are used. */
  compareFactors?: CompareFactors | null;
  links: readonly string[];
  drillPath: readonly string[];
  relief: number;
  hue: number;
  /** Face indexes to stroke on the solid. Empty leaves the diamond unchanged. */
  marked?: readonly number[];
  /** bare hides the zoom, pause, reset, and factor buttons for the sheet thumbnail. */
  chrome?: 'full' | 'bare';
  /** False keeps the diamond still. The full D8 page spins. */
  spin?: boolean;
  onExpand?: () => void;
  onFocus: (index: number) => void;
  onSelect: (index: number) => void;
  onDrill: (path: string[], detail: boolean) => void;
};

type Proj = {
  index: number;
  front: boolean;
  shade: number;
  z: number;
  screen: [number, number][];
  center: [number, number];
};

export function TopoStage({ model, style, focus, selected, comparison, pair, compareFactors = null, links, drillPath, relief, hue, marked = [], chrome = 'full', spin = true, onExpand, onFocus, onSelect, onDrill }: Props) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const labelsRef = useRef<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(
    () => !spin || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches),
  );
  const [labelView, setLabelView] = useState({ zoom: REST_ZOOM, drilledFace: -1, frontFace: -1 });
  const view = useRef({
    rx: 0.28,
    ry: 0.4,
    zoom: REST_ZOOM,
    drilledFace: -1,
    publishedFront: -2,
    paused,
    focus,
    selected,
    style,
    width: 1,
    height: 1,
    anim: null as null | { rx0: number; ry0: number; rx1: number; ry1: number; z0: number; z1: number; t: number },
    drag: null as null | { x: number; y: number; lx: number; ly: number; moved: boolean },
    pinch: null as null | { d: number; z: number },
    pointers: new Map<number, [number, number]>(),
    projected: [] as Proj[],
    faceHits: [] as { faceIndex: number; front: boolean; z: number; screen: [number, number][] }[],
    comparison: false,
    pair: false,
    compareFactors: null as CompareFactors | null,
    links: [] as string[],
    relief: 1,
    hue: 1,
    marked: [] as readonly number[],
    chrome: 'full' as 'full' | 'bare',
    onExpand: () => {},
    grown: [] as { name: string; corners: [Vec, Vec, Vec] }[],
    pendingPath: null as string[] | null,
    onDrill: (_path: string[], _detail: boolean) => {},
    lastTap: null as null | { time: number; name: string },
    activeName: '',
    activeCorners: null as [Vec, Vec, Vec] | null,
    activeScreen: null as [[number, number], [number, number], [number, number]] | null,
    sideHits: [] as { edge: 0 | 1 | 2; target: string | null; a: [number, number]; b: [number, number] }[],
    cellHits: [] as { name: string | null; corners: [Vec, Vec, Vec]; screen: [[number, number], [number, number], [number, number]] }[],
    frameKey: '',
    openedAt: 0,
    applyZoom: (_next: number) => {},
    onFrontFace: (_index: number) => {},
    api: null as null | {
      grow: (target: string) => void
      enter: (target: string, corners: [Vec, Vec, Vec]) => void
      detail: () => void
    },
  });
  view.current.paused = paused;
  view.current.focus = focus;
  view.current.selected = selected;
  view.current.style = style;
  view.current.comparison = comparison;
  view.current.pair = pair;
  view.current.compareFactors = compareFactors;
  view.current.links = [...links];
  view.current.onDrill = onDrill;
  view.current.relief = relief;
  view.current.hue = hue;
  view.current.marked = marked;
  view.current.chrome = chrome;
  view.current.onExpand = onExpand ?? (() => {});

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const labels = labelsRef.current;
    if (!stage || !canvas || !labels) return undefined;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    const faceNodes = [...labels.querySelectorAll<HTMLElement>('.topo-label-face')];
    const tileNodes = [...labels.querySelectorAll<HTMLElement>('[data-technique-label]')];
    const state = view.current;
    const resize = () => {
      state.width = stage.clientWidth || 320;
      state.height = stage.clientHeight || 440;
      const ratio = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2);
      canvas.width = state.width * ratio;
      canvas.height = state.height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    observer?.observe(stage);
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      state.applyZoom(state.zoom * Math.exp(-event.deltaY * 0.0015));
    };
    stage.addEventListener('wheel', onWheel, { passive: false });

    const rot = (point: Vec): Vec => {
      let x = point[0];
      let y = point[1];
      let z = point[2];
      let c = Math.cos(state.ry);
      let s = Math.sin(state.ry);
      [x, z] = [x * c + z * s, -x * s + z * c];
      c = Math.cos(state.rx);
      s = Math.sin(state.rx);
      [y, z] = [y * c - z * s, y * s + z * c];
      return [x, y, z];
    };
    const screen = (point: Vec): [number, number] => {
      const focal = state.height / 2 / Math.tan((19 * Math.PI) / 180) * state.zoom;
      const depth = 5.5 - point[2];
      return [state.width / 2 + (point[0] * focal) / depth, state.height / 2 - (point[1] * focal) / depth];
    };
    const normal = (a: Vec, b: Vec, c: Vec): Vec => {
      const u: Vec = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v: Vec = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    };
    const rootTile = () => {
      if (state.selected < 0) return null;
      const tile = model.tiles[state.selected];
      return tile?.move ? tile : null;
    };
    const rootCorners = (tile: NonNullable<ReturnType<typeof rootTile>>): [Vec, Vec, Vec] =>
      tile.tri.map((corner) => corner.p) as [Vec, Vec, Vec];
    const projectTri = (corners: [Vec, Vec, Vec]): [[number, number], [number, number], [number, number]] =>
      corners.map((point) => screen(rot(point))) as [[number, number], [number, number], [number, number]];
    const spanOf = (pts: [number, number][]) => {
      const xs = pts.map((point) => point[0]);
      const ys = pts.map((point) => point[1]);
      return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    };
    let labelBoxes: { x: number; y: number; w: number; h: number }[] = [];
    const paintLabel = (x: number, y: number, text: string, linked: boolean) => {
      context.font = '11px sans-serif';
      context.textAlign = 'center';
      const width = Math.min(116, Math.max(44, text.length * 6.5 + 8));
      const rect = { x: x - width / 2, y: y - 9, w: width, h: 16 };
      const crowded = labelBoxes.some(
        (other) => rect.x < other.x + other.w + 4 && rect.x + rect.w + 4 > other.x && rect.y < other.y + other.h + 4 && rect.y + rect.h + 4 > other.y,
      );
      if (crowded) return;
      labelBoxes.push(rect);
      context.fillStyle = '#071324';
      context.fillRect(rect.x, rect.y, rect.w, rect.h);
      context.fillStyle = linked ? '#e7f6ff' : 'rgba(231,246,255,.45)';
      context.fillText(text.slice(0, 18), x, y + 3);
    };
    const activeOf = () => {
      const tile = rootTile();
      if (!tile?.move) return null;
      const rootName = tile.move.name;
      if (!state.grown.length) return { name: rootName, parent: null as string | null, corners: rootCorners(tile) };
      const lastStep = state.grown[state.grown.length - 1];
      const parent = state.grown.length === 1 ? rootName : state.grown[state.grown.length - 2].name;
      return { name: lastStep.name, parent, corners: lastStep.corners };
    };
    const easeTo = (corners: [Vec, Vec, Vec], name: string, parent: string | null) => {
      const center: Vec = [
        (corners[0][0] + corners[1][0] + corners[2][0]) / 3,
        (corners[0][1] + corners[1][1] + corners[2][1]) / 3,
        (corners[0][2] + corners[1][2] + corners[2][2]) / 3,
      ];
      const targetYaw = Math.atan2(-center[0], center[2]);
      const flat = Math.hypot(center[0], center[2]);
      const targetPitch = Math.atan2(center[1], flat);
      let dy = (targetYaw - state.ry) % (2 * Math.PI);
      dy = ((dy + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      const layout = connectionLayout(name, parent);
      const parts = layout.mode === 'grid' ? layout.n : 2;
      let span = 0;
      for (let index = 0; index < 3; index += 1) {
        const from = corners[index];
        const to = corners[(index + 1) % 3];
        span = Math.max(span, Math.hypot(from[0] - to[0], from[1] - to[1], from[2] - to[2]));
      }
      const piece = Math.max(0.04, span / parts);
      const focal = state.height / 2 / Math.tan((19 * Math.PI) / 180);
      const targetPx = layout.mode === 'grid' ? 88 : 120;
      const zoom = (targetPx * 5.5) / (piece * focal);
      state.paused = true;
      setPaused(true);
      state.anim = {
        rx0: state.rx,
        ry0: state.ry,
        rx1: targetPitch,
        ry1: state.ry + dy,
        z0: state.zoom,
        z1: Math.min(18, Math.max(1.15, zoom)),
        t: 0,
      };
    };
    const roleQuarters = (corners: [Vec, Vec, Vec]) => {
      const parts = midpointQuarters(corners);
      const mark = (tri: [Vec, Vec, Vec]) => {
        const pts = projectTri(tri);
        return { tri, x: (pts[0][0] + pts[1][0] + pts[2][0]) / 3 };
      };
      const marks = parts.corners.map(mark);
      let left = marks[0];
      let right = marks[0];
      for (const item of marks) {
        if (item.x < left.x) left = item;
        if (item.x > right.x) right = item;
      }
      const base = marks.find((item) => item !== left && item !== right) ?? marks[0];
      return { center: parts.center, left: left.tri, right: right.tri, base: base.tri };
    };
    const growToward = (fromName: string, parent: string | null, corners: [Vec, Vec, Vec], nextName: string): [Vec, Vec, Vec] | null => {
      const layout = connectionLayout(fromName, parent);
      if (layout.mode === 'grid') {
        return assignDrillCells(corners, layout.names).find((cell) => cell.name === nextName)?.corners ?? null;
      }
      const role = (['left', 'base', 'right'] as const).find((item) => layout.sides[item] === nextName);
      if (!role) return null;
      return roleQuarters(corners)[role];
    };
    const syncPath = (path: readonly string[]) => {
      const tile = rootTile();
      if (!tile?.move) {
        state.grown = [];
        state.frameKey = '';
        return;
      }
      const rootName = tile.move.name;
      const wanted = path[0] === rootName ? path.slice(1, 8) : [];
      const same = wanted.length === state.grown.length && wanted.every((name, index) => state.grown[index]?.name === name);
      if (same) return;
      const prefix = wanted.length < state.grown.length && wanted.every((name, index) => state.grown[index]?.name === name);
      if (prefix) {
        state.grown = state.grown.slice(0, wanted.length);
        state.frameKey = '';
        return;
      }
      state.grown = [];
      state.frameKey = '';
      let name = rootName;
      let parent: string | null = null;
      let corners = rootCorners(tile);
      for (const next of wanted) {
        const grown = growToward(name, parent, corners, next);
        if (!grown) break;
        state.grown.push({ name: next, corners: grown });
        parent = name;
        name = next;
        corners = grown;
      }
    };
    const pathNames = () => {
      const tile = rootTile();
      return tile?.move ? [tile.move.name, ...state.grown.map((step) => step.name)] : [];
    };
    const rememberFrame = (name: string) => {
      state.frameKey = `${name}:${state.grown.length}`;
    };
    state.api = {
      grow(target) {
        const active = activeOf();
        if (!active || state.grown.length >= 7) return;
        const layout = connectionLayout(active.name, active.parent);
        const role = (['left', 'base', 'right'] as const).find((item) => layout.mode === 'edges' && layout.sides[item] === target);
        const corners = role ? roleQuarters(active.corners)[role] : active.corners;
        state.grown.push({ name: target, corners });
        rememberFrame(target);
        easeTo(corners, target, active.name);
        state.onDrill(pathNames(), false);
      },
      enter(target, corners) {
        const active = activeOf();
        if (!active || state.grown.length >= 7) return;
        state.grown.push({ name: target, corners });
        rememberFrame(target);
        easeTo(corners, target, active.name);
        state.onDrill(pathNames(), false);
      },
      detail() {
        state.onDrill(pathNames(), true);
      },
    };
    let last = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (state.pendingPath) {
        const path = state.pendingPath;
        state.pendingPath = null;
        syncPath(path);
      }
      if (state.anim) {
        state.anim.t = Math.min(1, state.anim.t + dt * 2.5);
        const k = 1 - (1 - state.anim.t) ** 3;
        state.rx = state.anim.rx0 + (state.anim.rx1 - state.anim.rx0) * k;
        state.ry = state.anim.ry0 + (state.anim.ry1 - state.anim.ry0) * k;
        state.zoom = state.anim.z0 + (state.anim.z1 - state.anim.z0) * k;
        if (state.anim.t >= 1) state.anim = null;
      } else if (!state.paused && !state.drag && state.selected < 0) state.ry += dt * (state.chrome === 'bare' ? 0.1 : 0.18);
      const light: Vec = [-0.4, 0.6, 0.7];
      const lightLength = Math.hypot(...light) || 1;
      const lit = light.map((value) => value / lightLength) as Vec;
      const projected: Proj[] = [];
      const polys: { index: number; points: [number, number][]; z: number; light: number; front: boolean; shade: number; layer: 'base' | 'self' | 'opponent' }[] = [];
      const comparing = state.comparison;
      const paired = state.pair;
      const sweepsOpen = comparing && !paired && !state.compareFactors && state.focus >= 0 && model.faces[state.focus]?.id === 'sweeps';
      state.faceHits = [];
      const outward = (a: Vec, b: Vec, c: Vec): Vec => {
        const mid: Vec = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
        const length = Math.hypot(...mid) || 1;
        return mid.map((value) => value / length) as Vec;
      };
      const raised = (mid: Vec, axis: Vec, score: number): Vec => {
        const offset = reliefScale(TOPO_LEVEL[score as 1 | 2 | 3 | 4 | 5], state.relief);
        return mid.map((value, index) => value + axis[index] * offset) as Vec;
      };
      const pushLayer = (index: number, corners: [Vec, Vec, Vec], apex: Vec, layer: 'self' | 'opponent') => {
        const [a, b, c] = corners.map(rot);
        const tip = rot(apex);
        const center: Vec = [0, 1, 2].map((axis) => (a[axis] + b[axis] + c[axis]) / 3) as Vec;
        const faceNormal = normal(a, b, c);
        const toward: Vec = [-center[0], -center[1], 5.5 - center[2]];
        const shade =
          (faceNormal[0] * toward[0] + faceNormal[1] * toward[1] + faceNormal[2] * toward[2]) /
          ((Math.hypot(...faceNormal) || 1) * (Math.hypot(...toward) || 1));
        (
          [
            [a, b],
            [b, c],
            [c, a],
          ] as [Vec, Vec][]
        ).forEach(([p, q]) => {
          const n = normal(p, q, tip);
          const length = Math.hypot(...n) || 1;
          polys.push({
            index,
            points: [p, q, tip].map(screen),
            z: (p[2] + q[2] + tip[2]) / 3,
            light: Math.abs(n[0] * lit[0] + n[1] * lit[1] + n[2] * lit[2]) / length,
            front: shade > 0.02,
            shade,
            layer,
          });
        });
      };
      if (paired) {
        context.clearRect(0, 0, state.width, state.height);
        for (const node of faceNodes) node.hidden = true;
        for (const node of tileNodes) node.hidden = true;
        const faceIndex = model.faces.findIndex((face) => face.id === 'sweeps');
        const [fa, fb, fc] = model.faceCorners[faceIndex].map((index) => model.vertices[index]);
        const axis = outward(fa, fb, fc);
        const origin: Vec = [(fa[0] + fb[0] + fc[0]) / 3, (fa[1] + fb[1] + fc[1]) / 3, (fa[2] + fb[2] + fc[2]) / 3];
        const up: Vec = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        const tx = up[1] * axis[2] - up[2] * axis[1];
        const ty = up[2] * axis[0] - up[0] * axis[2];
        const tz = up[0] * axis[1] - up[1] * axis[0];
        const tlen = Math.hypot(tx, ty, tz) || 1;
        const tangent: Vec = [tx / tlen, ty / tlen, tz / tlen];
        const bitangent: Vec = [
          axis[1] * tangent[2] - axis[2] * tangent[1],
          axis[2] * tangent[0] - axis[0] * tangent[2],
          axis[0] * tangent[1] - axis[1] * tangent[0],
        ];
        const facePoint = (point: Vec): Vec => {
          const rel: Vec = [point[0] - origin[0], point[1] - origin[1], point[2] - origin[2]];
          const dot = (base: Vec) => rel[0] * base[0] + rel[1] * base[1] + rel[2] * base[2];
          return [dot(tangent) * 2.3, dot(bitangent) * 2.3, dot(axis) * 2.3];
        };
        const narrow = state.width < 560;
        const boxes: { layer: 'self' | 'opponent'; title: string; x: number; y: number; w: number; h: number }[] = narrow
          ? [
              { layer: 'self', title: 'Self', x: 0, y: 0, w: state.width, h: state.height / 2 },
              { layer: 'opponent', title: 'Opponent', x: 0, y: state.height / 2, w: state.width, h: state.height / 2 },
            ]
          : [
              { layer: 'self', title: 'Self', x: 0, y: 0, w: state.width / 2, h: state.height },
              { layer: 'opponent', title: 'Opponent', x: state.width / 2, y: 0, w: state.width / 2, h: state.height },
            ];
        const place = (point: Vec, box: (typeof boxes)[number]): [number, number] => {
          const focal = (box.h / 2 / Math.tan((19 * Math.PI) / 180)) * Math.min(state.zoom, 1.15);
          const depth = 5.5 - point[2];
          return [box.x + box.w / 2 + (point[0] * focal) / depth, box.y + box.h / 2 - (point[1] * focal) / depth];
        };
        for (const box of boxes) {
          context.save();
          context.beginPath();
          context.rect(box.x, box.y, box.w, box.h);
          context.clip();
          for (const tile of model.tiles) {
            if (tile.faceId !== 'sweeps' || !tile.move) continue;
            const corners = tile.tri.map((corner) => corner.p) as [Vec, Vec, Vec];
            const mid: Vec = [
              (corners[0][0] + corners[1][0] + corners[2][0]) / 3,
              (corners[0][1] + corners[1][1] + corners[2][1]) / 3,
              (corners[0][2] + corners[1][2] + corners[2][2]) / 3,
            ];
            const score = box.layer === 'self'
              ? EXAMPLE_SELF_SWEEPS[tile.move.id as keyof typeof EXAMPLE_SELF_SWEEPS]
              : EXAMPLE_OPPONENT_SWEEPS[tile.move.id as keyof typeof EXAMPLE_OPPONENT_SWEEPS];
            const apex = raised(mid, axis, score);
            const drawn = [...corners, apex].map(facePoint).map((point) => place(point, box));
            const [p, q, r, tip] = drawn;
            const pairs: [[number, number], [number, number]][] = [
              [p, q],
              [q, r],
              [r, p],
            ];
            for (const [from, to] of pairs) {
              context.beginPath();
              context.moveTo(from[0], from[1]);
              if (state.style === 'curved' && score !== 3) {
                const face = [(from[0] + to[0] + tip[0]) / 3, (from[1] + to[1] + tip[1]) / 3];
                const pull = (start: [number, number]) => {
                  const middle: [number, number] = [(start[0] + tip[0]) / 2, (start[1] + tip[1]) / 2];
                  return [middle[0] + (face[0] - middle[0]) * 0.55, middle[1] + (face[1] - middle[1]) * 0.55] as [number, number];
                };
                context.lineTo(to[0], to[1]);
                context.quadraticCurveTo(...pull(to), tip[0], tip[1]);
                context.quadraticCurveTo(...pull(from), from[0], from[1]);
              } else {
                context.lineTo(to[0], to[1]);
                context.lineTo(tip[0], tip[1]);
              }
              context.closePath();
              context.fillStyle = box.layer === 'self' ? 'rgba(40,170,210,.72)' : 'rgba(210,130,50,.62)';
              context.fill();
              context.setLineDash(box.layer === 'opponent' ? [5, 3] : []);
              context.strokeStyle = box.layer === 'self' ? '#76eaff' : '#ffb05a';
              context.lineWidth = 1.2;
              context.stroke();
              context.setLineDash([]);
            }
            const labelAt = place(facePoint(mid), box);
            context.setLineDash([]);
            context.fillStyle = '#071324';
            context.fillRect(labelAt[0] - 42, labelAt[1] - 8, 84, 16);
            context.fillStyle = '#e7f6ff';
            context.font = '10px sans-serif';
            context.textAlign = 'center';
            context.fillText(`${tile.move.name.slice(0, 14)} ${score}`, labelAt[0], labelAt[1] + 4);
          }
          context.restore();
          context.fillStyle = box.layer === 'self' ? '#b7f4ff' : '#ffd7a8';
          context.font = '14px sans-serif';
          context.textAlign = 'left';
          context.fillText(box.title, box.x + 10, box.y + 18);
        }
      }
      if (!paired && comparing) {
        model.faceCorners.forEach((corners, faceIndex) => {
          const face = model.faces[faceIndex];
          if (sweepsOpen && face.id === 'sweeps') return;
          const [a, b, c] = corners.map((index) => model.vertices[index]);
          const axis = outward(a, b, c);
          const mid: Vec = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
          const live = state.compareFactors;
          const selfScore = live ? live.self[face.id] : EXAMPLE_SELF_FACTORS[face.id];
          const opponentScore = live ? live.opponent[face.id] : EXAMPLE_OPPONENT_FACTORS[face.id];
          if (selfScore) pushLayer(-1, [a, b, c], raised(mid, axis, selfScore), 'self');
          if (opponentScore) pushLayer(-1, [a, b, c], raised(mid, axis, opponentScore), 'opponent');
          const rotated = [a, b, c].map(rot);
          const center: Vec = [0, 1, 2].map((part) => (rotated[0][part] + rotated[1][part] + rotated[2][part]) / 3) as Vec;
          const nrm = normal(rotated[0], rotated[1], rotated[2]);
          const toward: Vec = [-center[0], -center[1], 5.5 - center[2]];
          const shade =
            (nrm[0] * toward[0] + nrm[1] * toward[1] + nrm[2] * toward[2]) /
            ((Math.hypot(...nrm) || 1) * (Math.hypot(...toward) || 1));
          state.faceHits.push({ faceIndex, front: shade > 0.02, z: center[2], screen: rotated.map(screen) });
        });
        if (sweepsOpen) {
          for (const tile of model.tiles) {
            if (tile.faceId !== 'sweeps' || !tile.move) continue;
            const corners = tile.tri.map((corner) => corner.p) as [Vec, Vec, Vec];
            const [a, b, c] = model.faceCorners[tile.faceIndex].map((index) => model.vertices[index]);
            const axis = outward(a, b, c);
            const mid: Vec = [
              (corners[0][0] + corners[1][0] + corners[2][0]) / 3,
              (corners[0][1] + corners[1][1] + corners[2][1]) / 3,
              (corners[0][2] + corners[1][2] + corners[2][2]) / 3,
            ];
            const self = EXAMPLE_SELF_SWEEPS[tile.move.id as keyof typeof EXAMPLE_SELF_SWEEPS];
            const opponent = EXAMPLE_OPPONENT_SWEEPS[tile.move.id as keyof typeof EXAMPLE_OPPONENT_SWEEPS];
            if (self) pushLayer(tile.index, corners, raised(mid, axis, self), 'self');
            if (opponent) pushLayer(tile.index, corners, raised(mid, axis, opponent), 'opponent');
            const rotated = corners.map(rot);
            const center: Vec = [0, 1, 2].map((axis) => (rotated[0][axis] + rotated[1][axis] + rotated[2][axis]) / 3) as Vec;
            projected.push({
              index: tile.index,
              front: true,
              shade: 1,
              z: center[2],
              screen: rotated.map(screen),
              center: screen(center),
            });
          }
        }
      }
      if (!paired && !comparing) model.tiles.forEach((tile, index) => {
        const [a, b, c] = tile.tri.map((corner) => rot(corner.d));
        const center: Vec = [0, 1, 2].map((axis) => (a[axis] + b[axis] + c[axis]) / 3) as Vec;
        const faceNormal = normal(a, b, c);
        const toward: Vec = [-center[0], -center[1], 5.5 - center[2]];
        const shade =
          (faceNormal[0] * toward[0] + faceNormal[1] * toward[1] + faceNormal[2] * toward[2]) /
          ((Math.hypot(...faceNormal) || 1) * (Math.hypot(...toward) || 1));
        const item: Proj = {
          index,
          front: shade > 0.02,
          shade,
          z: center[2],
          screen: [a, b, c].map(screen),
          center: screen(center),
        };
        projected.push(item);
        if (tile.apex) {
          const raw = tile.tri.map((corner) => corner.p);
          const mid: Vec = [
            (raw[0][0] + raw[1][0] + raw[2][0]) / 3,
            (raw[0][1] + raw[1][1] + raw[2][1]) / 3,
            (raw[0][2] + raw[1][2] + raw[2][2]) / 3,
          ];
          const scaled = mid.map((value, index) => value + (tile.apex![index] - mid[index]) * state.relief) as Vec;
          const rise = Math.hypot(scaled[0] - mid[0], scaled[1] - mid[1], scaled[2] - mid[2]);
          if (rise > 1e-4) {
            const apex = rot(scaled);
            (
              [
                [a, b],
                [b, c],
                [c, a],
              ] as [Vec, Vec][]
            ).forEach(([p, q]) => {
              const n = normal(p, q, apex);
              const length = Math.hypot(...n) || 1;
              const amount = Math.abs(n[0] * lit[0] + n[1] * lit[1] + n[2] * lit[2]) / length;
              polys.push({
                index,
                points: [p, q, apex].map(screen),
                z: (p[2] + q[2] + apex[2]) / 3,
                light: amount,
                front: item.front,
                shade,
                layer: 'base',
              });
            });
          } else {
            polys.push({ index, points: item.screen, z: item.z, light: 0.5 + 0.5 * Math.max(0, shade), front: item.front, shade, layer: 'base' });
          }
        } else {
          polys.push({ index, points: item.screen, z: item.z, light: 0.5 + 0.5 * Math.max(0, shade), front: item.front, shade, layer: 'base' });
        }
      });
      state.projected = projected;
      if (!paired) context.clearRect(0, 0, state.width, state.height);
      polys.sort((a, b) => a.z - b.z);
      for (const poly of polys) {
        const tile = poly.index >= 0 ? model.tiles[poly.index] : undefined;
        const bow =
          state.style === 'curved' &&
          poly.points.length === 3 &&
          (poly.layer === 'self' || poly.layer === 'opponent' || (poly.layer === 'base' && Boolean(tile?.apex) && tile?.offset !== 0));
        context.beginPath();
        context.moveTo(poly.points[0][0], poly.points[0][1]);
        if (bow) {
          const [p, q, apex] = poly.points;
          const face = [(p[0] + q[0] + apex[0]) / 3, (p[1] + q[1] + apex[1]) / 3];
          const pull = (from: [number, number], to: [number, number]): [number, number] => {
            const mid: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
            return [mid[0] + (face[0] - mid[0]) * 0.55, mid[1] + (face[1] - mid[1]) * 0.55];
          };
          const left = pull(p, apex);
          const right = pull(q, apex);
          context.lineTo(q[0], q[1]);
          context.quadraticCurveTo(right[0], right[1], apex[0], apex[1]);
          context.quadraticCurveTo(left[0], left[1], p[0], p[1]);
        } else {
          context.lineTo(poly.points[1][0], poly.points[1][1]);
          context.lineTo(poly.points[2][0], poly.points[2][1]);
        }
        context.closePath();
        const chosen = tile != null && poly.index === state.selected;
        const k = 0.2 + 0.8 * poly.light;
        let fill: string;
        if (poly.layer === 'opponent') {
          fill = poly.front
            ? `rgba(${Math.round(150 + 70 * k)},${Math.round(78 + 30 * k)},${Math.round(24 + 12 * k)},${0.38 + 0.22 * k})`
            : 'rgba(120,70,20,.06)';
        } else if (poly.layer === 'self') {
          fill = poly.front
            ? `rgba(${Math.round(16 + 50 * k)},${Math.round(110 + 90 * k)},${Math.round(150 + 80 * k)},${0.42 + 0.28 * k})`
            : 'rgba(24,114,160,.06)';
        } else if (!poly.front) fill = 'rgba(24,114,160,.05)';
        else if (!tile || !model.faces[tile.faceIndex]?.moves.length) fill = `rgba(70,80,100,${0.25 + 0.3 * poly.shade})`;
        else if (!tile.move || tile.offset == null) fill = `rgba(24,60,90,${0.16 + 0.16 * Math.max(0, poly.shade)})`;
        else fill = toneFill(tileTone(tile.move.id), k, chosen, state.hue);
        context.fillStyle = fill;
        context.fill();
        const unrated = poly.layer === 'base' && Boolean(tile?.move) && tile?.offset == null;
        context.setLineDash(poly.layer === 'opponent' || unrated ? [5, 3] : []);
        context.strokeStyle =
          poly.layer === 'opponent'
            ? 'rgba(255,176,90,.9)'
            : poly.front
              ? `rgba(118,234,255,${tile?.move || poly.layer === 'self' ? 0.7 : 0.25})`
              : 'rgba(118,234,255,.12)';
        context.lineWidth = chosen ? 2.2 : poly.layer === 'opponent' ? 1.3 : 0.7;
        context.stroke();
        context.setLineDash([]);
      }
      let frontIndex = -1;
      let frontScore = 0.12;
      if (!paired) {
        model.faceCorners.forEach((corners, faceIndex) => {
          const points = corners.map((index) => rot(model.vertices[index]));
          const center: Vec = [0, 1, 2].map((axis) => (points[0][axis] + points[1][axis] + points[2][axis]) / 3) as Vec;
          const u: Vec = [points[1][0] - points[0][0], points[1][1] - points[0][1], points[1][2] - points[0][2]];
          const v: Vec = [points[2][0] - points[0][0], points[2][1] - points[0][1], points[2][2] - points[0][2]];
          const nrm: Vec = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
          const score = nrm[0] * -center[0] + nrm[1] * -center[1] + nrm[2] * (5.5 - center[2]);
          if (score > frontScore) {
            frontScore = score;
            frontIndex = faceIndex;
          }
        });
      }
      if (zoomPastRest(state.zoom) && state.drilledFace < 0 && state.focus < 0 && frontIndex !== state.publishedFront) {
        state.publishedFront = frontIndex;
        state.onFrontFace(frontIndex);
      }
      const sweepsFace = model.faces.findIndex((face) => face.id === 'sweeps');
      const labels = crystalLabelState({
        zoom: state.zoom,
        drilledFace: state.drilledFace,
        focusedFace: state.focus,
        frontFace: frontIndex,
        comparison: state.comparison,
        pair: paired,
        sweepsFace,
      });
      stage.dataset.labelTier = labels.tier;
      stage.dataset.labelFace = labels.face >= 0 ? (model.faces[labels.face]?.id ?? '') : '';
      stage.dataset.drilled = state.drilledFace >= 0 ? (model.faces[state.drilledFace]?.id ?? '') : '';
      for (const node of tileNodes) node.hidden = true;
      projected.forEach((item) => {
        const tile = model.tiles[item.index];
        const node = tileNodes[item.index];
        if (!node || !tile) return;
        const show =
          tileShowsTechniqueLabel(labels, tile.faceIndex, Boolean(tile.move), state.selected >= 0) &&
          item.front &&
          item.shade > 0.2;
        node.hidden = !show;
        if (!node.hidden) {
          node.style.left = `${item.center[0]}px`;
          node.style.top = `${item.center[1]}px`;
        }
      });
      if (!paired) model.faceCorners.forEach((corners, faceIndex) => {
        const points = corners.map((index) => rot(model.vertices[index]));
        const center: Vec = [0, 1, 2].map((axis) => (points[0][axis] + points[1][axis] + points[2][axis]) / 3) as Vec;
        const u: Vec = [points[1][0] - points[0][0], points[1][1] - points[0][1], points[1][2] - points[0][2]];
        const v: Vec = [points[2][0] - points[0][0], points[2][1] - points[0][1], points[2][2] - points[0][2]];
        const n: Vec = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const visible = n[0] * -center[0] + n[1] * -center[1] + n[2] * (5.5 - center[2]) > 0.12;
        if (visible) {
          const drawn = points.map(screen);
          context.beginPath();
          context.moveTo(drawn[0][0], drawn[0][1]);
          drawn.slice(1).forEach((point) => context.lineTo(point[0], point[1]));
          context.closePath();
          context.setLineDash([]);
          const onTrail = state.marked.includes(faceIndex);
          context.strokeStyle = faceIndex === state.focus ? '#ffffff' : onTrail ? '#ffd27a' : 'rgba(118,234,255,.95)';
          context.lineWidth = faceIndex === state.focus ? 2.5 : onTrail ? 3.4 : 1.6;
          context.stroke();
        }
        const node = faceNodes[faceIndex];
        if (!node) return;
        const techniquesOpen =
          labels.tier === 'techniques' &&
          labels.face === faceIndex &&
          model.faces[faceIndex].moves.length > 0 &&
          state.selected < 0;
        node.hidden = !visible || techniquesOpen;
        const placed = screen(center);
        node.style.left = `${placed[0]}px`;
        node.style.top = `${placed[1]}px`;
      });
      if (!paired) {
        const active = activeOf();
        state.activeName = active?.name ?? '';
        state.activeCorners = active?.corners ?? null;
        state.cellHits = [];
        labelBoxes = [];
        if (!active) {
          state.frameKey = '';
          state.activeScreen = null;
          state.sideHits = [];
          delete stage.dataset.drillMode;
          delete stage.dataset.drillN;
        } else {
          const layout = connectionLayout(active.name, active.parent);
          const frameKey = `${active.name}:${state.grown.length}:${layout.mode}`;
          if (state.selected >= 0 && state.frameKey !== frameKey && !state.drag) {
            state.frameKey = frameKey;
            easeTo(active.corners, active.name, active.parent);
          }
          stage.dataset.drillMode = layout.mode;
          stage.dataset.drillN = layout.mode === 'grid' ? String(layout.n * layout.n) : '4';
          const root = rootTile();
          const rootBase = root ? rootCorners(root) : null;
          const lift = (point: Vec): Vec => {
            if (!rootBase || !root?.apex) return point;
            const mid: Vec = [
              (rootBase[0][0] + rootBase[1][0] + rootBase[2][0]) / 3,
              (rootBase[0][1] + rootBase[1][1] + rootBase[2][1]) / 3,
              (rootBase[0][2] + rootBase[1][2] + rootBase[2][2]) / 3,
            ];
            const weights = barycentric(point, rootBase[0], rootBase[1], rootBase[2]);
            const factor = Math.max(0, Math.min(weights[0], weights[1], weights[2])) * 3 * state.relief;
            return point.map((value, index) => value + (root.apex![index] - mid[index]) * factor) as Vec;
          };
          const drawPatch = (tri: [Vec, Vec, Vec], fill: string) => {
            const peak = lift([
              (tri[0][0] + tri[1][0] + tri[2][0]) / 3,
              (tri[0][1] + tri[1][1] + tri[2][1]) / 3,
              (tri[0][2] + tri[1][2] + tri[2][2]) / 3,
            ]);
            const faces: [Vec, Vec, Vec][] = [
              [tri[0], tri[1], peak],
              [tri[1], tri[2], peak],
              [tri[2], tri[0], peak],
            ];
            for (const face of faces) {
              const pts = face.map((vertex) => screen(rot(vertex)));
              context.beginPath();
              context.moveTo(pts[0][0], pts[0][1]);
              if (state.style === 'curved') {
                const pull = (from: [number, number], to: [number, number]): [number, number] => {
                  const middle: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
                  return [middle[0] + (pts[2][0] - middle[0]) * 0.35, middle[1] + (pts[2][1] - middle[1]) * 0.35];
                };
                context.lineTo(pts[1][0], pts[1][1]);
                context.quadraticCurveTo(...pull(pts[1], pts[2]), pts[2][0], pts[2][1]);
                context.quadraticCurveTo(...pull(pts[0], pts[2]), pts[0][0], pts[0][1]);
              } else {
                context.lineTo(pts[1][0], pts[1][1]);
                context.lineTo(pts[2][0], pts[2][1]);
              }
              context.closePath();
              context.fillStyle = fill;
              context.fill();
              context.setLineDash([]);
              context.strokeStyle = 'rgba(8, 16, 28, 0.55)';
              context.lineWidth = 1;
              context.stroke();
            }
          };
          const labelAt = (tri: [Vec, Vec, Vec], text: string, linked: boolean) => {
            const peak = lift([
              (tri[0][0] + tri[1][0] + tri[2][0]) / 3,
              (tri[0][1] + tri[1][1] + tri[2][1]) / 3,
              (tri[0][2] + tri[1][2] + tri[2][2]) / 3,
            ]);
            const at = screen(rot(peak));
            const box = spanOf(projectTri(tri));
            if (!labelVisible(box, text)) return;
            paintLabel(at[0], at[1], text, linked);
          };
          state.activeScreen = projectTri(active.corners);
          state.sideHits = [];
          if (layout.mode === 'grid') {
            for (const cell of assignDrillCells(active.corners, layout.names)) {
              state.cellHits.push({ name: cell.name, corners: cell.corners, screen: projectTri(cell.corners) });
              drawPatch(cell.corners, cell.name ? toneFill(toneForName(cell.name), 0.8, false, state.hue) : 'rgba(20, 40, 60, 0.28)');
              if (cell.name) labelAt(cell.corners, cell.name, true);
            }
          } else {
            const quarters = roleQuarters(active.corners);
            drawPatch(quarters.center, toneFill(toneForName(active.name), 0.85, true, state.hue));
            labelAt(quarters.center, active.name, true);
            for (const role of ['left', 'base', 'right'] as const) {
              const name = layout.sides[role];
              const tri = quarters[role];
              state.cellHits.push({ name, corners: tri, screen: projectTri(tri) });
              const screenTri = projectTri(active.corners);
              const edge = screenSides(screenTri).find((item) => item.role === role);
              if (edge) {
                state.sideHits.push({
                  edge: edge.edge,
                  target: name,
                  a: screenTri[edge.edge],
                  b: screenTri[(edge.edge + 1) % 3],
                });
              }
              drawPatch(tri, name ? toneFill(toneForName(name), 0.75, false, state.hue) : 'rgba(20, 40, 60, 0.28)');
              if (name) labelAt(tri, name, true);
            }
          }
        }
      }
      if (comparing && sweepsOpen && state.selected >= 0 && state.links.length && !state.grown.length) {
        const anchor = projected.find((item) => item.index === state.selected);
        if (anchor) {
          context.font = '10px sans-serif';
          context.textAlign = 'center';
          context.lineWidth = 1;
          state.links.slice(0, 3).forEach((title, index) => {
            const x = anchor.center[0] + (index - 1) * 36;
            const y = anchor.center[1] + 22;
            context.strokeStyle = 'rgba(231,246,255,.85)';
            context.beginPath();
            context.moveTo(anchor.center[0], anchor.center[1]);
            context.lineTo(x, y);
            context.stroke();
            context.fillStyle = '#071324';
            context.fillRect(x - 42, y - 8, 84, 16);
            context.fillStyle = '#e7f6ff';
            context.fillText(title.slice(0, 16), x, y + 4);
          });
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      stage.removeEventListener('wheel', onWheel);
      observer?.disconnect();
    };
  }, [model]);

  useEffect(() => {
    view.current.pendingPath = [...drillPath];
  }, [drillPath, selected, model]);

  useEffect(() => {
    if (focus >= 0 || view.current.drilledFace < 0) return;
    view.current.drilledFace = -1;
    setLabelView((current) => (current.drilledFace < 0 ? current : { ...current, drilledFace: -1 }));
  }, [focus]);

  const publishLabels = (zoom: number, drilledFace: number) => {
    view.current.zoom = zoom;
    view.current.drilledFace = drilledFace;
    setLabelView((current) =>
      current.zoom === zoom && current.drilledFace === drilledFace ? current : { ...current, zoom, drilledFace },
    );
  };

  const applyZoom = (next: number) => {
    const state = view.current;
    const before = state.zoom;
    const zoom = clampCrystalZoom(next);
    state.anim = null;
    publishLabels(zoom, drillAfterZoom(before, zoom, state.drilledFace));
  };
  view.current.applyZoom = applyZoom;
  view.current.onFrontFace = (index) => {
    setLabelView((current) => (current.frontFace === index ? current : { ...current, frontFace: index }));
  };

  const focusFace = (index: number, drill: boolean) => {
    const state = view.current;
    const center = model.faceCorners[index]
      .map((corner) => model.vertices[corner])
      .reduce((sum, point) => sum.map((value, axis) => value + point[axis]) as Vec, [0, 0, 0] as Vec);
    const targetYaw = Math.atan2(-center[0], center[2]);
    const flat = Math.hypot(center[0], center[2]);
    const targetPitch = Math.atan2(center[1], flat);
    let dy = (targetYaw - state.ry) % (2 * Math.PI);
    dy = ((dy + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    state.paused = true;
    setPaused(true);
    state.anim = {
      rx0: state.rx,
      ry0: state.ry,
      rx1: targetPitch,
      ry1: state.ry + dy,
      z0: state.zoom,
      z1: Math.max(state.zoom, FOCUS_FRAME_ZOOM),
      t: 0,
    };
    publishLabels(state.zoom, drill ? index : -1);
    onFocus(index);
  };

  const toggleDrill = (index: number) => {
    const state = view.current;
    if (state.drilledFace === index) {
      state.anim = null;
      publishLabels(zoomAfterClosingDrill(state.zoom), -1);
      onSelect(-1);
      return;
    }
    focusFace(index, true);
  };

  const sweepsFace = model.faces.findIndex((face) => face.id === 'sweeps');
  const labels = crystalLabelState({
    zoom: labelView.zoom,
    drilledFace: labelView.drilledFace,
    focusedFace: focus,
    frontFace: labelView.frontFace,
    comparison,
    pair,
    sweepsFace,
  });

  return (
    <div>
      <div
        ref={stageRef}
        className="topo-stage"
        data-layout={TOPO_REVISION}
        data-style={style}
        data-comparison={comparison ? 'on' : 'off'}
        data-pair={pair ? 'on' : 'off'}
        data-self-passing={compareFactors?.self.passing ?? ''}
        data-opponent-sweeps={compareFactors?.opponent.sweeps ?? ''}
        data-drill-depth={drillPath.length}
        data-label-tier={labels.tier}
        data-label-face={labels.face >= 0 ? (model.faces[labels.face]?.id ?? '') : ''}
        data-drilled={labelView.drilledFace >= 0 ? (model.faces[labelView.drilledFace]?.id ?? '') : ''}
        aria-label="Topographic octahedron of assessment factors"
        tabIndex={0}
        onKeyDown={(event) => {
          const state = view.current;
          if (event.key === 'ArrowLeft') state.ry -= 0.12;
          else if (event.key === 'ArrowRight') state.ry += 0.12;
          else if (event.key === 'ArrowUp') state.rx -= 0.08;
          else if (event.key === 'ArrowDown') state.rx += 0.08;
          else if (event.key === '+' || event.key === '=') applyZoom(view.current.zoom * ZOOM_STEP);
          else if (event.key === '-' || event.key === '_') applyZoom(view.current.zoom / ZOOM_STEP);
          else if (event.key === 'Escape') onSelect(-1);
          else return;
          event.preventDefault();
        }}
        onPointerDown={(event) => {
          const node = event.currentTarget;
          node.setPointerCapture?.(event.pointerId);
          const state = view.current;
          state.pointers.set(event.pointerId, [event.clientX, event.clientY]);
          if (state.pointers.size === 2) {
            const [a, b] = [...state.pointers.values()];
            state.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: state.zoom };
            state.drag = null;
          } else {
            state.drag = { x: event.clientX, y: event.clientY, lx: event.clientX, ly: event.clientY, moved: false };
          }
        }}
        onPointerMove={(event) => {
          const state = view.current;
          if (!state.pointers.has(event.pointerId)) return;
          state.pointers.set(event.pointerId, [event.clientX, event.clientY]);
          if (state.pinch && state.pointers.size === 2) {
            const [a, b] = [...state.pointers.values()];
            state.applyZoom((state.pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1])) / state.pinch.d);
            return;
          }
          if (!state.drag) return;
          if (Math.hypot(event.clientX - state.drag.x, event.clientY - state.drag.y) > 6) state.drag.moved = true;
          if (state.drag.moved) {
            state.ry += ((event.clientX - state.drag.lx) * 0.008) / state.zoom;
            state.rx += ((event.clientY - state.drag.ly) * 0.008) / state.zoom;
            state.paused = true;
            setPaused(true);
            state.anim = null;
          }
          state.drag.lx = event.clientX;
          state.drag.ly = event.clientY;
        }}
        onPointerUp={(event) => {
          const state = view.current;
          state.pointers.delete(event.pointerId);
          if (state.pinch) {
            if (state.pointers.size < 2) state.pinch = null;
            state.drag = null;
            return;
          }
          const tap = state.drag && !state.drag.moved;
          state.drag = null;
          if (!tap) return;
          if (state.chrome === 'bare') {
            state.onExpand();
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          const point: [number, number] = [event.clientX - rect.left, event.clientY - rect.top];
          const active = state.activeScreen;
          if (active && inTri(point, active[0], active[1], active[2])) {
            const now = performance.now();
            if (state.openedAt && now - state.openedAt < 380) {
              state.api?.detail();
              state.openedAt = 0;
              return;
            }
            const cell = state.cellHits.find((item) => item.name && inTri(point, item.screen[0], item.screen[1], item.screen[2]));
            if (cell?.name) {
              state.api?.enter(cell.name, cell.corners);
              state.openedAt = now;
              return;
            }
            if (state.cellHits.length) {
              const elapsed = state.lastTap && state.lastTap.name === state.activeName ? now - state.lastTap.time : 1000;
              const kind = classifyTap({
                pinching: false,
                moved: false,
                edge: null,
                edgeHasLink: false,
                sameTile: true,
                elapsedMs: elapsed,
              });
              if (kind === 'double') {
                state.api?.detail();
                state.lastTap = null;
                return;
              }
              state.lastTap = { time: now, name: state.activeName };
              return;
            }
            const centroid: [number, number] = [
              (active[0][0] + active[1][0] + active[2][0]) / 3,
              (active[0][1] + active[1][1] + active[2][1]) / 3,
            ];
            let nearest: { edge: 0 | 1 | 2; target: string | null; dist: number } | null = null;
            for (const hit of state.sideHits) {
              const dist = pointToSegment(point, hit.a, hit.b);
              if (!nearest || dist < nearest.dist) nearest = { edge: hit.edge, target: hit.target, dist };
            }
            const fromCenter = Math.hypot(point[0] - centroid[0], point[1] - centroid[1]);
            const onEdge = Boolean(nearest && nearest.dist <= 44 && nearest.dist < fromCenter);
            const elapsed = state.lastTap && state.lastTap.name === state.activeName ? now - state.lastTap.time : 1000;
            const kind = classifyTap({
              pinching: false,
              moved: false,
              edge: onEdge && nearest ? nearest.edge : null,
              edgeHasLink: Boolean(onEdge && nearest?.target),
              sameTile: true,
              elapsedMs: elapsed,
            });
            if (kind === 'edge' && nearest?.target) {
              state.api?.grow(nearest.target);
              state.openedAt = now;
              state.lastTap = null;
              return;
            }
            if (kind === 'double') {
              state.api?.detail();
              state.lastTap = null;
              return;
            }
            state.lastTap = { time: now, name: state.activeName };
            return;
          }
          const sweepsOpen = state.comparison && !state.compareFactors && state.focus >= 0 && model.faces[state.focus]?.id === 'sweeps';
          if (state.comparison && !sweepsOpen) {
            const faceHit = [...state.faceHits]
              .filter((item) => item.front)
              .sort((a, b) => b.z - a.z)
              .find((item) => inTri(point, item.screen[0], item.screen[1], item.screen[2]));
            if (faceHit) focusFace(faceHit.faceIndex, false);
            return;
          }
          const hit = [...state.projected]
            .filter((item) => item.front)
            .sort((a, b) => b.z - a.z)
            .find((item) => inTri(point, item.screen[0], item.screen[1], item.screen[2]));
          if (!hit) return;
          toggleDrill(model.tiles[hit.index].faceIndex);
        }}
        onPointerCancel={(event) => {
          const state = view.current;
          state.pointers.delete(event.pointerId);
          state.drag = null;
          state.pinch = null;
        }}
      >
        <canvas ref={canvasRef} />
        <div ref={labelsRef} className="topo-labels">
          {model.faces.map((face, index) => {
            const techniquesOpen =
              labels.tier === 'techniques' && labels.face === index && face.moves.length > 0 && selected < 0;
            return (
              <button
                key={face.id}
                type="button"
                className="topo-label topo-label-face"
                data-face-label={face.id}
                aria-expanded={chrome === 'full' ? labelView.drilledFace === index : undefined}
                hidden={techniquesOpen}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onClick={() => {
                  if (chrome === 'bare') {
                    onExpand?.();
                    return;
                  }
                  toggleDrill(index);
                }}
              >
                {face.name}
              </button>
            );
          })}
          {model.tiles.map((tile) => (
            <span
              key={tile.index}
              className="topo-label"
              data-technique-label={tile.move?.name ?? ''}
              data-technique-face={tile.faceId}
              data-label-policy={tileShowsTechniqueLabel(labels, tile.faceIndex, Boolean(tile.move), selected >= 0) ? 'show' : 'hide'}
              hidden={!tileShowsTechniqueLabel(labels, tile.faceIndex, Boolean(tile.move), selected >= 0)}
            >
              {tile.move?.name ?? ''}
            </span>
          ))}
        </div>
      </div>
      {chrome === 'full' ? (
      <>
      <div className="topo-controls">
        <button type="button" aria-label="Zoom in" onClick={() => applyZoom(view.current.zoom * ZOOM_STEP)}>
          +
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => applyZoom(view.current.zoom / ZOOM_STEP)}>
          −
        </button>
        <button
          type="button"
          onClick={() => setPaused((current) => !current)}
          data-spin=""
        >
          {paused ? 'Resume rotation' : 'Pause rotation'}
        </button>
        <button
          type="button"
          className="topo-reset"
          onClick={() => {
            const state = view.current;
            state.rx = 0.28;
            state.ry = 0.4;
            state.anim = null;
            state.publishedFront = -2;
            publishLabels(REST_ZOOM, -1);
            const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
            state.paused = reduce;
            setPaused(reduce);
            onFocus(-1);
          }}
        >
          Reset view
        </button>
      </div>
      <nav className="topo-legend" aria-label="Focus a factor">
        {model.faces.map((face, index) => (
          <button
            key={face.id}
            type="button"
            data-face-button={face.id}
            data-on-trail={marked.includes(index) ? 'true' : 'false'}
            aria-pressed={focus === index}
            onClick={() => focusFace(index, false)}
          >
            {index + 1}. {face.name} ({face.moves.length})
          </button>
        ))}
      </nav>
      </>
      ) : null}
    </div>
  );
}

function toneFill(tone: TileTone, light: number, chosen: boolean, hue: number): string {
  const alpha = chosen ? 0.9 : 0.55 + 0.28 * light;
  const neutral: [number, number, number] = chosen
    ? [Math.round(37 + 120 * light), Math.round(150 + 80 * light), 255]
    : [Math.round(15 + 90 * light), Math.round(80 + 120 * light), Math.round(130 + 110 * light)];
  const colored: [number, number, number] =
    tone === 'defense'
      ? [Math.round(190 + 40 * light), Math.round(120 + 50 * light), Math.round(20 + 16 * light)]
      : tone === 'submission'
        ? [Math.round(176 + 50 * light), Math.round(36 + 24 * light), Math.round(48 + 16 * light)]
        : tone === 'pass'
          ? [Math.round(24 + 36 * light), Math.round(140 + 70 * light), Math.round(64 + 36 * light)]
          : neutral;
  const amount = tone === 'position' ? 0 : Math.min(1, Math.max(0, hue));
  const rgb = neutral.map((value, index) => Math.round(value + (colored[index] - value) * amount));
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

function inTri(point: [number, number], a: [number, number], b: [number, number], c: [number, number]): boolean {
  const sign = (p: [number, number], q: [number, number], r: [number, number]) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const ab = sign(point, a, b);
  const bc = sign(point, b, c);
  const ca = sign(point, c, a);
  return !((ab < 0 || bc < 0 || ca < 0) && (ab > 0 || bc > 0 || ca > 0));
}

export function scoreLabel(score: ReliefScore | null): string {
  return score == null ? 'Not rated' : `${score}/5, ${topoWords(score)}`;
}
