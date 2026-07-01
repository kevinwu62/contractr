export type SelectionReferenceType = "section" | "article" | "schedule" | "exhibit";

export type SelectionReference = {
  referenceText: string;
  type: SelectionReferenceType;
};

export type SelectionDefinedTermCandidate = {
  term: string;
  source: "quoted term" | "capitalized phrase" | "repeated capitalized term";
};

export type SelectionKnownDefinedTerm = {
  term: string;
  detectedVariants?: string[];
  confidenceLabel?: string;
};

export type SelectionConfirmedDefinedTerm = {
  term: string;
  matchedText: string;
  confidenceLabel?: string;
};

export type SelectionContextOptions = {
  knownDefinedTerms?: SelectionKnownDefinedTerm[];
};

export type SelectionObligationSignal = {
  triggerText: string;
};

export type SelectionActionId =
  | "goToSectionOrArticle"
  | "openSectionOrArticleInSidebar"
  | "analyzeDefinedTerms"
  | "analyzeRelevantObligations"
  | "editWithAi";

export type SelectionAvailableAction = {
  id: SelectionActionId;
  label: string;
  status: "available" | "comingSoon" | "mockOnly";
  reason: string;
};

export type SelectionContext = {
  normalizedText: string;
  references: SelectionReference[];
  confirmedDefinedTerms: SelectionConfirmedDefinedTerm[];
  definedTermCandidates: SelectionDefinedTermCandidate[];
  obligationSignals: SelectionObligationSignal[];
  isClauseLike: boolean;
  availableActions: SelectionAvailableAction[];
};

const commonCapitalizedWords = new Set([
  "agreement",
  "article",
  "articles",
  "contractr",
  "current",
  "exhibit",
  "exhibits",
  "schedule",
  "schedules",
  "section",
  "sections",
]);

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addUniqueByKey<T>(items: T[], seen: Set<string>, key: string, item: T) {
  const normalizedKey = key.toLocaleLowerCase();

  if (seen.has(normalizedKey)) {
    return;
  }

  seen.add(normalizedKey);
  items.push(item);
}

function detectSelectionReferences(selectedText: string): SelectionReference[] {
  const references: SelectionReference[] = [];
  const seen = new Set<string>();
  const patterns: Array<{ pattern: RegExp; type: SelectionReferenceType }> = [
    { pattern: /\bSection\s+\d+(?:\.\d+)*(?:\([a-z0-9ivxlcdm]+\))*/gi, type: "section" },
    { pattern: /\bArticle\s+(?:[IVXLCDM]+|\d+(?:\.\d+)*)\b/gi, type: "article" },
    { pattern: /\bSchedule\s+[A-Z0-9]+(?:[-.][A-Z0-9]+)*\b/gi, type: "schedule" },
    { pattern: /\bExhibit\s+[A-Z0-9]+(?:[-.][A-Z0-9]+)*\b/gi, type: "exhibit" },
  ];

  for (const { pattern, type } of patterns) {
    for (const match of selectedText.matchAll(pattern)) {
      const referenceText = normalizeWhitespace(match[0]);
      addUniqueByKey(references, seen, `${type}:${referenceText}`, { referenceText, type });
    }
  }

  return references;
}

function isLikelyDefinedTerm(value: string) {
  const normalizedValue = normalizeWhitespace(value);

  if (normalizedValue.length < 2 || normalizedValue.length > 120) {
    return false;
  }

  if (!/[A-Za-z]/.test(normalizedValue)) {
    return false;
  }

  return !commonCapitalizedWords.has(normalizedValue.toLocaleLowerCase());
}

function normalizeCandidateTerm(term: string) {
  return normalizeWhitespace(term).replace(/^(A|An|Any|Each|The|This)\s+/, "");
}

function buildPhraseRegex(term: string) {
  const phrasePattern = normalizeWhitespace(term)
    .split(/\s+/)
    .map((termPart) => escapeRegExp(termPart))
    .join("\\s+");

  return new RegExp(phrasePattern, "g");
}

function isTermCharacter(value: string | undefined) {
  return Boolean(value && /[A-Za-z0-9]/.test(value));
}

function isStandaloneDefinedTermUsage(documentText: string, matchStart: number, matchEnd: number) {
  if (isTermCharacter(documentText[matchStart - 1]) || isTermCharacter(documentText[matchEnd])) {
    return false;
  }

  return true;
}

function isRangeInside(innerStart: number, innerEnd: number, outerStart: number, outerEnd: number) {
  return innerStart >= outerStart && innerEnd <= outerEnd && (innerStart > outerStart || innerEnd < outerEnd);
}

