import { useEffect, useId, useState } from 'react';
import { W, H, PAD, build, nice } from './graphMath';

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