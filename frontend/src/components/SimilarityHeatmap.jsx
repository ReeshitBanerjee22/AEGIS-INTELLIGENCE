import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { ArrowLeft, RefreshCw, ZoomIn, ZoomOut, Maximize2, Info } from "lucide-react";
import { fetchHeatmap } from "../api/client";

/* colour scale ──────────────────────────────────────────────────────────────
   0.00  dark navy    #0d1117
   0.35  dim amber    #f97316
   0.50  bright amber #fbbf24
   0.62+ vivid teal   #00d4aa   ← threshold
   1.00  near-white   #c8fff0   ← diagonal
─────────────────────────────────────────────────────────────────────────── */
function scoreToRgb(score, thr = 0.62) {
  if (score >= 0.999) return [200, 255, 240];
  if (score >= thr) {
    const t = (score - thr) / (1 - thr);
    return [Math.round(t * 80), Math.round(212 + t * 43), Math.round(170 + t * 85)];
  }
  if (score >= 0.45) {
    const t = (score - 0.45) / (thr - 0.45);
    return [Math.round(251 - t * 251), Math.round(191 - t * 100), Math.round(36 - t * 36)];
  }
  const t = score / 0.45;
  return [Math.round(20 + t * 231), Math.round(18 + t * 173), Math.round(22 + t * 14)];
}

function confidenceBand(score, thr) {
  if (score >= 0.999) return "SELF";
  if (score >= thr)   return "HIGH-CONFIDENCE";
  if (score >= 0.5)   return "PROBABLE";
  if (score >= 0.35)  return "POSSIBLE";
  return "WEAK / NOISE";
}

