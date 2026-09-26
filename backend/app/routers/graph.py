from typing import Dict, List
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
import app.main as main_app
import re
from datetime import datetime

router = APIRouter()


@router.get("/heatmap")
def get_heatmap():
    """
    Returns the full NxN pairwise similarity matrix for all active aliases,
    along with alias metadata (id, username, platform) for axis labels.
    Used by the Similarity Score Heatmap visualisation on the frontend.
    """
    state = main_app.state

    # Ordered list of active alias ids (matrix order preserved)
    active_ids = [aid for aid in state.alias_ids if aid in state.active_alias_ids]

    labels = []
    for aid in active_ids:
        alias = state.aliases_dict.get(aid, {})
        labels.append({
            "id": aid,
            "username": alias.get("username", aid),
            "platform": alias.get("platform", ""),
        })

    # Build NxN submatrix for active aliases only
    full_matrix = state.matrix
    aid_to_idx = state.alias_id_to_idx

    matrix = []
    for row_id in active_ids:
        row = []
        ri = aid_to_idx[row_id]
        for col_id in active_ids:
            ci = aid_to_idx[col_id]
            row.append(round(full_matrix[ri][ci], 4))
        matrix.append(row)

    return {
        "labels": labels,
        "matrix": matrix,
    }


def compute_connected_components(active_aids: List[str], matrix: List[List[float]], aid_to_idx: Dict[str, int], threshold: float):
    """
    Compute connected components for the active aliases given threshold.
    Returns:
      cluster_map: Dict[alias_id, int] (cluster index 1..K)
      clusters: List[Dict] with cluster_id, aliases, avg_confidence
    """
    n = len(active_aids)
    visited = set()
    clusters = []
    cluster_map = {}

    def get_score(aid1, aid2):
        i = aid_to_idx[aid1]
        j = aid_to_idx[aid2]
        return matrix[i][j]

    cluster_counter = 1
    for aid in active_aids:
        if aid not in visited:
            # BFS / DFS
            queue = [aid]
            visited.add(aid)
            comp = []
            
            while queue:
                curr = queue.pop(0)
                comp.append(curr)
                for other in active_aids:
                    if other not in visited and curr != other:
                        if get_score(curr, other) >= threshold:
                            visited.add(other)
                            queue.append(other)
            
            # Compute average confidence (intra-cluster similarity)
            pair_scores = []
            for i in range(len(comp)):
                for j in range(i + 1, len(comp)):
                    pair_scores.append(get_score(comp[i], comp[j]))
            
            if len(comp) > 1 and pair_scores:
                avg_conf = round(float(sum(pair_scores) / len(pair_scores)), 4)
                conf_pct = round(avg_conf * 100, 1)
            else:
                avg_conf = None
                conf_pct = None
            
            cluster_id = f"Cluster-{cluster_counter}"
            for member in comp:
                cluster_map[member] = cluster_id

            clusters.append({
                "cluster_id": cluster_id,
                "alias_count": len(comp),
                "aliases": comp,
                "confidence": avg_conf,
                "confidence_pct": conf_pct
            })
            cluster_counter += 1

    return cluster_map, clusters


@router.get("/graph")
def get_graph(threshold: float = Query(0.62, ge=0.0, le=1.0)):
    """
    Returns nodes and edges filtered by similarity threshold.
    Threshold slider hits this endpoint. Zero live ML inference — purely matrix filtering.
    """
    state = main_app.state
    active_aids = sorted(list(state.active_alias_ids))
    
    cluster_map, clusters = compute_connected_components(
        active_aids, state.matrix, state.alias_id_to_idx, threshold
    )

    # Build nodes list
    nodes = []
    for aid in active_aids:
        alias = state.aliases_dict[aid]
        nodes.append({
            "id": aid,
            "alias_id": aid,
            "username": alias["username"],
            "platform": alias["platform"],
            "post_count": len(alias.get("posts", [])),
            "cluster_id": cluster_map.get(aid, "Unassigned"),
        })

    # Build edges list filtered by threshold
    edges = []
    for i in range(len(active_aids)):
        aid1 = active_aids[i]
        idx1 = state.alias_id_to_idx[aid1]
        for j in range(i + 1, len(active_aids)):
            aid2 = active_aids[j]
            idx2 = state.alias_id_to_idx[aid2]
            score = state.matrix[idx1][idx2]
            if score >= threshold:
                key = f"{aid1}-{aid2}"
                ev = state.evidence_dict.get(key, {})
                edges.append({
                    "source": aid1,
                    "target": aid2,
                    "score": round(score, 4),
                    "evidence": ev
                })

    return {
        "threshold": threshold,
        "nodes": nodes,
        "edges": edges,
        "clusters": clusters,
    }


