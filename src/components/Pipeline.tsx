import { useState } from "react";
import { featured } from "../data/content";

const W = 332;
const Y = 54;

/** The flagship as a computation graph: featured.parts in sequence, data flowing
 *  left to right, and featured.hub underneath that every part reads from.
 *  Everything comes from `featured` in content.ts (two to six parts fit). */
export default function Pipeline() {
  const [on, setOn] = useState(0);
  const parts = featured.parts.slice(0, 6);
  const n = parts.length;
  if (!n) return null;
  // node width shrinks a little as parts are added
  const nw = n <= 4 ? 56 : n === 5 ? 50 : 44;
  const margin = 8 + nw / 2;
  const X = parts.map((_, i) => (n === 1 ? W / 2 : margin + (i * (W - margin * 2)) / (n - 1)));
  const path = `M${X[0]} ${Y}L${X[n - 1]} ${Y}`;
  const hubW = Math.min(220, Math.max(110, featured.hub.length * 6.4 + 28));
  const fit = (s: string) => (s.length * 6 > nw - 4 ? `${s.slice(0, Math.max(3, Math.floor((nw - 8) / 6)))}.` : s);
  const cur = parts[Math.min(on, n - 1)];
  return (
    <figure className="pipe">
      <figcaption className="viz__cap">Out <span>{featured.graphLabel}</span></figcaption>
      <svg viewBox={`0 0 ${W} 150`} className="pipe__svg" role="img" aria-label={`${parts.map((p) => p.name).join(", ")} in sequence, sharing ${featured.hub}`}>
        <defs>
          <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" className="pipe__arr" /></marker>
        </defs>
        {X.slice(0, -1).map((x, i) => (
          <line key={x} x1={x + nw / 2 + 1} y1={Y} x2={X[i + 1] - nw / 2 - 3} y2={Y} className="pipe__edge" markerEnd="url(#arr)" />
        ))}
        {X.map((x) => <path key={x} d={`M${x} ${Y + 22}C${x} ${Y + 50} ${W / 2} ${Y + 40} ${W / 2} ${Y + 64}`} className="pipe__spoke" />)}
        <rect x={W / 2 - hubW / 2} y={Y + 64} width={hubW} height="26" rx="13" className="pipe__rag" />
        <text x={W / 2} y={Y + 81} className="pipe__ragt">{featured.hub}</text>
        {n > 1 && (
          <circle r="4.5" className="pipe__packet">
            <animateMotion dur="3.6s" repeatCount="indefinite" path={path} keyPoints="0;1" keyTimes="0;1" calcMode="linear" />
          </circle>
        )}
        {parts.map((p, i) => (
          <g key={p.name} className={`pipe__node${on === i ? " is-on" : ""}`} transform={`translate(${X[i]} ${Y})`}
            tabIndex={0} role="button" aria-pressed={on === i} aria-label={p.name}
            onClick={() => setOn(i)} onMouseEnter={() => setOn(i)} onFocus={() => setOn(i)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOn(i); } }}>
            <rect x={-nw / 2} y="-22" width={nw} height="44" rx="8" />
            <text y="-4" className="pipe__n">{String(i + 1).padStart(2, "0")}</text>
            <text y="11" className="pipe__name">{fit(p.name)}</text>
          </g>
        ))}
        <text x="4" y="14" className="pipe__io">{featured.input}</text>
        <text x={W - 4} y="14" className="pipe__io" textAnchor="end">{featured.output}</text>
      </svg>
      <p className="pipe__role" aria-live="polite"><b>{cur.name}.</b> {cur.role}</p>
    </figure>
  );
}
