/**
 * High-performance Fuzzy String Matching and Similarity Utilities
 * Zero dependencies, optimized for fast taxonomy lookup and query tolerance.
 */

/**
 * Calculates the Levenshtein distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  const v0 = new Array(s2.length + 1);
  const v1 = new Array(s2.length + 1);

  for (let i = 0; i <= s2.length; i++) {
    v0[i] = i;
  }

  for (let i = 0; i < s1.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < s2.length; j++) {
      const cost = s1[i] === s2[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= s2.length; j++) {
      v0[j] = v1[j];
    }
  }

  return v1[s2.length];
}

/**
 * Calculates string similarity between 0.0 (completely different) and 1.0 (exact match).
 */
export function stringSimilarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;
  
  // Fast substring check
  if (s1.includes(s2) || s2.includes(s1)) {
    return Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length);
  }

  const distance = levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  return Math.max(0, (maxLen - distance) / maxLen);
}

/**
 * Checks if query fuzzy matches target with a given similarity threshold.
 */
export function isFuzzyMatch(query: string, target: string, threshold = 0.72): boolean {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase().trim();
  if (t.includes(q)) return true;
  return stringSimilarity(q, t) >= threshold;
}

/**
 * Finds the closest matching candidate from a list.
 */
export function findBestMatch(query: string, candidates: string[], threshold = 0.72): { match: string; score: number } | null {
  const q = query.toLowerCase().trim();
  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const c = candidate.toLowerCase().trim();
    if (c === q) return { match: candidate, score: 1.0 };
    
    const score = stringSimilarity(q, c);
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestMatch ? { match: bestMatch, score: bestScore } : null;
}