/* truncate canvas text to fit maxW px */
function truncate(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

const LABEL_W   = 150;   // left axis reserved width (px)
const LABEL_H   = 120;   // top axis reserved height (px)
const FONT_SIZE = 9;
const MIN_CELL  = 14;
const MAX_CELL  = 48;

export default function SimilarityHeatmap({ threshold = 0.62, onClose }) {
  const canvasRef = useRef(null);

  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [cellSize,    setCellSize]    = useState(22);
  const [hover,       setHover]       = useState(null);   // { ri, ci, sx, sy }
  const [sortMode,    setSortMode]    = useState("id");
  const [showDiag,    setShowDiag]    = useState(true);
  const [filterThr,   setFilterThr]   = useState(0);

  /* ── derived: sorted row/col index order ────────────────────────────── */
  const order = useMemo(() => {
    if (!data) return [];
    if (sortMode === "id") return data.labels.map((_, i) => i);
    const avgs = data.labels.map((_, i) =>
      data.matrix[i].reduce((s, v) => s + v, 0) / data.matrix[i].length
    );
    return data.labels.map((_, i) => i).sort((a, b) => avgs[b] - avgs[a]);
  }, [data, sortMode]);

  /* ── load heatmap data ───────────────────────────────────────────────── */
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try      { setData(await fetchHeatmap()); }
    catch(e) { setError(e.message); }
    finally  { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  /* ── draw canvas ─────────────────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || order.length === 0) return;

    const n   = data.labels.length;
    const dpr = window.devicePixelRatio || 1;

    /* logical CSS dimensions */
    const cssW = LABEL_W + n * cellSize;
    const cssH = LABEL_H + n * cellSize;

    /* physical backing store – enables crisp HiDPI rendering */
    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width  = cssW + "px";
    canvas.style.height = cssH + "px";

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    /* background */
    ctx.fillStyle = "#0a0b0d";
    ctx.fillRect(0, 0, cssW, cssH);

    /* ── cells ── */
    for (let ri = 0; ri < n; ri++) {
      for (let ci = 0; ci < n; ci++) {
        const row   = order[ri];
        const col   = order[ci];
        if (row === undefined || col === undefined) continue; // safety
        const score  = data.matrix[row][col];
        const isDiag = row === col;

        const x = LABEL_W + ci * cellSize;
        const y = LABEL_H + ri * cellSize;

        if (isDiag && !showDiag) {
          ctx.fillStyle = "#12151a";
          ctx.fillRect(x, y, cellSize, cellSize);
          continue;
        }

        const dim = filterThr > 0 && score < filterThr && !isDiag;
        const [r, g, b] = scoreToRgb(score, threshold);
        ctx.fillStyle = dim ? `rgba(${r},${g},${b},0.15)` : `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, cellSize, cellSize);

        /* subtle grid line */
        ctx.strokeStyle = "rgba(10,11,13,0.6)";
        ctx.lineWidth   = 0.5;
        ctx.strokeRect(x, y, cellSize, cellSize);
      }
    }

    /* ── hover highlight ── */
    if (hover) {
      const { ri: hr, ci: hc } = hover;
      ctx.fillStyle = "rgba(0,212,170,0.07)";
      ctx.fillRect(LABEL_W, LABEL_H + hr * cellSize, n * cellSize, cellSize); // row band
      ctx.fillRect(LABEL_W + hc * cellSize, LABEL_H, cellSize, n * cellSize); // col band
      ctx.strokeStyle = "#00d4aa";
      ctx.lineWidth   = 1.5;
      ctx.strokeRect(LABEL_W + hc * cellSize, LABEL_H + hr * cellSize, cellSize, cellSize);
    }

    /* ── X-axis labels (top, rotated -90°) ── */
    ctx.save();
    ctx.font          = `bold ${FONT_SIZE}px "JetBrains Mono", monospace`;
    ctx.textAlign     = "right";
    ctx.textBaseline  = "middle";
    for (let ci = 0; ci < n; ci++) {
      const col = order[ci];
      if (col === undefined) continue;
      const lbl  = data.labels[col];
      const cx   = LABEL_W + ci * cellSize + cellSize / 2;
      const isHv = hover && hover.ci === ci;
      ctx.save();
      ctx.translate(cx, LABEL_H - 8);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = isHv ? "#00d4aa" : "#5a6a7a";
      ctx.fillText(truncate(ctx, "@" + lbl.username, LABEL_H - 14), 0, 0);
      ctx.restore();
    }
    ctx.restore();

    /* ── Y-axis labels (left, horizontal, clipped) ── */
    ctx.save();
    ctx.font         = `bold ${FONT_SIZE}px "JetBrains Mono", monospace`;
    ctx.textAlign    = "left";
    ctx.textBaseline = "middle";
    for (let ri = 0; ri < n; ri++) {
      const row = order[ri];
      if (row === undefined) continue;
      const lbl  = data.labels[row];
      const cy   = LABEL_H + ri * cellSize + cellSize / 2;
      const isHv = hover && hover.ri === ri;
      ctx.fillStyle = isHv ? "#00d4aa" : "#5a6a7a";
      ctx.save();
      ctx.beginPath();
      ctx.rect(2, LABEL_H + ri * cellSize + 1, LABEL_W - 6, cellSize - 2);
      ctx.clip();
      ctx.fillText(truncate(ctx, "@" + lbl.username, LABEL_W - 14), 4, cy);
      ctx.restore();
    }
    ctx.restore();

    /* ── corner ── */
    ctx.font          = `bold ${FONT_SIZE}px "JetBrains Mono", monospace`;
    ctx.fillStyle     = "#2a3340";
    ctx.textAlign     = "center";
    ctx.textBaseline  = "middle";
    ctx.fillText("ALIAS", LABEL_W / 2, LABEL_H / 2);

  }, [data, order, cellSize, hover, showDiag, filterThr, threshold]);

  /* ── mouse events ────────────────────────────────────────────────────── */
  const handleMouseMove = useCallback((e) => {
    if (!data) return;
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const cx     = e.clientX - rect.left;
    const cy     = e.clientY - rect.top;
    const ci     = Math.floor((cx - LABEL_W) / cellSize);
    const ri     = Math.floor((cy - LABEL_H) / cellSize);
    const n      = data.labels.length;
    if (ci >= 0 && ci < n && ri >= 0 && ri < n) {
      setHover({ ri, ci, sx: e.clientX, sy: e.clientY });
    } else {
      setHover(null);
    }
  }, [data, cellSize]);

  const handleMouseLeave = () => setHover(null);

  /* ── tooltip ─────────────────────────────────────────────────────────── */
  const tip = useMemo(() => {
    if (!hover || !data || order.length === 0) return null;
    const rowA = data.labels[order[hover.ri]];
    const colA = data.labels[order[hover.ci]];
    if (!rowA || !colA) return null;
    const score = data.matrix[order[hover.ri]][order[hover.ci]];
    return { rowA, colA, score, band: confidenceBand(score, threshold) };
  }, [hover, data, order, threshold]);

  const legendStops = [0, 0.2, 0.35, 0.5, 0.62, 0.75, 0.9, 1.0];

  /* ── loading / error screens ─────────────────────────────────────────── */
  if (loading) return (
    <div className="fixed inset-0 z-50 bg-[#0a0b0d] flex flex-col items-center justify-center gap-4">
      <RefreshCw className="w-6 h-6 text-[#00d4aa] animate-spin" />
      <p className="font-mono text-xs text-[#5a6a7a]">LOADING SIMILARITY MATRIX…</p>
    </div>
  );

  if (error) return (
    <div className="fixed inset-0 z-50 bg-[#0a0b0d] flex flex-col items-center justify-center gap-4">
      <p className="font-mono text-xs text-[#f43f5e]">MATRIX LOAD FAILED</p>
      <p className="font-mono text-[10px] text-[#5a6a7a]">{error}</p>
      <button onClick={load} className="font-mono text-[11px] text-[#00d4aa] border border-[#00d4aa]/30 hover:border-[#00d4aa] px-4 py-2 flex items-center gap-2 transition-colors mt-2">
        <RefreshCw className="w-3 h-3" /> RETRY
      </button>
    </div>
  );

  const n = data?.labels?.length ?? 0;

  /* ── main render ─────────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-50 bg-[#0a0b0d] flex flex-col" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* header */}
      <header className="h-11 flex-shrink-0 bg-[#0e1012] border-b border-[#1e252e] px-4 flex items-center justify-between z-30">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="font-mono text-[11px] text-[#5a6a7a] hover:text-[#00d4aa] flex items-center gap-1.5 transition-colors">
            <ArrowLeft className="w-3 h-3" /> BACK
          </button>
          <div className="h-4 w-px bg-[#1e252e]" />
          <span className="font-mono text-[11px] font-bold tracking-[0.15em] text-[#cdd6e0]">SIMILARITY SCORE HEATMAP</span>
          <span className="font-mono text-[10px] text-[#2a3340] border border-[#1e252e] px-1.5">{n}×{n} MATRIX</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-[#5a6a7a]">
          <span>THRESHOLD</span>
          <span className="text-[#00d4aa] font-bold">{threshold.toFixed(2)}</span>
          <div className="w-px h-4 bg-[#1e252e] mx-1" />
          <span className="text-[#8899aa]">{n} ALIASES</span>
        </div>
      </header>

      {/* body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* sidebar */}
        <aside className="w-56 flex-shrink-0 bg-[#0e1012] border-r border-[#1e252e] flex flex-col overflow-y-auto">

          {/* zoom */}
          <div className="border-b border-[#1e252e] p-3">
            <p className="font-mono text-[10px] text-[#2a3340] uppercase tracking-widest mb-2">Cell Size</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setCellSize(s => Math.max(MIN_CELL, s - 4))} className="w-7 h-7 flex items-center justify-center border border-[#1e252e] hover:border-[#00d4aa]/40 hover:text-[#00d4aa] text-[#5a6a7a] transition-colors"><ZoomOut className="w-3 h-3" /></button>
              <span className="font-mono text-[11px] text-[#cdd6e0] flex-1 text-center">{cellSize}px</span>
              <button onClick={() => setCellSize(s => Math.min(MAX_CELL, s + 4))} className="w-7 h-7 flex items-center justify-center border border-[#1e252e] hover:border-[#00d4aa]/40 hover:text-[#00d4aa] text-[#5a6a7a] transition-colors"><ZoomIn className="w-3 h-3" /></button>
              <button onClick={() => setCellSize(22)} className="w-7 h-7 flex items-center justify-center border border-[#1e252e] hover:border-[#00d4aa]/40 hover:text-[#00d4aa] text-[#5a6a7a] transition-colors"><Maximize2 className="w-3 h-3" /></button>
            </div>
          </div>

          {/* sort */}
          <div className="border-b border-[#1e252e] p-3">
            <p className="font-mono text-[10px] text-[#2a3340] uppercase tracking-widest mb-2">Sort Order</p>
            {["id", "cluster"].map(m => (
              <button key={m} onClick={() => setSortMode(m)}
                className={`w-full text-left font-mono text-[11px] px-2 py-1.5 mb-1 border transition-all ${sortMode === m ? "border-[#00d4aa]/40 bg-[#00d4aa]/8 text-[#00d4aa]" : "border-[#1e252e] text-[#5a6a7a] hover:text-[#cdd6e0] hover:border-[#2a3340]"}`}>
                {m === "id" ? "BY ALIAS ID" : "BY SIMILARITY"}
              </button>
            ))}
          </div>

          {/* options */}
          <div className="border-b border-[#1e252e] p-3">
            <p className="font-mono text-[10px] text-[#2a3340] uppercase tracking-widest mb-2">Options</p>
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setShowDiag(v => !v)}>
              <div className={`w-8 h-4 flex-shrink-0 border transition-colors relative ${showDiag ? "border-[#00d4aa]/60 bg-[#00d4aa]/15" : "border-[#2a3340]"}`}>
                {showDiag && <div className="absolute inset-0.5 bg-[#00d4aa]" />}
              </div>
              <span className="font-mono text-[10px] text-[#5a6a7a]">DIAGONAL (SELF)</span>
            </div>
          </div>

          {/* min highlight */}
          <div className="border-b border-[#1e252e] p-3">
            <p className="font-mono text-[10px] text-[#2a3340] uppercase tracking-widest mb-2">MIN HIGHLIGHT</p>
            <input type="range" min="0" max="0.9" step="0.05" value={filterThr}
              onChange={e => setFilterThr(Number(e.target.value))}
              className="w-full accent-[#00d4aa] h-1 cursor-pointer" />
            <div className="flex justify-between font-mono text-[10px] text-[#2a3340] mt-1">
              <span>0.00</span>
              <span className="text-[#00d4aa]">{filterThr.toFixed(2)}</span>
              <span>0.90</span>
            </div>
            <p className="font-mono text-[9px] text-[#2a3340] mt-1">Dims cells below score</p>
          </div>

          {/* legend */}
          <div className="p-3">
            <p className="font-mono text-[10px] text-[#2a3340] uppercase tracking-widest mb-3">Score Scale</p>
            <div className="w-full h-3 mb-2 rounded-sm" style={{ background: `linear-gradient(to right, ${legendStops.map(s => { const [r,g,b] = scoreToRgb(s, threshold); return `rgb(${r},${g},${b})`; }).join(", ")})` }} />
            <div className="flex justify-between font-mono text-[9px] text-[#2a3340]">
              <span>0.0</span><span className="text-[#fbbf24]">0.35</span>
              <span className="text-[#00d4aa]">{threshold.toFixed(2)}</span><span>1.0</span>
            </div>
            <div className="mt-3 space-y-1.5">
              {[
                { label: "HIGH-CONFIDENCE", color: "#00d4aa", min: threshold },
                { label: "PROBABLE",        color: "#fbbf24", min: 0.5 },
                { label: "POSSIBLE",        color: "#f97316", min: 0.35 },
                { label: "WEAK / NOISE",    color: "#2a3340", min: 0 },
              ].map(b => (
                <div key={b.label} className="flex items-center gap-2">
                  <div className="w-2 h-2 flex-shrink-0" style={{ background: b.color }} />
                  <span className="font-mono text-[9px] text-[#5a6a7a]">{b.label}</span>
                  <span className="font-mono text-[9px] text-[#2a3340] ml-auto">≥{b.min.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* canvas scroll area */}
        <div className="flex-1 overflow-auto" style={{ background: "#0a0b0d" }}>
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{ display: "block", cursor: "crosshair" }}
          />
        </div>
      </div>

      {/* tooltip */}
      {tip && hover && (
        <div className="fixed z-[60] pointer-events-none" style={{ left: hover.sx + 16, top: hover.sy + 16 }}>
          <div className="bg-[#0e1012] border border-[#1e252e] p-3 min-w-[220px]"
               style={{ boxShadow: "0 0 20px rgba(0,0,0,0.8), 0 0 1px rgba(0,212,170,0.25)" }}>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="font-mono text-2xl font-bold" style={{ color: `rgb(${scoreToRgb(tip.score, threshold).join(",")})` }}>
                {tip.score.toFixed(4)}
              </span>
              <span className="font-mono text-[10px] text-[#5a6a7a]">similarity</span>
            </div>
            <div className="font-mono text-[10px] text-[#00d4aa] mb-3 border-l-2 border-[#00d4aa]/40 pl-2">{tip.band}</div>
            <div className="space-y-1 mb-3">
              {[["ROW", tip.rowA], ["COL", tip.colA]].map(([lbl, a]) => (
                <div key={lbl} className="flex gap-2">
                  <span className="font-mono text-[10px] text-[#2a3340] w-5">{lbl}</span>
                  <span className="font-mono text-[10px] text-[#5a6a7a]">{a.id}</span>
                  <span className="font-mono text-[10px] text-[#cdd6e0]">@{a.username}</span>
                </div>
              ))}
            </div>
            <div className="h-1 w-full bg-[#1e252e]">
              <div className="h-full" style={{ width: `${tip.score * 100}%`, background: `rgb(${scoreToRgb(tip.score, threshold).join(",")})` }} />
            </div>
            <div className="flex justify-between font-mono text-[9px] text-[#2a3340] mt-0.5">
              <span>0.0</span><span className="text-[#5a6a7a]">THR {threshold.toFixed(2)}</span><span>1.0</span>
            </div>
            <div className="mt-2 pt-2 border-t border-[#1e252e] grid grid-cols-2 gap-1">
              <div className="font-mono text-[9px] text-[#2a3340]">{tip.rowA.platform}</div>
              <div className="font-mono text-[9px] text-[#2a3340] text-right">{tip.colA.platform}</div>
            </div>
          </div>
        </div>
      )}

      {/* status bar */}
      <div className="h-6 flex-shrink-0 bg-[#0e1012] border-t border-[#1e252e] flex items-center gap-4 px-4">
        <span className="font-mono text-[10px] text-[#2a3340]"><span className="text-[#5a6a7a]">SORT</span> {sortMode.toUpperCase()}</span>
        <span className="font-mono text-[10px] text-[#2a3340]"><span className="text-[#5a6a7a]">CELL</span> {cellSize}px</span>
        {hover && tip && (
          <>
            <div className="w-px h-3 bg-[#1e252e]" />
            <span className="font-mono text-[10px] text-[#5a6a7a]">@{tip.rowA.username} ↔ @{tip.colA.username}</span>
            <span className="font-mono text-[10px] font-bold" style={{ color: `rgb(${scoreToRgb(tip.score, threshold).join(",")})` }}>{tip.score.toFixed(4)}</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1 text-[#2a3340]">
          <Info className="w-3 h-3" />
          <span className="font-mono text-[9px]">HOVER CELL · SCROLL TO PAN</span>
        </div>
      </div>
    </div>
  );
}
