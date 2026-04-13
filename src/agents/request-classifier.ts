export type RequestClassification =
  | "provided_context_only"
  | "stable_general_knowledge"
  | "external_current_state_required"
  | "tool_required_non_current";

export type RequestClassificationResult = {
  classification: RequestClassification;
  reason: string;
  hasMixedIntentSignal: boolean;
};

const TIME_INDICATOR =
  "\\b(current|current state|latest|most recent|recent|recently|right now|today|tonight|now|as of|this week|this month|current-day|real time)\\b";
const STATUS_INDICATOR =
  "\\b(status|state|health|availability|deployment|deployed|running|online|ready|connected|available|reachable|operational|up|live|incident|outage|service)\\b";
const NEWS_INDICATOR =
  "\\b(news|newsfeed|headlines|updates|weather|price|prices|stock|stocks|market|markets|score|scores|earnings|revenue|results|developments|announcements)\\b";
const OFFICEHOLDER_INDICATOR =
  "\\b(president|prime minister|chancellor|governor|mayor|leader|ceo|chief executive|speaker|chair|commissioner|minister|head of state)\\b";
const SOURCE_ACTION =
  "\\b(check|review|triage|scan|fetch|read|open|list|find|pull|retrieve|show|display|inspect|probe|validate|verify)\\b";
const SOURCE_CONTEXT =
  "\\b(email|gmail|inbox|mailbox|calendar|drive|document|doc|message|slack|quinn|notes|ticket|issue|thread|conversation)\\b";
const QUOTE_PATTERN = /(["'])(?:\\.|(?!\1)[\s\S])*\1/g;
const ADDITIONAL_SUMMARY_KEYWORDS =
  "\\b(email|transcript|notes?|conversation|document|report|discussion|meeting|minut(es?)?)\\b";

function removeQuotedSegments(text: string): string {
  return text.replace(QUOTE_PATTERN, " ");
}

const EXTERNAL_RULES: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: new RegExp(`${SOURCE_ACTION}.*${SOURCE_CONTEXT}`),
    reason: "source-specific live data request",
  },
  {
    pattern: new RegExp(
      "\\b(still|currently|as of|right now|today)\\b.*\\b(work|working|employ(ed|ment)?|serve|remain|stay)\\b",
    ),
    reason: "current employment status inquiry",
  },
  {
    pattern: new RegExp(
      `${TIME_INDICATOR}.*${STATUS_INDICATOR}|${STATUS_INDICATOR}.*${TIME_INDICATOR}`,
    ),
    reason: "time-sensitive status/state inquiry",
  },
  {
    pattern: new RegExp(
      `${TIME_INDICATOR}.*${NEWS_INDICATOR}|${NEWS_INDICATOR}.*${TIME_INDICATOR}`,
    ),
    reason: "latest news/market update",
  },
  {
    pattern: new RegExp(
      `${TIME_INDICATOR}.*${OFFICEHOLDER_INDICATOR}|${OFFICEHOLDER_INDICATOR}.*${TIME_INDICATOR}`,
    ),
    reason: "current officeholder inquiry",
  },
  {
    pattern: new RegExp(
      "\\b(current|latest|most recent|newest|right now|as of|recently)\\b.*\\bfact\\b",
    ),
    reason: "latest fact request",
  },
  {
    pattern: new RegExp(
      "\\bverify\\b.*\\b(current|latest|right now|live)\\b.*\\b(status|state|availability|health)\\b",
    ),
    reason: "explicit verification of current status",
  },
];

const PROVIDED_CONTEXT_RULES: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\bsummarize\b.*\btranscript\b|\btranscript\b.*\bsummarize\b/,
    reason: "transcript summary request",
  },
  {
    pattern: /\brewrite\b.*\bemail\b|\bemail\b.*\brewrite\b/,
    reason: "email rewrite request",
  },
  {
    pattern: /\bdraft\b.*\b(email|message|reply|note)\b/,
    reason: "email draft request",
  },
  {
    pattern: new RegExp(
      `\\bsummarize\\b.*${ADDITIONAL_SUMMARY_KEYWORDS}|${ADDITIONAL_SUMMARY_KEYWORDS}.*\\bsummarize\\b`,
    ),
    reason: "content summarization request",
  },
  {
    pattern: /\banalyze\b.*\b(code|snippet|function|method|file)\b/,
    reason: "code analysis",
  },
  {
    pattern: /\breview\b.*\b(code|diff|pull request|patch)\b/,
    reason: "code review",
  },
  {
    pattern: /\btranscript\b|\bminutes\b|\bnotes\b|\bdocument\b/,
    reason: "document context reasoning",
  },
  {
    pattern: /\bproofread\b|\bparaphrase\b|\bparaphrases\b|\bparaphrasing\b/,
    reason: "editing/proofreading",
  },
  {
    pattern: /\binternal state\b/,
    reason: "internal state analysis",
  },
  {
    pattern: /\breasoning\b.*\bfrom\b.*\b(provided|attached|above|below|following)\b/,
    reason: "reasoning from provided context",
  },
];

const TOOL_RULES: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern:
      /\b(repo|repository|codebase|workspace|project)\b.*\b(structure|tree|layout|modules|packages|files)\b/,
    reason: "repo structure overview",
  },
  {
    pattern: /\blist\b.*\b(files|directories|folders|modules|packages)\b/,
    reason: "file/directory listing",
  },
  {
    pattern: /\b(directory|folder|filesystem)\b.*\b(structure|tree)\b/,
    reason: "directory structure analysis",
  },
];

export function classifyRequest(params: { prompt?: string | null }): RequestClassificationResult {
  const prompt = params.prompt?.trim() ?? "";
  if (!prompt) {
    return {
      classification: "stable_general_knowledge",
      reason: "empty prompt defaults to stable knowledge",
      hasMixedIntentSignal: false,
    };
  }
  const normalized = prompt.toLowerCase();
  const sanitizedForExternal = removeQuotedSegments(normalized).replace(/\s+/g, " ").trim();
  const externalSignal = sanitizedForExternal || normalized;
  const providedMatches = PROVIDED_CONTEXT_RULES.map((rule) => ({
    rule,
    matches: rule.pattern.test(normalized),
  }));
  const externalMatches = EXTERNAL_RULES.map((rule) => ({
    rule,
    matches: rule.pattern.test(externalSignal),
  }));
  const hasProvidedContextSignal = providedMatches.some((entry) => entry.matches);
  const hasExternalSignal = externalMatches.some((entry) => entry.matches);
  const hasMixedIntentSignal = hasProvidedContextSignal && hasExternalSignal;

  for (const match of externalMatches) {
    if (match.matches) {
      return {
        classification: "external_current_state_required",
        reason: match.rule.reason,
        hasMixedIntentSignal,
      };
    }
  }

  for (const match of providedMatches) {
    if (match.matches) {
      return {
        classification: "provided_context_only",
        reason: match.rule.reason,
        hasMixedIntentSignal,
      };
    }
  }

  for (const rule of TOOL_RULES) {
    if (rule.pattern.test(normalized)) {
      return {
        classification: "tool_required_non_current",
        reason: rule.reason,
        hasMixedIntentSignal,
      };
    }
  }

  return {
    classification: "stable_general_knowledge",
    reason: "general knowledge fallback",
    hasMixedIntentSignal,
  };
}
