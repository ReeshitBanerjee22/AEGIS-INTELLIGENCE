import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield, Search, Terminal, Database, RefreshCw,
  ArrowLeft, Crosshair, Sliders, BarChart2,
} from 'lucide-react';
import LandingPage from './components/LandingPage';
import Graph from './components/Graph';
import ThresholdSlider from './components/ThresholdSlider';
import EvidencePanel from './components/EvidencePanel';
import ClusterCards from './components/ClusterCards';
import InvestigationMode from './components/InvestigationMode';
import SideSection from './components/SideSection';
import SimilarityHeatmap from './components/SimilarityHeatmap';
import { fetchGraph, fetchAliasDetail, resolveAlias } from './api/client';

export default function App() {
  const [currentView, setCurrentView] = useState('landing');
  const [threshold, setThreshold] = useState(0.55);
  const [graphData, setGraphData] = useState({ nodes: [], edges: [], clusters: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedNodeDetail, setSelectedNodeDetail] = useState(null);
  const [selectedNodeResolution, setSelectedNodeResolution] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState('node');
  const [highlightClusterId, setHighlightClusterId] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const debounceRef = useRef(null);

  const loadGraph = useCallback(async (thresh) => {
    try {
      setLoading(true); setError(null);
      const data = await fetchGraph(thresh);
      setGraphData(data);
    } catch (err) {
      setError(err.message || 'Backend unreachable');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadGraph(threshold); }, [loadGraph]);

  const handleThresholdChange = (val) => {
    setThreshold(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadGraph(val);
      if (selectedNode) resolveAlias(selectedNode.id, val).then(setSelectedNodeResolution);
    }, 150);
  };

  const handleNodeClick = async (node) => {
    setSelectedNode(node); setSelectedEdge(null);
    setPanelMode('node'); setIsPanelOpen(true);
    try {
      const [detail, resolution] = await Promise.all([
        fetchAliasDetail(node.id), resolveAlias(node.id, threshold),
      ]);
      setSelectedNodeDetail(detail);
      setSelectedNodeResolution(resolution);
    } catch (err) { console.error(err); }
  };

  const handleEdgeClick = (edge) => {
    setSelectedEdge(edge); setSelectedNode(null);
    setPanelMode('edge'); setIsPanelOpen(true);
  };

  const handleBackgroundClick = () => {
    setIsPanelOpen(false); setSelectedNode(null);
    setSelectedEdge(null); setHighlightClusterId(null);
  };

  const handleSelectAliasById = (aliasId) => {
    const node = graphData.nodes.find(n => n.id === aliasId);
    if (node) handleNodeClick(node);
  };



  const filteredNodes = graphData.nodes.filter(n =>
    n.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.platform.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (currentView === 'landing') return <LandingPage onEnterDashboard={() => setCurrentView('dashboard')} />;
  if (currentView === 'investigation') return <InvestigationMode allNodes={graphData.nodes} onExit={() => setCurrentView('dashboard')} />;
  if (currentView === 'heatmap') return <SimilarityHeatmap threshold={threshold} onClose={() => setCurrentView('dashboard')} />;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0a0b0d] text-[#cdd6e0] overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Header ─────────────────────────────────── */}
      <header className="h-11 flex-shrink-0 bg-[#0e1012] border-b border-[#1e252e] px-4 flex items-center justify-between z-30">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setCurrentView('landing')}
            className="font-mono text-[11px] text-[#5a6a7a] hover:text-[#00d4aa] flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" /> HOME
          </button>
          <div className="h-4 w-px bg-[#1e252e]" />
          <div className="flex items-center gap-2">
            <div className="w-px h-4 bg-[#1e252e]" />
            <span className="font-mono text-[11px] font-bold tracking-[0.15em] text-[#cdd6e0] uppercase">
              AEGIS-INTELLIGENCE
            </span>
            <span className="font-mono text-[10px] text-[#2a3340] border border-[#1e252e] px-1.5">
              THREAT RESOLUTION
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-[11px]">
          {loading && (
            <span className="flex items-center gap-1.5 text-[#5a6a7a]">
              <RefreshCw className="w-3 h-3 animate-spin" /> SYNCING
            </span>
          )}
          <div className="flex items-center gap-1.5 border-l border-[#1e252e] pl-3">
            <span className="w-1.5 h-1.5 bg-[#00d4aa]/60" />
            <span className="text-[#5a6a7a]">BACKEND <span className="text-[#8899aa]">ONLINE</span></span>
          </div>
          <div className="flex items-center gap-1.5 border-l border-[#1e252e] pl-3 text-[#5a6a7a]">
            NODES <span className="text-[#cdd6e0] font-bold">{graphData.nodes.length}</span>
          </div>
          <div className="flex items-center gap-1.5 border-l border-[#1e252e] pl-3 text-[#5a6a7a]">
            CLUSTERS <span className="text-[#cdd6e0] font-bold">{graphData.clusters.length}</span>
          </div>
          <button
            onClick={() => setCurrentView('heatmap')}
            className="flex items-center gap-1.5 border-l border-[#1e252e] pl-3 text-[#5a6a7a] hover:text-[#00d4aa] transition-colors"
            title="Similarity Score Heatmap"
          >
            <BarChart2 className="w-3 h-3" />
            <span>HEATMAP</span>
          </button>
        </div>
      </header>

      {/* ── Workspace ──────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* ── Sidebar ─────────────────────────────── */}
        <aside className="w-64 flex-shrink-0 bg-[#0e1012] border-r border-[#1e252e] overflow-y-auto z-20 flex flex-col">

          <SideSection title="Threshold" icon={Sliders}>
            <ThresholdSlider
              threshold={threshold}
              onChange={handleThresholdChange}
              totalEdges={graphData.edges.length}
              totalClusters={graphData.clusters.length}
            />
          </SideSection>



          <SideSection title="Workflow" icon={Crosshair} defaultOpen={false}>
            <button
              onClick={() => setCurrentView('investigation')}
              className="w-full text-left font-mono text-[11px] text-[#00d4aa] border border-[#00d4aa]/25 hover:border-[#00d4aa]/60 hover:bg-[#00d4aa]/5 px-3 py-2 transition-all flex items-center gap-2"
            >
              <Terminal className="w-3 h-3" /> INVESTIGATION MODE
            </button>
          </SideSection>

          <SideSection title="Alias Directory" icon={Database}>
            <div className="relative mb-2">
              <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-[#2a3340]" />
              <input
                type="text"
                placeholder="id / handle / platform"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-[#0a0b0d] border border-[#1e252e] focus:border-[#00d4aa]/40 pl-7 pr-2 py-1.5 text-[11px] font-mono text-[#cdd6e0] placeholder-[#2a3340] outline-none transition-colors"
              />
            </div>
            <div className="space-y-px">
              {filteredNodes.map(node => {
                const isSel = selectedNode?.id === node.id;
                return (
                  <button
                    key={node.id}
                    onClick={() => handleNodeClick(node)}
                    className={`w-full text-left px-2 py-1.5 font-mono text-[11px] flex items-center gap-2 transition-colors ${
                      isSel
                        ? 'bg-[#00d4aa]/8 text-[#00d4aa] border-l-2 border-[#00d4aa]'
                        : 'text-[#8899aa] hover:bg-[#12151a] hover:text-[#cdd6e0] border-l-2 border-transparent'
                    }`}
                  >
                    <span className={`text-[10px] font-bold w-8 flex-shrink-0 ${isSel ? 'text-[#00d4aa]' : 'text-[#5a6a7a]'}`}>
                      {node.id}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate">@{node.username}</div>
                      <div className="text-[9px] text-[#2a3340]">{node.platform}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </SideSection>
        </aside>

        {/* ── Graph ───────────────────────────────── */}
        <div className="flex-1 relative overflow-hidden">
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Shield className="w-8 h-8 text-[#f43f5e]/30" />
              <p className="font-mono text-xs text-[#f43f5e]">BACKEND CONNECTION FAILED</p>
              <p className="font-mono text-[10px] text-[#5a6a7a] max-w-xs text-center">{error}</p>
              <button
                onClick={() => loadGraph(threshold)}
                className="mt-2 font-mono text-[11px] text-[#00d4aa] border border-[#00d4aa]/30 hover:border-[#00d4aa] px-4 py-2 flex items-center gap-2 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> RETRY
              </button>
            </div>
          ) : (
            <Graph
              nodes={graphData.nodes}
              edges={graphData.edges}
              clusters={graphData.clusters}
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              highlightCluster={highlightClusterId}

              onNodeClick={handleNodeClick}
              onEdgeClick={handleEdgeClick}
              onBackgroundClick={handleBackgroundClick}
            />
          )}
          <EvidencePanel
            isOpen={isPanelOpen}
            mode={panelMode}
            selectedNodeData={selectedNodeDetail}
            selectedNodeResolution={selectedNodeResolution}
            selectedEdgeData={selectedEdge}
            onClose={() => { setIsPanelOpen(false); setSelectedNode(null); setSelectedEdge(null); }}
            onSelectAlias={handleSelectAliasById}
          />
        </div>
      </div>

      {/* ── Cluster strip ───────────────────────────── */}
      <ClusterCards
        clusters={graphData.clusters}
        selectedClusterId={highlightClusterId}
        onSelectCluster={setHighlightClusterId}
      />
    </div>
  );
}
