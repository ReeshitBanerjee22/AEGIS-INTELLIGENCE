import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronRight, Fingerprint, ShieldAlert, FileText, CheckCircle2, FileSearch, ArrowLeft, Download } from 'lucide-react';
import { resolveAlias, fetchAliasDetail } from '../api/client';
import html2pdf from 'html2pdf.js';
const TemporalTimeline = ({ targetPosts, candidatePosts, targetId, candidateId }) => {
  if (!targetPosts?.length || !candidatePosts?.length) return null;

  const allPosts = [...targetPosts, ...candidatePosts];
  const timestamps = allPosts.map(p => new Date(p.timestamp).getTime()).filter(t => !isNaN(t));
  if (timestamps.length === 0) return null;

  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  
  const pad = (maxTime - minTime) * 0.1 || 86400000 * 7; 
  const start = minTime - pad;
  const end = maxTime + pad;
  const range = end - start;

  const getPosition = (ts) => ((new Date(ts).getTime() - start) / range) * 100;

  const targetDates = targetPosts.map(p => new Date(p.timestamp).getTime()).filter(t => !isNaN(t));
  const candidateDates = candidatePosts.map(p => new Date(p.timestamp).getTime()).filter(t => !isNaN(t));
  
  const minTarget = Math.min(...targetDates);
  const maxTarget = Math.max(...targetDates);
  const minCandidate = Math.min(...candidateDates);
  const maxCandidate = Math.max(...candidateDates);

  const overlapStart = Math.max(minTarget, minCandidate);
  const overlapEnd = Math.min(maxTarget, maxCandidate);
  const hasOverlap = overlapStart <= overlapEnd;

  return (
    <div className="w-full">
      <div className="flex justify-between text-[10px] text-gray-500 font-mono mb-2">
        <span>{new Date(start).toLocaleDateString()}</span>
        <span>{new Date(end).toLocaleDateString()}</span>
      </div>
      <div className="relative h-16 bg-[#161726] border border-[#282942] rounded-lg overflow-hidden">
        {hasOverlap && (
          <div 
            className="absolute top-0 bottom-0 bg-cyan-900/20 border-x border-cyan-500/30"
            style={{ 
              left: `${getPosition(overlapStart)}%`, 
              width: `${getPosition(overlapEnd) - getPosition(overlapStart)}%` 
            }}
          />
        )}
        
        <div className="absolute top-1/2 left-0 right-0 h-px bg-[#282942]" />

        <div className="absolute top-0 left-0 right-0 h-1/2">
          <div className="absolute left-2 top-1 text-[9px] font-mono text-cyan-500/50">{targetId}</div>
          {targetPosts.map((p, i) => (
            <div 
              key={`t-${i}`}
              className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-cyan-400 rounded-full shadow-[0_0_5px_rgba(34,211,238,0.8)]"
              style={{ left: `${getPosition(p.timestamp)}%` }}
              title={new Date(p.timestamp).toLocaleDateString()}
            />
          ))}
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-1/2">
          <div className="absolute left-2 bottom-1 text-[9px] font-mono text-rose-500/50">{candidateId}</div>
          {candidatePosts.map((p, i) => (
            <div 
              key={`c-${i}`}
              className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-rose-400 rounded-full shadow-[0_0_5px_rgba(251,113,133,0.8)]"
              style={{ left: `${getPosition(p.timestamp)}%` }}
              title={new Date(p.timestamp).toLocaleDateString()}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 text-xs font-mono text-gray-400 text-center">
        {hasOverlap ? (
          <span className="text-cyan-400 bg-cyan-900/30 px-2 py-0.5 rounded border border-cyan-800/40">Concurrent Activity Overlap Detected</span>
        ) : (
          <span className="text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded border border-amber-800/40">Sequential Handover (No Overlap)</span>
        )}
      </div>
    </div>
  );
};

export default function InvestigationMode({ allNodes, onExit }) {
  const [step, setStep] = useState(1);
  const [selectedAliasId, setSelectedAliasId] = useState(null);
  const [aliasDetail, setAliasDetail] = useState(null);
  
  const [candidates, setCandidates] = useState([]);
  const [isResolving, setIsResolving] = useState(false);
  
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Step 1: Select Suspicious Alias
  const handleSelectAlias = async (nodeId) => {
    setSelectedAliasId(nodeId);
    setStep(2);
    setIsResolving(true);
    try {
      const [detail, resolution] = await Promise.all([
        fetchAliasDetail(nodeId),
        resolveAlias(nodeId, 0.0, true) // fetch all matches, compare_all=true
      ]);
      setAliasDetail(detail);
      // Filter out low scores, keep anything > 0.10 for demo purposes, sorted by score
      const filtered = resolution.matches.filter(m => m.score > 0.15).sort((a, b) => b.score - a.score);
      setCandidates(filtered);
    } catch (err) {
      console.error(err);
    } finally {
      setIsResolving(false);
    }
  };

  // Step 3: Select Candidate
  const handleSelectCandidate = async (candidate) => {
    setIsResolving(true);
    try {
      const detail = await fetchAliasDetail(candidate.target_alias_id);
      setSelectedCandidate({ ...candidate, detail });
      setStep(4);
    } catch (err) {
      console.error(err);
    } finally {
      setIsResolving(false);
    }
  };

  // Step 5: Generate Report
  const handleGenerateReport = () => {
    setReportGenerated(true);
    setStep(5);
  };

  const handleExportPDF = () => {
    const element = document.getElementById('report-content');
    if (!element) return;
    
    const opt = {
      margin:       0.5,
      filename:     `AEGIS-Report-${selectedAliasId}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#0f1019' },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(element).save();
  };

  const filteredNodes = allNodes.filter(n => n.id.toLowerCase().includes(searchQuery.toLowerCase()) || n.username.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="absolute inset-0 bg-[#0a0a0f] z-40 flex flex-col p-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 border-b border-[#1e1e2f] pb-4">
        <div className="flex items-center gap-4">
          <button onClick={onExit} className="p-2 bg-[#151522] hover:bg-[#1f1f32] rounded-lg border border-[#252538] text-gray-300">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-white font-mono uppercase flex items-center gap-2">
              <FileSearch className="w-6 h-6 text-cyan-400" />
              Analyst Investigation Mode
            </h2>
            <p className="text-sm text-gray-400 font-mono">Structured Threat Intelligence Workflow</p>
          </div>
        </div>
        <div className="flex items-center gap-3 font-mono text-sm">
          <span className={`px-3 py-1 rounded-full border ${step >= 1 ? 'border-cyan-500 text-cyan-400 bg-cyan-950/30' : 'border-[#252538] text-gray-500'}`}>1. Target</span>
          <span className={`px-3 py-1 rounded-full border ${step >= 2 ? 'border-cyan-500 text-cyan-400 bg-cyan-950/30' : 'border-[#252538] text-gray-500'}`}>2. Candidates</span>
          <span className={`px-3 py-1 rounded-full border ${step >= 4 ? 'border-cyan-500 text-cyan-400 bg-cyan-950/30' : 'border-[#252538] text-gray-500'}`}>3. Evidence</span>
          <span className={`px-3 py-1 rounded-full border ${step >= 5 ? 'border-cyan-500 text-cyan-400 bg-cyan-950/30' : 'border-[#252538] text-gray-500'}`}>4. Report</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex gap-6 min-h-0">
        
        {/* Step 1 & 2: Selection Panel */}
        <div className="w-1/3 flex flex-col gap-6 h-full">
          {/* Target Selection */}
          <div className="bg-[#101018] border border-[#1e1e2f] rounded-xl flex flex-col h-1/2 overflow-hidden">
            <div className="p-4 border-b border-[#1e1e2f] bg-[#151624]">
              <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider font-mono">STEP 1: Select Suspicious Alias</h3>
            </div>
            <div className="p-4 flex-1 flex flex-col min-h-0">
              <div className="relative mb-3 flex-shrink-0">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                <input 
                  type="text" 
                  placeholder="Search aliases..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#0c0c12] border border-[#202030] rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 font-mono focus:border-cyan-500 outline-none"
                />
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                {filteredNodes.map(n => (
                  <div 
                    key={n.id} 
                    onClick={() => handleSelectAlias(n.id)}
                    className={`p-3 rounded-lg border cursor-pointer flex items-center justify-between transition-colors ${selectedAliasId === n.id ? 'bg-[#18192a] border-cyan-500' : 'bg-[#0d0d16] border-[#1c1c2b] hover:bg-[#141522]'}`}
                  >
                    <div>
                      <div className="font-bold text-gray-200 font-mono">{n.id} <span className="text-gray-500 font-sans">@{n.username}</span></div>
                    </div>
                    {selectedAliasId === n.id && <ChevronRight className="w-5 h-5 text-cyan-400" />}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Candidates List */}
          <div className={`bg-[#101018] border border-[#1e1e2f] rounded-xl flex flex-col h-1/2 overflow-hidden transition-opacity ${step >= 2 ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
            <div className="p-4 border-b border-[#1e1e2f] bg-[#151624]">
              <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider font-mono">STEP 2: System Candidates</h3>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              {isResolving ? (
                <div className="h-full flex flex-col items-center justify-center text-cyan-400 font-mono text-sm animate-pulse">
                  <Fingerprint className="w-8 h-8 mb-2" />
                  Correlating Stylometric Vectors...
                </div>
              ) : (
                <div className="space-y-3">
                  {candidates.map((c, i) => (
                    <div 
                      key={c.target_alias_id} 
                      onClick={() => handleSelectCandidate(c)}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedCandidate?.target_alias_id === c.target_alias_id ? 'bg-[#18192a] border-cyan-500' : 'bg-[#0d0d16] border-[#1c1c2b] hover:bg-[#141522]'}`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-gray-200 font-mono">{c.target_alias_id}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${c.confidence_pct >= 80 ? 'bg-emerald-900/50 text-emerald-400' : c.confidence_pct >= 65 ? 'bg-amber-900/50 text-amber-400' : 'bg-rose-900/50 text-rose-400'}`}>
                          {c.confidence_pct}%
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-gray-400">
                        <span>@{c.target_username}</span>
                        <span>{c.confidence_label || (c.confidence_pct >= 80 ? 'High-confidence' : c.confidence_pct >= 65 ? 'Probable' : c.confidence_pct >= 40 ? 'Possible' : 'Weak')}</span>
                      </div>
                    </div>
                  ))}
                  {candidates.length === 0 && selectedAliasId && <div className="text-center text-gray-500 font-mono text-sm mt-10">No candidates found.</div>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Step 3 & 4: Evidence & Report Panel */}
        <div className="w-2/3 flex flex-col gap-6 h-full">
          
          {/* Evidence Comparison */}
          <div className={`bg-[#101018] border border-[#1e1e2f] rounded-xl flex flex-col flex-1 overflow-hidden transition-opacity ${step >= 4 ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
             <div className="p-4 border-b border-[#1e1e2f] bg-[#151624] flex justify-between items-center">
              <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider font-mono">STEP 3: Evidence Comparison</h3>
              {selectedCandidate && (
                <button onClick={handleGenerateReport} className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-mono text-xs font-bold transition-colors shadow-[0_0_15px_rgba(6,182,212,0.4)]">
                  Generate Report
                </button>
              )}
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto">
              {selectedCandidate ? (
                <div className="space-y-8">
                  {/* Entity Header */}
                  <div className="flex justify-between items-center">
                    <div className="w-2/5 p-4 bg-[#151624] border border-[#232338] rounded-xl text-center">
                      <div className="text-2xl font-bold text-cyan-400 font-mono mb-1">{selectedAliasId}</div>
                      <div className="text-sm text-gray-400">@{aliasDetail?.username}</div>
                    </div>
                    <div className="flex flex-col items-center text-gray-500 font-mono text-xs">
                      <span>vs</span>
                      <ShieldAlert className="w-6 h-6 text-rose-500 my-1" />
                      <span>{selectedCandidate.confidence_pct}% Match</span>
                    </div>
                    <div className="w-2/5 p-4 bg-[#151624] border border-[#232338] rounded-xl text-center">
                      <div className="text-2xl font-bold text-rose-400 font-mono mb-1">{selectedCandidate.target_alias_id}</div>
                      <div className="text-sm text-gray-400">@{selectedCandidate.target_username}</div>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-mono border-b border-[#1e1e2f] pb-2">Stylometric Vectors</h4>
                    
                    {/* Semantics */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm font-mono">
                        <span className="text-gray-300">Semantic Embedding Similarity</span>
                        <span className="text-cyan-400 font-bold">{selectedCandidate.confidence_pct}%</span>
                      </div>
                      <div className="h-2 bg-[#1c1c2b] rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-500" style={{width: `${selectedCandidate.confidence_pct}%`}}></div>
                      </div>
                    </div>

                    {/* Syntax */}
                    <div className="space-y-1 mt-4">
                      <div className="flex justify-between text-sm font-mono">
                        <span className="text-gray-300">Syntax Match (Sentence Delta: &plusmn;{selectedCandidate.evidence?.sentence_length_delta} wds)</span>
                        <span className="text-emerald-400 font-bold">{Math.max(10, 100 - (selectedCandidate.evidence?.sentence_length_delta * 10)).toFixed(0)}%</span>
                      </div>
                      <div className="h-2 bg-[#1c1c2b] rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{width: `${Math.max(10, 100 - (selectedCandidate.evidence?.sentence_length_delta * 10))}%`}}></div>
                      </div>
                    </div>

                    {/* Punctuation */}
                    <div className="space-y-1 mt-4">
                      <div className="flex justify-between text-sm font-mono">
                        <span className="text-gray-300">Punctuation Profile Overlap</span>
                        <span className="text-purple-400 font-bold">{((selectedCandidate.evidence?.punctuation_similarity || 0) * 100).toFixed(0)}%</span>
                      </div>
                      <div className="h-2 bg-[#1c1c2b] rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500" style={{width: `${(selectedCandidate.evidence?.punctuation_similarity || 0) * 100}%`}}></div>
                      </div>
                    </div>
                  </div>

                  {/* Vocabulary */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-mono border-b border-[#1e1e2f] pb-2 mb-3">Shared Vocabulary (N-Grams)</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedCandidate.evidence?.shared_phrases?.map((p, i) => (
                        <span key={i} className="px-3 py-1.5 bg-[#161726] border border-[#282942] rounded-lg text-sm text-gray-200 font-mono">"{p}"</span>
                      ))}
                      {(!selectedCandidate.evidence?.shared_phrases || selectedCandidate.evidence.shared_phrases.length === 0) && (
                        <span className="text-sm text-gray-500 italic">No significant overlap detected.</span>
                      )}
                    </div>
                  </div>

                  {/* Temporal Behavior Component */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-mono border-b border-[#1e1e2f] pb-2 mb-3">Temporal Evolution Timeline</h4>
                    <TemporalTimeline 
                      targetPosts={aliasDetail?.posts}
                      candidatePosts={selectedCandidate.detail?.posts}
                      targetId={selectedAliasId}
                      candidateId={selectedCandidate.target_alias_id}
                    />
                  </div>

                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500 font-mono">
                  Select a candidate from STEP 2 to compare evidence.
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Report Modal */}
      <AnimatePresence>
        {reportGenerated && selectedCandidate && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-10"
          >
            <div className="bg-[#0f1019] border border-cyan-500/50 rounded-2xl w-full max-w-3xl max-h-full flex flex-col shadow-[0_0_40px_rgba(6,182,212,0.15)] overflow-hidden" id="report-content">
              <div className="p-6 border-b border-[#1e1e2f] flex justify-between items-center bg-[#151624]">
                <h2 className="text-xl font-bold text-white font-mono flex items-center gap-2">
                  <FileText className="w-6 h-6 text-cyan-400" />
                  INTELLIGENCE REPORT
                </h2>
                <button onClick={() => setReportGenerated(false)} data-html2canvas-ignore className="text-gray-400 hover:text-white">Close</button>
              </div>
              <div className="p-8 overflow-y-auto font-mono text-sm space-y-6 text-gray-300">
                <div className="flex justify-between text-xs text-gray-500 border-b border-[#1e1e2f] pb-4">
                  <span>CASE ID: AEG-{new Date().getFullYear()}-{Math.floor(Math.random()*10000).toString().padStart(4, '0')}</span>
                  <span>DATE: {new Date().toISOString().split('T')[0]}</span>
                </div>
                
                <div>
                  <h3 className="text-cyan-400 font-bold text-lg mb-2">ASSESSMENT:</h3>
                  <div className={`p-4 rounded-lg font-bold text-lg border ${selectedCandidate.confidence_pct >= 80 ? 'bg-emerald-950/30 border-emerald-500/50 text-emerald-400' : selectedCandidate.confidence_pct >= 65 ? 'bg-amber-950/30 border-amber-500/50 text-amber-400' : 'bg-rose-950/30 border-rose-500/50 text-rose-400'}`}>
                    {selectedCandidate.confidence_label?.toUpperCase() || (selectedCandidate.confidence_pct >= 80 ? 'HIGH-CONFIDENCE POTENTIAL LINK' : selectedCandidate.confidence_pct >= 65 ? 'PROBABLE LINK' : 'WEAK LINK')}
                  </div>
                </div>

                <div>
                  <h3 className="text-cyan-400 font-bold mb-2">SUBJECTS:</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Target: <strong>{selectedAliasId}</strong> (@{aliasDetail?.username})</li>
                    <li>Candidate: <strong>{selectedCandidate.target_alias_id}</strong> (@{selectedCandidate.target_username})</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-cyan-400 font-bold mb-2">CONFIDENCE SCORE:</h3>
                  <p className="text-2xl text-white font-bold">{selectedCandidate.confidence_pct}%</p>
                </div>

                <div>
                  <h3 className="text-cyan-400 font-bold mb-2">SUPPORTING EVIDENCE:</h3>
                  <p className="mb-2">A stylometric analysis engine evaluated the historical text corpora of the two subjects. The system observed the following behavioral and linguistic overlaps:</p>
                  <ul className="list-disc pl-5 space-y-2">
                    <li><strong>Shared Vocabulary:</strong> The subjects utilize unique lexical collocations including: {selectedCandidate.evidence?.shared_phrases?.join(', ')}.</li>
                    <li><strong>Syntactic Fingerprint:</strong> The sentence length variance is highly correlated with a delta of &plusmn;{selectedCandidate.evidence?.sentence_length_delta} words.</li>
                    <li><strong>Punctuation Profile:</strong> A {((selectedCandidate.evidence?.punctuation_similarity || 0) * 100).toFixed(1)}% match in punctuation distributions indicates shared subconscious typing habits.</li>
                    <li><strong>Temporal Evolution:</strong> Timeline analysis indicates {
                      (()=>{
                        const t1 = aliasDetail?.posts?.map(p=>new Date(p.timestamp).getTime()) || [];
                        const c1 = selectedCandidate.detail?.posts?.map(p=>new Date(p.timestamp).getTime()) || [];
                        const minT = Math.min(...t1), maxT = Math.max(...t1);
                        const minC = Math.min(...c1), maxC = Math.max(...c1);
                        if (Math.max(minT, minC) <= Math.min(maxT, maxC)) return 'a period of concurrent alias operation.';
                        return 'a sequential transition between aliases with no overlap.';
                      })()
                    }</li>
                  </ul>
                </div>

                <div className="pt-4 border-t border-[#1e1e2f]">
                  <h3 className="text-cyan-400 font-bold mb-2">ANALYST ACTION:</h3>
                  <p className="bg-[#161726] p-3 border border-[#282942] rounded-lg text-amber-400 font-bold">
                    REVIEW REQUIRED. Requesting subpoena for associated IP logs to confirm attribution.
                  </p>
                </div>
                
                <div className="flex justify-end pt-4" data-html2canvas-ignore>
                  <button onClick={handleExportPDF} className="flex items-center gap-2 px-4 py-2 bg-[#1a1b2e] hover:bg-[#23243a] border border-[#2e2f4a] rounded-lg text-white font-bold transition-colors">
                    <Download className="w-4 h-4" /> Export PDF
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
