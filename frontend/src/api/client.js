const BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

/**
 * Fetch graph nodes and edges at specified similarity threshold.
 */
export async function fetchGraph(threshold = 0.55) {
  const res = await fetch(`${BASE_URL}/graph?threshold=${threshold}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch graph: ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Fetch all aliases list.
 */
export async function fetchAliases(includeStaged = false) {
  const res = await fetch(`${BASE_URL}/aliases?include_staged=${includeStaged}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch aliases: ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Fetch full profile and post history for a single alias.
 */
export async function fetchAliasDetail(aliasId) {
  const res = await fetch(`${BASE_URL}/aliases/${aliasId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch alias detail for ${aliasId}: ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Resolve an alias into its cluster, intra-cluster confidence, and pairwise matches with evidence.
 */
export async function resolveAlias(aliasId, threshold = 0.55, compareAll = false) {
  const res = await fetch(`${BASE_URL}/resolve/${aliasId}?threshold=${threshold}&compare_all=${compareAll}`);
  if (!res.ok) {
    throw new Error(`Failed to resolve alias ${aliasId}: ${res.statusText}`);
  }
  return await res.json();
}


/**
 * Explain a pairwise link between two aliases in detail.
 */
export async function fetchExplanation(aliasA, aliasB) {
  const res = await fetch(`${BASE_URL}/explain/${aliasA}/${aliasB}`);
  if (!res.ok) {
    throw new Error(`Failed to explain link ${aliasA}-${aliasB}: ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Fetch the full NxN pairwise similarity matrix with alias labels.
 * Used by the SimilarityHeatmap component.
 */
export async function fetchHeatmap() {
  const res = await fetch(`${BASE_URL}/heatmap`);
  if (!res.ok) {
    throw new Error(`Failed to fetch heatmap: ${res.statusText}`);
  }
  return await res.json();
}