@router.get("/resolve/{alias_id}")
def resolve_alias(alias_id: str, threshold: float = Query(0.62, ge=0.0, le=1.0), compare_all: bool = False):
    """
    Resolve which cluster an alias resolves into + confidence + evidence per connected alias.
    """
    state = main_app.state
    if alias_id not in state.aliases_dict:
        raise HTTPException(status_code=404, detail=f"Alias '{alias_id}' not found")

    if compare_all:
        active_aids = list(state.aliases_dict.keys())
    else:
        active_aids = sorted(list(state.active_alias_ids))
        if alias_id not in active_aids:
            active_aids.append(alias_id)

    cluster_map, clusters = compute_connected_components(
        active_aids, state.matrix, state.alias_id_to_idx, threshold
    )

    my_cluster_id = cluster_map.get(alias_id, "Cluster-1")
    my_cluster = next((c for c in clusters if c["cluster_id"] == my_cluster_id), None)

    # Gather pairwise connections & evidence with aliases in the same cluster or across active set
    matches = []
    idx1 = state.alias_id_to_idx[alias_id]
    for other_aid in active_aids:
        if other_aid == alias_id:
            continue
        idx2 = state.alias_id_to_idx[other_aid]
        score = state.matrix[idx1][idx2]
        key = f"{alias_id}-{other_aid}"
        ev = state.evidence_dict.get(key, state.evidence_dict.get(f"{other_aid}-{alias_id}", {}))
        
        conf_pct = round(score * 100)
        if conf_pct < 40:
            confidence_label = "Weak"
        elif conf_pct < 65:
            confidence_label = "Possible"
        elif conf_pct < 80:
            confidence_label = "Probable"
        else:
            confidence_label = "High-confidence linkage"
            
        matches.append({
            "target_alias_id": other_aid,
            "target_username": state.aliases_dict[other_aid]["username"],
            "target_platform": state.aliases_dict[other_aid]["platform"],
            "score": round(score, 4),
            "confidence_pct": conf_pct,
            "confidence_label": confidence_label,
            "is_above_threshold": score >= threshold,
            "evidence": ev
        })

    # Sort matches by similarity score descending
    matches.sort(key=lambda x: -x["score"])

    return {
        "alias_id": alias_id,
        "username": state.aliases_dict[alias_id]["username"],
        "platform": state.aliases_dict[alias_id]["platform"],
        "threshold": threshold,
        "cluster_id": my_cluster_id,
        "cluster_summary": my_cluster,
        "matches": matches
    }


def extract_words(text: str) -> set:
    words = re.findall(r"[a-z0-9']+", text.lower())
    return set(words)
