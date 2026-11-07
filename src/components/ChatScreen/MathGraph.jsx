import { useEffect, useId, useState } from 'react';

const W = 420;
const H = 300;
const PAD = { l: 40, r: 14, t: 14, b: 28 };
const COLORS = ['#ffffff', '#ffd27a', '#8fd3ff'];
const SAMPLES = 400;                       // points calculated per curve

// the only names an expression may use (so nothing unexpected is ever evaluated)
const ALLOWED = new Set([
  'x', 'pi', 'e',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'sec', 'csc', 'cot',
  'sqrt', 'cbrt', 'abs', 'log', 'log10', 'log2', 'exp',
  'floor', 'ceil', 'round', 'sign', 'min', 'max', 'pow',
]);

// returns a cleaned expression, or null when it is not safe or not understood
function cleanExpr(raw) {
  const s = String(raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/^(y|f\(x\))\s*=\s*/, '')
    .replace(/\*\*/g, '^')
    .replace(/[×·]/g, '*')
    .replace(/[−–]/g, '-')
    .replace(/\bln\s*\(/g, 'log(');

  if (!s || s.length > 120) return null;
  if (!/^[0-9a-z_+*/^().,\s-]*$/.test(s)) return null;
  const names = s.match(/[a-z_][a-z0-9_]*/g) ?? [];
  return names.every((n) => ALLOWED.has(n)) ? s : null;
}

const nice = (v) => Number(v.toPrecision(10));

function niceStep(range) {
  const raw = range / 6;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pow;
}

function ticksOf(min, max) {
  const step = niceStep(max - min);
  const out = [];
  for (let i = Math.ceil(min / step - 1e-9); i * step <= max + step * 1e-9 && out.length < 40; i++) {
    out.push(nice(i * step));
  }
  return out;
}

// works out everything the drawing needs
async function build(graph) {
  const { compile } = await import('mathjs');

  let xMin = graph.xMin ?? -10;
  let xMax = graph.xMax ?? 10;
  if (!(xMin < xMax)) {
    xMin = -10;
    xMax = 10;
  }

  // calculate every curve
  const curves = [];
  for (const c of graph.curves) {
    const expr = cleanExpr(c.expr);
    if (!expr) continue;

    let fn;
    try {
      fn = compile(expr);
    } catch {
      continue;
    }

    const pts = [];
    for (let k = 0; k <= SAMPLES; k++) {
      const x = xMin + ((xMax - xMin) * k) / SAMPLES;
      let y = null;
      try {
        const v = fn.evaluate({ x });
        if (typeof v === 'number' && Number.isFinite(v)) y = v;
      } catch {
        /* the curve is not defined here */
      }
      pts.push({ x, y });
    }
    curves.push({ label: c.label || `y = ${expr}`, pts, color: COLORS[curves.length % COLORS.length] });
  }

  // the vertical range: the one the AI gave, or one worked out from the curves
  let yMin = graph.yMin;
  let yMax = graph.yMax;
  if (yMin === null || yMax === null || !(yMin < yMax)) {
    const ys = [];
    curves.forEach((c) => c.pts.forEach((p) => p.y !== null && ys.push(p.y)));

    if (ys.length) {
      ys.sort((a, b) => a - b);
      let lo = ys[Math.floor(ys.length * 0.03)];
      let hi = ys[Math.min(ys.length - 1, Math.floor(ys.length * 0.97))];
      graph.points.forEach((p) => {
        lo = Math.min(lo, p.y);
        hi = Math.max(hi, p.y);
      });
      if (hi === lo) {
        lo -= 1;
        hi += 1;
      }
      const pad = (hi - lo) * 0.1;
      yMin = lo - pad;
      yMax = hi + pad;
    } else {
      yMin = -10;
      yMax = 10;
    }
  }

  const span = yMax - yMin;
  const lim = span * 3;
  const sx = (x) => PAD.l + ((x - xMin) / (xMax - xMin)) * (W - PAD.l - PAD.r);
  const sy = (y) => PAD.t + ((yMax - y) / span) * (H - PAD.t - PAD.b);

  // turn the points into line pieces, breaking them where the curve is not defined or jumps
  curves.forEach((c) => {
    const pieces = [];
    let cur = [];
    let prev = null;

    for (const p of c.pts) {
      if (p.y === null) {
        if (cur.length > 1) pieces.push(cur);
        cur = [];
        prev = null;
        continue;
      }
      const y = Math.max(yMin - lim, Math.min(yMax + lim, p.y));
      if (prev !== null && Math.abs(y - prev) > span * 1.5) {
        if (cur.length > 1) pieces.push(cur);
        cur = [];
      }
      cur.push(`${sx(p.x).toFixed(1)} ${sy(y).toFixed(1)}`);
      prev = y;
    }
    if (cur.length > 1) pieces.push(cur);

    c.paths = pieces.map((piece) => `M${piece.join('L')}`);
  });

  return {
    curves,
    xt: ticksOf(xMin, xMax).map((v) => ({ v, p: sx(v) })),
    yt: ticksOf(yMin, yMax).map((v) => ({ v, p: sy(v) })),
    x0: xMin <= 0 && xMax >= 0 ? sx(0) : null,
    y0: yMin <= 0 && yMax >= 0 ? sy(0) : null,
    points: graph.points
      .filter((p) => p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax)
      .map((p) => ({ ...p, px: sx(p.x), py: sy(p.y) })),
  };
}

// draws the graph from the lesson's graph data: { title, xMin, xMax, yMin, yMax, curves, points }
export default function MathGraph({ graph }) {
  const clipId = `graph-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [result, setResult] = useState(null);       // { graph, data }

  useEffect(() => {
    let cancelled = false;
    build(graph)
      .then((data) => !cancelled && setResult({ graph, data }))
      .catch(() => !cancelled && setResult({ graph, data: null }));
    return () => {
      cancelled = true;
    };
  }, [graph]);

  if (!result || result.graph !== graph) {
    return <p className="graph__status">Drawing the graph…</p>;
  }

  const d = result.data;
  if (!d || (!d.curves.some((c) => c.paths.length) && !d.points.length)) {
    return <p className="graph__status">The graph could not be drawn.</p>;
  }

  const bottom = H - PAD.b;
  const right = W - PAD.r;

  return (
    <figure className="graph">
      {graph.title && <figcaption className="graph__title">{graph.title}</figcaption>}

      <svg className="graph__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={graph.title || 'Graph'}>
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.l} y={PAD.t} width={right - PAD.l} height={bottom - PAD.t} />
          </clipPath>
        </defs>

        {/* grid */}
        {d.xt.map((t) => (
          <line key={`gx${t.v}`} className="graph__grid" x1={t.p} x2={t.p} y1={PAD.t} y2={bottom} />
        ))}
        {d.yt.map((t) => (
          <line key={`gy${t.v}`} className="graph__grid" x1={PAD.l} x2={right} y1={t.p} y2={t.p} />
        ))}

        {/* the x and y axes (only when 0 is inside the picture) */}
        {d.x0 !== null && <line className="graph__axis" x1={d.x0} x2={d.x0} y1={PAD.t} y2={bottom} />}
        {d.y0 !== null && <line className="graph__axis" x1={PAD.l} x2={right} y1={d.y0} y2={d.y0} />}

        {/* numbers along the bottom and left edges */}
        {d.xt.map((t) => (
          <text key={`tx${t.v}`} className="graph__tick" x={t.p} y={bottom + 16} textAnchor="middle">
            {t.v}
          </text>
        ))}
        {d.yt.map((t) => (
          <text key={`ty${t.v}`} className="graph__tick" x={PAD.l - 6} y={t.p + 4} textAnchor="end">
            {t.v}
          </text>
        ))}

        {/* the curves draw themselves in */}
        <g clipPath={`url(#${clipId})`}>
          {d.curves.map((c, i) =>
            c.paths.map((p, j) => (
              <path
                key={`${i}-${j}`}
                className="graph__curve"
                d={p}
                pathLength="1"
                style={{ stroke: c.color, animationDelay: `${i * 0.15}s` }}
              />
            ))
          )}
        </g>

        {/* marked points (the label is kept inside the plot so it never sits on the edge) */}
        {d.points.map((p, i) => (
          <g key={i} className="graph__point" style={{ animationDelay: `${0.9 + i * 0.08}s` }}>
            <circle cx={p.px} cy={p.py} r="4" />
            <text
              x={p.px}
              y={Math.min(
                Math.max(p.py < PAD.t + 18 ? p.py + 18 : p.py - 9, PAD.t + 10),
                bottom - 6
              )}
              textAnchor={p.px > W - 70 ? 'end' : p.px < PAD.l + 40 ? 'start' : 'middle'}
            >
              {p.label || `(${nice(p.x)}, ${nice(p.y)})`}
            </text>
          </g>
        ))}
      </svg>

      <ul className="graph__legend">
        {d.curves
          .filter((c) => c.paths.length)
          .map((c, i) => (
            <li key={i}>
              <span className="graph__chip" style={{ background: c.color }} />
              {c.label}
            </li>
          ))}
      </ul>
    </figure>
  );
}