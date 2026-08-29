import { findBestMatch } from "./fuzzy.js";

/**
 * Master Dictionary of Canonical Terms and Synonyms / Aliases
 */
export const CANONICAL_DOMAINS: Record<string, string[]> = {
  gaming: [
    "game", "games", "gamedev", "game-dev", "game-development", "gamming", 
    "roblox", "luau", "lua", "studio", "rbx", "roblox-studio",
    "unity", "unity3d", "unreal", "ue5", "ue4", "godot", "gdscript", 
    "gameplay", "3dsmax", "blender", "threejs", "game-engine"
  ],
  finance: ["financial", "fintech", "banking", "trading", "investment", "accounting", "crypto", "defi", "stock"],
  healthcare: ["health", "medical", "biomedical", "medicine", "clinic", "hospital", "pharma"],
  ecommerce: ["e-commerce", "shop", "shopping", "retail", "store", "shopify", "marketplace"],
  education: ["edtech", "learning", "teaching", "school", "course", "quiz", "academic", "university"],
  social: ["community", "chat", "messaging", "social-media", "discord", "twitter", "x"],
  robotics: ["iot", "hardware", "arduino", "firmware", "embedded", "plc", "automation"],
  architecture: ["building", "cad", "bim", "3d", "rendering", "interior", "solidworks"],
};

export const CANONICAL_CATEGORIES: Record<string, string[]> = {
  frontend: ["front-end", "ui", "ux", "web-frontend", "client-side", "react", "vue", "angular", "nextjs", "css", "html", "vite", "tailwind"],
  backend: ["back-end", "server", "server-side", "api", "rest", "graphql", "microservices", "nestjs", "express", "django", "springboot", "fastapi"],
  database: ["databases", "db", "sql", "rdbms", "nosql", "postgres", "postgresql", "mysql", "mongodb", "redis", "orm", "typeorm", "prisma"],
  devops: ["dev-ops", "infra", "infrastructure", "ci-cd", "cicd", "cloud", "docker", "kubernetes", "k8s", "aws", "gcp", "azure", "terraform"],
  "ai-ml": ["ai", "ml", "machine-learning", "deep-learning", "llm", "rag", "nlp", "prompts", "prompting", "agent", "agents", "langchain"],
  testing: ["tests", "test", "qa", "quality-assurance", "e2e", "unit-testing", "playwright", "cypress", "jest", "vitest", "tdd"],
  security: ["sec", "cybersecurity", "auth", "authentication", "pentest", "vulnerability", "audit"],
  architecture: ["system-design", "patterns", "best-practices", "clean-code", "refactoring"],
  mobile: ["app", "ios", "android", "swift", "swiftui", "kotlin", "flutter", "react-native"],
  general: ["misc", "common", "generic"],
};

export const CANONICAL_OCCUPATIONS: Record<string, string[]> = {
  "game-developer": ["game-dev", "gamedev", "unity-developer", "unreal-developer", "game-programmer", "roblox-developer"],
  "frontend-developer": ["frontend-dev", "ui-developer", "web-developer", "react-developer"],
  "backend-developer": ["backend-dev", "api-developer", "server-engineer"],
  "fullstack-developer": ["fullstack-dev", "full-stack", "web-engineer"],
  "devops-engineer": ["devops-dev", "sre", "cloud-architect", "platform-engineer", "infra-engineer"],
  "data-scientist": ["ml-engineer", "ai-engineer", "data-analyst", "ai-researcher"],
  "qa-engineer": ["qa", "tester", "test-engineer", "sdet", "automation-tester"],
  "security-engineer": ["security-analyst", "pentester", "appsec"],
  "architect": ["software-architect", "system-architect", "tech-lead"],
  "designer": ["ui-designer", "ux-designer", "product-designer"],
};

export const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "in", "on", "at", "to", "for", "of", "with", 
  "by", "from", "is", "are", "system", "module", "script", "server", "client", 
  "guide", "pattern", "patterns", "workflow", "file", "files", "build", "create", 
  "authoritative", "tool", "tools", "help", "use", "when"
]);

/**
 * Tokenizes text by hyphens, underscores, dots, and camelCase.
 */
export function tokenizeText(text: string): string[] {
  if (!text) return [];
  // Split camelCase and all non-alphanumeric delimiters
  const separated = text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ");
  return separated.toLowerCase().trim().split(/\s+/).filter(t => t.length > 0);
}

/**
 * Builds a reverse lookup map for rapid O(1) canonical resolution.
 */