@router.get("/explain/{alias_a}/{alias_b}")
def explain_link(alias_a: str, alias_b: str):
    """
    Detailed forensic explanation of why two aliases are linked.
    Reads precomputed multi-signal scores directly from the edge evidence payload
    so signals are guaranteed to match the composite score driving graph clustering.
    """
    state = main_app.state
    if alias_a not in state.aliases_dict or alias_b not in state.aliases_dict:
        raise HTTPException(status_code=404, detail="Alias not found")

    dict_a = state.aliases_dict[alias_a]
    dict_b = state.aliases_dict[alias_b]

    idx_a = state.alias_id_to_idx[alias_a]
    idx_b = state.alias_id_to_idx[alias_b]

    # Overall composite score from the precomputed matrix
    score = state.matrix[idx_a][idx_b]

    # Retrieve precomputed evidence (includes signal breakdowns)
    key = f"{alias_a}-{alias_b}"
    ev  = state.evidence_dict.get(key, state.evidence_dict.get(f"{alias_b}-{alias_a}", {}))

    # Read precomputed signal scores — single source of truth matching composite matrix
    signals_raw = ev.get("signals", {})
    sem_score   = signals_raw.get("semantic",  score)   # fallback to composite if not present
    lex_score   = signals_raw.get("lexical",   0.0)
    syn_score   = signals_raw.get("syntactic", 0.0)
    tmp_score   = signals_raw.get("temporal",  0.0)

    # Confidence Classification
    conf_pct = round(score * 100)
    if conf_pct < 40:
        classification = "Weak Link"
    elif conf_pct < 65:
        classification = "Possible Link"
    elif conf_pct < 80:
        classification = "Probable Link"
    else:
        classification = "HIGH-CONFIDENCE POTENTIAL LINK"

    # Generate human-readable supporting / contradictory evidence from precomputed signals
    supporting   = []
    contradictory = []

    if sem_score >= 0.70:
        supporting.append("Strong semantic similarity across their posts.")
    elif sem_score < 0.50:
        contradictory.append("Low underlying semantic alignment.")

    if lex_score >= 0.65:
        supporting.append("Both aliases frequently use similar lexical patterns and distinctive n-grams.")
    elif lex_score < 0.40:
        contradictory.append("Significant vocabulary differences detected.")

    if syn_score >= 0.75:
        supporting.append("Sentence-length distributions and punctuation profiles are highly correlated.")
    elif syn_score < 0.50:
        contradictory.append(f"Large sentence-length or punctuation variance (delta: {ev.get('sentence_length_delta', '?')} words).")

    if tmp_score >= 0.60:
        supporting.append("The aliases demonstrate overlapping temporal activity periods (UTC hour patterns).")
    elif tmp_score < 0.20:
        contradictory.append("Low temporal correlation — active windows do not significantly overlap.")

    if not contradictory:
        contradictory.append("No significant contradictory evidence detected.")

    shared_patterns = ev.get("shared_phrases", [])
    if shared_patterns and shared_patterns[0] == "no significant lexical overlap":
        shared_patterns = []

    # Pairwise stats (computed live — lightweight)
    corpus_a = " ".join(p["text"] for p in dict_a.get("posts", []))
    corpus_b = " ".join(p["text"] for p in dict_b.get("posts", []))

    def get_times(posts):
        times = []
        for p in posts:
            try:
                times.append(datetime.fromisoformat(p["timestamp"].replace("Z", "+00:00")).timestamp())
            except:
                pass
        return times

    def active_window(times):
        if not times: return "N/A"
        hours = [datetime.fromtimestamp(t).hour for t in times]
        return f"{min(hours):02d}–{max(hours):02d} UTC"

    def avg_sentence_length(text):
        import re as _re
        sentences = [s.strip() for s in _re.split(r'[.!?]+', text) if s.strip()]
        if not sentences: return 0.0
        return round(sum(len(s.split()) for s in sentences) / len(sentences), 1)

    times_a = get_times(dict_a.get("posts", []))
    times_b = get_times(dict_b.get("posts", []))

    stats_a = {
        "avg_sentence_length": avg_sentence_length(corpus_a),
        "post_count":          len(dict_a.get("posts", [])),
        "active_window":       active_window(times_a),
    }
    stats_b = {
        "avg_sentence_length": avg_sentence_length(corpus_b),
        "post_count":          len(dict_b.get("posts", [])),
        "active_window":       active_window(times_b),
    }

    return {
        "alias_a":            alias_a,
        "alias_b":            alias_b,
        "username_a":         dict_a.get("username", ""),
        "username_b":         dict_b.get("username", ""),
        "overall_confidence": round(score, 4),
        "classification":     classification,
        "signals": {
            "semantic":   round(sem_score, 4),
            "lexical":    round(lex_score, 4),
            "syntactic":  round(syn_score, 4),
            "temporal":   round(tmp_score, 4),
        },
        "supporting_evidence":   supporting,
        "contradictory_evidence": contradictory,
        "shared_patterns":       shared_patterns,
        "pairwise_stats": {
            "Alias A": stats_a,
            "Alias B": stats_b,
        },
        "weights": ev.get("signals", {}),  # expose raw signals for reference
        "summary": (
            f"AEGIS composite score: {conf_pct}% ({classification}). "
            f"Driven by: {', '.join(ev.get('top_score_drivers', ['semantic embedding']))}. "
            "Assessment: Further analyst verification recommended."
        ),
    }