function detectConfirmedDefinedTerms(
  selectedText: string,
  knownDefinedTerms: SelectionKnownDefinedTerm[] = [],
): SelectionConfirmedDefinedTerm[] {
  type KnownTermMatch = {
    canonicalTerm: string;
    confidenceLabel?: string;
    matchedText: string;
    start: number;
    end: number;
  };

  const knownTermVariants = knownDefinedTerms
    .flatMap((definedTerm) =>
      [definedTerm.term, ...(definedTerm.detectedVariants ?? [])].map((variant) => ({
        canonicalTerm: definedTerm.term,
        variant: normalizeWhitespace(variant),
        confidenceLabel: definedTerm.confidenceLabel,
      })),
    )
    .filter((entry) => entry.variant)
    .sort((first, second) => second.variant.length - first.variant.length);
  const allMatches: KnownTermMatch[] = [];

  for (const entry of knownTermVariants) {
    const pattern = buildPhraseRegex(entry.variant);

    for (const match of selectedText.matchAll(pattern)) {
      const matchStart = match.index;
      const matchEnd = matchStart + match[0].length;

      if (!isStandaloneDefinedTermUsage(selectedText, matchStart, matchEnd)) {
        continue;
      }

      allMatches.push({
        canonicalTerm: entry.canonicalTerm,
        confidenceLabel: entry.confidenceLabel,
        matchedText: normalizeWhitespace(match[0]),
        start: matchStart,
        end: matchEnd,
      });
    }
  }

  const validMatches = allMatches.filter(
    (match) =>
      !allMatches.some(
        (possibleContainer) =>
          possibleContainer.canonicalTerm.toLocaleLowerCase() !== match.canonicalTerm.toLocaleLowerCase() &&
          possibleContainer.end - possibleContainer.start > match.end - match.start &&
          isRangeInside(match.start, match.end, possibleContainer.start, possibleContainer.end),
      ),
  );
  const matchesByTerm = new Map<string, KnownTermMatch>();

  for (const match of validMatches) {
    const termKey = match.canonicalTerm.toLocaleLowerCase();
    const existingMatch = matchesByTerm.get(termKey);

    if (!existingMatch || match.start < existingMatch.start) {
      matchesByTerm.set(termKey, match);
    }
  }

  return Array.from(matchesByTerm.values())
    .map((match) => ({
      term: match.canonicalTerm,
      matchedText: match.matchedText,
      confidenceLabel: match.confidenceLabel,
    }))
    .sort((first, second) => first.term.localeCompare(second.term));
}

function detectQuotedTermCandidates(selectedText: string) {
  const candidates: SelectionDefinedTermCandidate[] = [];
  const seen = new Set<string>();
  const quotedTermPattern = /["“]([^"”\n]{2,120})["”]/g;

  for (const match of selectedText.matchAll(quotedTermPattern)) {
    const term = normalizeWhitespace(match[1]);

    if (isLikelyDefinedTerm(term)) {
      addUniqueByKey(candidates, seen, term, { term, source: "quoted term" });
    }
  }

  return candidates;
}

function detectRepeatedCapitalizedTermCandidates(selectedText: string) {
  const counts = new Map<string, number>();
  const displayValues = new Map<string, string>();
  const capitalizedTermPattern = /\b[A-Z][A-Za-z0-9&'/-]*(?:\s+[A-Z][A-Za-z0-9&'/-]*){0,4}\b/g;

  for (const match of selectedText.matchAll(capitalizedTermPattern)) {
    const term = normalizeWhitespace(match[0]);

    if (!isLikelyDefinedTerm(term)) {
      continue;
    }

    const key = term.toLocaleLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    displayValues.set(key, term);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([key]) => ({
      term: displayValues.get(key) ?? key,
      source: "repeated capitalized term" as const,
    }));
}

function looksLikeStandaloneHeading(selectedText: string) {
  const normalizedText = normalizeWhitespace(selectedText);
  const wordCount = normalizedText.split(/\s+/).filter(Boolean).length;

  return wordCount <= 4 && !/[.;:,()"“”]/.test(normalizedText);
}

function detectCapitalizedPhraseCandidates(selectedText: string) {
  if (looksLikeStandaloneHeading(selectedText)) {
    return [];
  }

  const candidates: SelectionDefinedTermCandidate[] = [];
  const seen = new Set<string>();
  const capitalizedPhrasePattern = /\b(?:(?:A|An|Any|Each|The|This)\s+)?[A-Z][A-Za-z0-9&'/-]*(?:\s+[A-Z][A-Za-z0-9&'/-]*){1,4}\b/g;

  for (const match of selectedText.matchAll(capitalizedPhrasePattern)) {
    const term = normalizeCandidateTerm(match[0]);

    if (isLikelyDefinedTerm(term)) {
      addUniqueByKey(candidates, seen, term, { term, source: "capitalized phrase" });
    }
  }

  return candidates;
}