function buildReverseMap(dict: Record<string, string[]>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(dict)) {
    map.set(canonical.toLowerCase(), canonical.toLowerCase());
    for (const alias of aliases) {
      map.set(alias.toLowerCase(), canonical.toLowerCase());
    }
  }
  return map;
}

const DOMAIN_MAP = buildReverseMap(CANONICAL_DOMAINS);
const CATEGORY_MAP = buildReverseMap(CANONICAL_CATEGORIES);
const OCCUPATION_MAP = buildReverseMap(CANONICAL_OCCUPATIONS);

export function isNonInitKeyword(val: string): boolean {
  if (!val) return false;
  const clean = val.toLowerCase().trim();
  return clean === "noninit" || clean === "uninitialized" || clean === "unclassified" || clean === "uncategorized";
}

/**
 * Normalizes a specific technical tag without coercing it into a domain/category.
 */
export function normalizeTag(rawTag: string): string {
  if (!rawTag) return "";
  return rawTag
    .toLowerCase()
    .trim()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/**
 * Normalizes category/domain/occupation input to its canonical form.
 */
export function normalizeCanonicalTerm(
  rawInput: string, 
  type?: "domain" | "category" | "occupation"
): string {
  if (!rawInput) return "";
  
  if (isNonInitKeyword(rawInput)) {
    return "noninit";
  }
  
  // 1. Basic cleaning: lowercase, replace whitespace/underscores with hyphens
  let term = rawInput
    .toLowerCase()
    .trim()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  if (!term) return "";

  // 2. Direct map lookup based on type
  if (type === "domain" && DOMAIN_MAP.has(term)) return DOMAIN_MAP.get(term)!;
  if (type === "category" && CATEGORY_MAP.has(term)) return CATEGORY_MAP.get(term)!;
  if (type === "occupation" && OCCUPATION_MAP.has(term)) return OCCUPATION_MAP.get(term)!;

  if (type) {
    // If type is specified, fuzzy match only within that type
    let candidates: string[] = [];
    if (type === "domain") candidates = Object.keys(CANONICAL_DOMAINS);
    else if (type === "category") candidates = Object.keys(CANONICAL_CATEGORIES);
    else if (type === "occupation") candidates = Object.keys(CANONICAL_OCCUPATIONS);
    const best = findBestMatch(term, candidates, 0.75);
    if (best) return best.match;
  }

  // If no type specified or no match, return the cleanly formatted term as-is
  return term;
}

/**
 * Expands a search query into primary terms and secondary synonym terms.
 */
export function expandSearchQueryWithWeights(query: string): { primaryTerms: string[]; expandedSynonyms: string[] } {
  const terms = query.toLowerCase().trim().split(/[\s,]+/).filter(t => t.length > 0);
  const primaryTerms = Array.from(new Set(terms));
  const synonymsSet = new Set<string>();

  for (const t of primaryTerms) {
    // Look up canonical domain aliases
    const canonicalDom = DOMAIN_MAP.get(t);
    if (canonicalDom && CANONICAL_DOMAINS[canonicalDom]) {
      if (canonicalDom !== t && canonicalDom.length > 1) synonymsSet.add(canonicalDom);
      CANONICAL_DOMAINS[canonicalDom].forEach(a => {
        if (a !== t && a.length > 1) synonymsSet.add(a);
      });
    }

    // Look up canonical category aliases
    const canonicalCat = CATEGORY_MAP.get(t);
    if (canonicalCat && CANONICAL_CATEGORIES[canonicalCat]) {
      if (canonicalCat !== t && canonicalCat.length > 1) synonymsSet.add(canonicalCat);
      CANONICAL_CATEGORIES[canonicalCat].forEach(a => {
        if (a !== t && a.length > 1) synonymsSet.add(a);
      });
    }

    // Look up canonical occupation aliases
    const canonicalOcc = OCCUPATION_MAP.get(t);
    if (canonicalOcc && CANONICAL_OCCUPATIONS[canonicalOcc]) {
      if (canonicalOcc !== t && canonicalOcc.length > 1) synonymsSet.add(canonicalOcc);
      CANONICAL_OCCUPATIONS[canonicalOcc].forEach(a => {
        if (a !== t && a.length > 1) synonymsSet.add(a);
      });
    }
  }

  // Remove any primary term from synonyms
  primaryTerms.forEach(p => synonymsSet.delete(p));

  return {
    primaryTerms,
    expandedSynonyms: Array.from(synonymsSet),
  };
}

export function expandSearchQuery(query: string): string[] {
  const { primaryTerms, expandedSynonyms } = expandSearchQueryWithWeights(query);
  return [...primaryTerms, ...expandedSynonyms];
}
