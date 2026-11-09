/**
 * Canvas stage from assessment-d8.html.
 * Pointed pyramids are the original drawing. Curved relief bows the same apex edges.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReliefScore } from './geometry.ts';
import { TOPO_LEVEL, TOPO_REVISION, topoWords, type TopoModel, type Vec } from './topo.ts';
import {
  EXAMPLE_OPPONENT_FACTORS,
  EXAMPLE_OPPONENT_SWEEPS,
  EXAMPLE_SELF_FACTORS,
  EXAMPLE_SELF_SWEEPS,
} from './overlay.ts';

export type TopoStyle = 'pyramid' | 'curved';

type Props = {
  model: TopoModel;
  style: TopoStyle;
  focus: number;
  selected: number;
  comparison: boolean;
  links: readonly string[];
  onFocus: (index: number) => void;
  onSelect: (index: number) => void;
};

type Proj = {
  index: number;
  front: boolean;
  shade: number;
  z: number;
  screen: [number, number][];
  center: [number, number];
};

export function TopoStage({ model, style, focus, selected, comparison, links, onFocus, onSelect }: Props) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const labelsRef = useRef<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const view = useRef({
    rx: 0.28,
    ry: 0.4,
    zoom: 1,
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
    links: [] as string[],
  });
  view.current.paused = paused;
  view.current.focus = focus;
  view.current.selected = selected;
  view.current.style = style;
  view.current.comparison = comparison;
  view.current.links = [...links];

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const labels = labelsRef.current;
    if (!stage || !canvas || !labels) return undefined;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    const faceNodes = model.faces.map((face) => {
      const node = document.createElement('span');
      node.className = 'topo-label topo-label-face';
      node.textContent = face.moves.length ? face.name : `${face.name} · no built-in moves mapped`;
      labels.append(node);
      return node;
    });
    const tileNodes = model.tiles.map((tile) => {
      const node = document.createElement('span');
      node.className = 'topo-label';
      node.textContent = tile.move?.name ?? '';
      node.hidden = true;
      labels.append(node);
      return node;
    });
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
      state.zoom = Math.min(6, Math.max(0.6, state.zoom * Math.exp(-event.deltaY * 0.0015)));
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
    let last = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (state.anim) {
        state.anim.t = Math.min(1, state.anim.t + dt * 2.5);
        const k = 1 - (1 - state.anim.t) ** 3;
        state.rx = state.anim.rx0 + (state.anim.rx1 - state.anim.rx0) * k;
        state.ry = state.anim.ry0 + (state.anim.ry1 - state.anim.ry0) * k;
        state.zoom = state.anim.z0 + (state.anim.z1 - state.anim.z0) * k;
        if (state.anim.t >= 1) state.anim = null;
      } else if (!state.paused && !state.drag) state.ry += dt * 0.18;
      const showLabels = state.zoom >= 1.8 || state.focus >= 0;
      const light: Vec = [-0.4, 0.6, 0.7];
      const lightLength = Math.hypot(...light) || 1;
      const lit = light.map((value) => value / lightLength) as Vec;
      const projected: Proj[] = [];
      const polys: { index: number; points: [number, number][]; z: number; light: number; front: boolean; shade: number; layer: 'base' | 'self' | 'opponent' }[] = [];
      const comparing = state.comparison;
      const sweepsOpen = comparing && state.focus >= 0 && model.faces[state.focus]?.id === 'sweeps';
      state.faceHits = [];
      const outward = (a: Vec, b: Vec, c: Vec): Vec => {
        const mid: Vec = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
        const length = Math.hypot(...mid) || 1;
        return mid.map((value) => value / length) as Vec;
      };
      const raised = (mid: Vec, axis: Vec, score: number): Vec => {
        const offset = TOPO_LEVEL[score as 1 | 2 | 3 | 4 | 5];
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
      if (comparing) {
        model.faceCorners.forEach((corners, faceIndex) => {
          const face = model.faces[faceIndex];
          if (sweepsOpen && face.id === 'sweeps') return;
          const [a, b, c] = corners.map((index) => model.vertices[index]);
          const axis = outward(a, b, c);
          const mid: Vec = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
          pushLayer(-1, [a, b, c], raised(mid, axis, EXAMPLE_SELF_FACTORS[face.id]), 'self');
          pushLayer(-1, [a, b, c], raised(mid, axis, EXAMPLE_OPPONENT_FACTORS[face.id]), 'opponent');
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
      if (!comparing) model.tiles.forEach((tile, index) => {
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
          const apex = rot(tile.apex);
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
      });
      state.projected = projected;
      context.clearRect(0, 0, state.width, state.height);
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
        const focused = tile != null && tile.faceIndex === state.focus;
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
        else {
          fill = chosen
            ? `rgba(${Math.round(37 + 120 * k)},${Math.round(150 + 80 * k)},255,.85)`
            : `rgba(${Math.round((focused ? 30 : 15) + 90 * k)},${Math.round((focused ? 110 : 80) + 120 * k)},${Math.round(130 + 110 * k)},${0.55 + 0.3 * k})`;
        }
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
      projected.forEach((item) => {
        const tile = model.tiles[item.index];
        const node = tileNodes[item.index];
        const focused = (state.focus < 0 || tile.faceIndex === state.focus) && (!state.comparison || (state.focus >= 0 && model.faces[state.focus]?.id === 'sweeps'));
        node.hidden = !(showLabels && tile.move && item.front && item.shade > 0.2 && focused);
        if (!node.hidden) {
          node.style.left = `${item.center[0]}px`;
          node.style.top = `${item.center[1]}px`;
        }
      });
      model.faceCorners.forEach((corners, faceIndex) => {
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
          context.strokeStyle = faceIndex === state.focus ? '#ffffff' : 'rgba(118,234,255,.95)';
          context.lineWidth = faceIndex === state.focus ? 2.5 : 1.6;
          context.stroke();
        }
        const node = faceNodes[faceIndex];
        const hideName = showLabels && model.faces[faceIndex].moves.length > 0 && (state.focus < 0 || faceIndex === state.focus);
        node.hidden = !visible || hideName;
        const placed = screen(center);
        node.style.left = `${placed[0]}px`;
        node.style.top = `${placed[1]}px`;
      });
      if (comparing && sweepsOpen && state.selected >= 0 && state.links.length) {
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
      labels.replaceChildren();
    };
  }, [model]);

  const focusFace = (index: number) => {
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
      z1: Math.max(state.zoom, 1.55),
      t: 0,
    };
    onFocus(index);
  };

  return (
    <div>
      <div
        ref={stageRef}
        className="topo-stage"
        data-layout={TOPO_REVISION}
        data-style={style}
        data-comparison={comparison ? 'on' : 'off'}
        aria-label="Topographic octahedron of assessment factors"
        tabIndex={0}
        onKeyDown={(event) => {
          const state = view.current;
          if (event.key === 'ArrowLeft') state.ry -= 0.12;
          else if (event.key === 'ArrowRight') state.ry += 0.12;
          else if (event.key === 'ArrowUp') state.rx -= 0.08;
          else if (event.key === 'ArrowDown') state.rx += 0.08;
          else if (event.key === '+' || event.key === '=') zoomBy(state, 1.3);
          else if (event.key === '-' || event.key === '_') zoomBy(state, 1 / 1.3);
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
            state.zoom = Math.min(6, Math.max(0.6, (state.pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1])) / state.pinch.d));
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
          const rect = event.currentTarget.getBoundingClientRect();
          const point: [number, number] = [event.clientX - rect.left, event.clientY - rect.top];
          const sweepsOpen = state.comparison && state.focus >= 0 && model.faces[state.focus]?.id === 'sweeps';
          if (state.comparison && !sweepsOpen) {
            const faceHit = [...state.faceHits]
              .filter((item) => item.front)
              .sort((a, b) => b.z - a.z)
              .find((item) => inTri(point, item.screen[0], item.screen[1], item.screen[2]));
            if (faceHit) focusFace(faceHit.faceIndex);
            return;
          }
          const hit = [...state.projected]
            .filter((item) => item.front)
            .sort((a, b) => b.z - a.z)
            .find((item) => inTri(point, item.screen[0], item.screen[1], item.screen[2]));
          if (!hit) return;
          const tile = model.tiles[hit.index];
          if (state.focus !== tile.faceIndex) focusFace(tile.faceIndex);
          else if (tile.move) onSelect(hit.index);
        }}
        onPointerCancel={(event) => {
          const state = view.current;
          state.pointers.delete(event.pointerId);
          state.drag = null;
          state.pinch = null;
        }}
      >
        <canvas ref={canvasRef} />
        <div ref={labelsRef} className="topo-labels" />
      </div>
      <div className="topo-controls">
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(view.current, 1.3)}>
          +
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomBy(view.current, 1 / 1.3)}>
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
            state.zoom = 1;
            state.anim = null;
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
          <button key={face.id} type="button" data-face-button={face.id} aria-pressed={focus === index} onClick={() => focusFace(index)}>
            {index + 1}. {face.name} ({face.moves.length})
          </button>
        ))}
      </nav>
    </div>
  );
}

function zoomBy(state: { zoom: number }, factor: number) {
  state.zoom = Math.min(6, Math.max(0.6, state.zoom * factor));
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