function detectSelectionDefinedTermCandidates(
  selectedText: string,
  confirmedDefinedTerms: SelectionConfirmedDefinedTerm[],
): SelectionDefinedTermCandidate[] {
  const candidates: SelectionDefinedTermCandidate[] = [];
  const seen = new Set<string>();
  const confirmedTermKeys = new Set(
    confirmedDefinedTerms.flatMap((definedTerm) => [
      definedTerm.term.toLocaleLowerCase(),
      definedTerm.matchedText.toLocaleLowerCase(),
    ]),
  );

  for (const candidate of [
    ...detectQuotedTermCandidates(selectedText),
    ...detectCapitalizedPhraseCandidates(selectedText),
    ...detectRepeatedCapitalizedTermCandidates(selectedText),
  ]) {
    if (confirmedTermKeys.has(candidate.term.toLocaleLowerCase())) {
      continue;
    }

    addUniqueByKey(candidates, seen, candidate.term, candidate);
  }

  return candidates;
}

function detectSelectionObligations(selectedText: string): SelectionObligationSignal[] {
  const signals: SelectionObligationSignal[] = [];
  const seen = new Set<string>();
  const obligationPattern = /\b(shall not|must not|is required to|agrees to|covenants to|shall|must|will)\b/gi;

  for (const match of selectedText.matchAll(obligationPattern)) {
    const triggerText = normalizeWhitespace(match[0]).toLocaleLowerCase();
    addUniqueByKey(signals, seen, triggerText, { triggerText });
  }

  return signals;
}

function isClauseLikeSelection(selectedText: string, obligationSignals: SelectionObligationSignal[]) {
  const normalizedText = normalizeWhitespace(selectedText);
  const wordCount = normalizedText ? normalizedText.split(/\s+/).length : 0;

  if (normalizedText.length >= 80 && wordCount >= 10) {
    return true;
  }

  return normalizedText.length >= 45 && wordCount >= 7 && obligationSignals.length > 0;
}

function getAvailableActions(context: Omit<SelectionContext, "availableActions">): SelectionAvailableAction[] {
  const actions: SelectionAvailableAction[] = [];
  const hasSectionOrArticleReference = context.references.some(
    (reference) => reference.type === "section" || reference.type === "article",
  );

  if (hasSectionOrArticleReference) {
    actions.push(
      {
        id: "goToSectionOrArticle",
        label: "Go to Section/Article",
        status: "comingSoon",
        reason: "A section or article reference was detected.",
      },
      {
        id: "openSectionOrArticleInSidebar",
        label: "Open Section/Article in Sidebar",
        status: "comingSoon",
        reason: "A section or article reference was detected.",
      },
    );
  }

  if (context.confirmedDefinedTerms.length > 0 || context.definedTermCandidates.length > 0) {
    actions.push({
      id: "analyzeDefinedTerms",
      label: "Analyze Defined Terms",
      status: "available",
      reason: "A likely defined term was detected in the selection.",
    });
  }

  if (context.obligationSignals.length > 0) {
    actions.push({
      id: "analyzeRelevantObligations",
      label: "Analyze Relevant Obligations",
      status: "available",
      reason: "Obligation language was detected in the selection.",
    });
  }

  if (context.isClauseLike) {
    actions.push({
      id: "editWithAi",
      label: "Edit with AI",
      status: "mockOnly",
      reason: "The selection looks clause-like, but real AI editing is not enabled.",
    });
  }

  return actions;
}

export function detectSelectionContext(selectedText: string, options: SelectionContextOptions = {}): SelectionContext {
  const normalizedText = normalizeWhitespace(selectedText);
  const confirmedDefinedTerms = detectConfirmedDefinedTerms(normalizedText, options.knownDefinedTerms);
  const baseContext = {
    normalizedText,
    references: detectSelectionReferences(normalizedText),
    confirmedDefinedTerms,
    definedTermCandidates: detectSelectionDefinedTermCandidates(normalizedText, confirmedDefinedTerms),
    obligationSignals: detectSelectionObligations(normalizedText),
    isClauseLike: false,
  };

  baseContext.isClauseLike = isClauseLikeSelection(normalizedText, baseContext.obligationSignals);

  return {
    ...baseContext,
    availableActions: getAvailableActions(baseContext),
  };
}
