export type DefinedTermResult = {
  term: string;
  detectedVariants: string[];
  definitionText: string;
  sourceTexts: string[];
  usageCount: number;
  patternLabel: string;
  confidenceLabel: string;
};

export type FindPotentialUndefinedTermsResult = {
  term: string;
  usageCount: number;
  reason: string;
};

export type SimilarDefinedTermsResult = {
  firstTerm: string;
  secondTerm: string;
  reason: string;
};

const definitionPatternLabels = [
  "means",
  "shall mean",
  "has the meaning",
  "refers to",
] as const;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildDefinedTermUsageRegex(term: string) {
  const phrasePattern = term
    .trim()
    .split(/\s+/)
    .map((termPart) => escapeRegExp(termPart))
    .join("\\s+");

  return new RegExp(phrasePattern, "g");
}

function isTermCharacter(value: string | undefined) {
  return Boolean(value && /[A-Za-z0-9]/.test(value));
}

function hasCapitalizedWordBefore(documentText: string, matchStart: number) {
  const previousWordMatch = documentText.slice(0, matchStart).match(/([A-Z][A-Za-z0-9'&-]*)\s+$/);
  const ordinaryLeadInWords = new Set([
    "A",
    "All",
    "An",
    "Any",
    "Each",
    "For",
    "From",
    "In",
    "On",
    "The",
    "This",
    "To",
    "Under",
  ]);

  return Boolean(previousWordMatch && !ordinaryLeadInWords.has(previousWordMatch[1]));
}

function hasCapitalizedWordAfter(documentText: string, matchEnd: number) {
  return /^\s+[A-Z][A-Za-z0-9'&-]*/.test(documentText.slice(matchEnd));
}

function isStandaloneDefinedTermUsage(documentText: string, matchStart: number, matchEnd: number) {
  if (isTermCharacter(documentText[matchStart - 1]) || isTermCharacter(documentText[matchEnd])) {
    return false;
  }

  return !(
    hasCapitalizedWordBefore(documentText, matchStart) ||
    hasCapitalizedWordAfter(documentText, matchEnd)
  );
}

function getExcludedRanges(documentText: string, excludedTexts: string[]) {
  const ranges: Array<{ start: number; end: number }> = [];

  for (const excludedText of uniqueValues(excludedTexts)) {
    let searchStart = 0;
    let sourceStart = documentText.indexOf(excludedText, searchStart);

    while (sourceStart !== -1) {
      ranges.push({ start: sourceStart, end: sourceStart + excludedText.length });
      searchStart = sourceStart + excludedText.length;
      sourceStart = documentText.indexOf(excludedText, searchStart);
    }
  }

  return ranges;
}

function rangesOverlap(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number) {
  return firstStart < secondEnd && secondStart < firstEnd;
}

export function countTermUsages(
  documentText: string,
  term: string,
  options: { variants?: string[]; excludedTexts?: string[] } = {},
) {
  const excludedRanges = getExcludedRanges(documentText, options.excludedTexts ?? []);
  const countedRanges: Array<{ start: number; end: number }> = [];
  const termVariants = uniqueValues([term, ...(options.variants ?? [])].flatMap((termValue) => getTermUsageVariants(termValue)))
    .filter(Boolean)
    .sort((first, second) => second.length - first.length);

  for (const termVariant of termVariants) {
    const usagePattern = buildDefinedTermUsageRegex(termVariant);

    for (const match of documentText.matchAll(usagePattern)) {
      const matchStart = match.index;
      const matchEnd = matchStart + match[0].length;

      if (
        !isStandaloneDefinedTermUsage(documentText, matchStart, matchEnd) ||
        excludedRanges.some((range) => rangesOverlap(matchStart, matchEnd, range.start, range.end)) ||
        countedRanges.some((range) => rangesOverlap(matchStart, matchEnd, range.start, range.end))
      ) {
        continue;
      }

      countedRanges.push({ start: matchStart, end: matchEnd });
    }
  }

  return countedRanges.length;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values));
}

function singularizeLastWord(term: string) {
  const words = term.trim().split(/\s+/);
  const lastWord = words[words.length - 1];

  if (!lastWord) {
    return term.trim();
  }

  const singularLastWord = singularizeWord(lastWord);

  return [...words.slice(0, -1), singularLastWord].join(" ");
}

function singularizeWord(word: string) {
  if (word.length <= 3 || /(ss|is|us|series)$/i.test(word)) {
    return word;
  }

  if (/ies$/i.test(word)) {
    return `${word.slice(0, -3)}y`;
  }

  if (/(ches|shes|xes|zes)$/i.test(word)) {
    return word.slice(0, -2);
  }

  if (/s$/i.test(word)) {
    return word.slice(0, -1);
  }

  return word;
}

function pluralizeLastWord(term: string) {
  const words = term.trim().split(/\s+/);
  const lastWord = words[words.length - 1];

  if (!lastWord || lastWord.length <= 2 || /s$/i.test(lastWord)) {
    return term.trim();
  }

  const pluralLastWord = /[^aeiou]y$/i.test(lastWord)
    ? `${lastWord.slice(0, -1)}ies`
    : /(ch|sh|x|z)$/i.test(lastWord)
      ? `${lastWord}es`
      : `${lastWord}s`;

  return [...words.slice(0, -1), pluralLastWord].join(" ");
}

function getTermKey(term: string) {
  return singularizeLastWord(term).toLocaleLowerCase();
}

function getTermUsageVariants(term: string) {
  const singularTerm = singularizeLastWord(term);
  const pluralTerm = pluralizeLastWord(singularTerm);

  return uniqueValues([term.trim(), singularTerm, pluralTerm].filter(Boolean));
}

function getConfidenceRank(confidenceLabel: string) {
  return confidenceLabel === "Likely defined term" ? 2 : 1;
}

function isLikelyQuotedDefinedTerm(value: string) {
  const normalizedValue = value.trim();
  const wordCount = normalizedValue.split(/\s+/).filter(Boolean).length;

  return (
    normalizedValue.length > 0 &&
    normalizedValue.length <= 120 &&
    wordCount <= 12 &&
    /[A-Za-z0-9]/.test(normalizedValue) &&
    !/[.!?;:]$/.test(normalizedValue)
  );
}

function addDefinedTermResult(
  resultsByTerm: Map<string, DefinedTermResult>,
  documentText: string,
  term: string,
  definitionText: string,
  patternLabel: string,
  confidenceLabel: string,
) {
  const normalizedTerm = term.trim();
  const termKey = getTermKey(normalizedTerm);
  const canonicalTerm = singularizeLastWord(normalizedTerm);

  if (!normalizedTerm) {
    return;
  }

  const existingResult = resultsByTerm.get(termKey);

  if (existingResult) {
    const detectedVariants = uniqueValues([...existingResult.detectedVariants, normalizedTerm]);
    const sourceTexts = uniqueValues([...existingResult.sourceTexts, definitionText]);
    const shouldReplaceDefinition = getConfidenceRank(confidenceLabel) > getConfidenceRank(existingResult.confidenceLabel);

    resultsByTerm.set(termKey, {
      ...existingResult,
      detectedVariants,
      definitionText: shouldReplaceDefinition ? definitionText : existingResult.definitionText,
      sourceTexts,
      usageCount: countTermUsages(documentText, existingResult.term, { variants: detectedVariants, excludedTexts: sourceTexts }),
      patternLabel: shouldReplaceDefinition ? patternLabel : existingResult.patternLabel,
      confidenceLabel: shouldReplaceDefinition ? confidenceLabel : existingResult.confidenceLabel,
    });
    return;
  }

  resultsByTerm.set(termKey, {
    term: canonicalTerm,
    detectedVariants: [normalizedTerm],
    definitionText,
    sourceTexts: [definitionText],
    usageCount: countTermUsages(documentText, normalizedTerm, { excludedTexts: [definitionText] }),
    patternLabel,
    confidenceLabel,
  });
}

export function extractDefinedTerms(documentText: string): DefinedTermResult[] {
  const resultsByTerm = new Map<string, DefinedTermResult>();
  const paragraphs = documentText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    const explicitDefinitionPattern =
      /["“]([^"”\n]{1,120})["”]\s+(means|shall mean|has the meaning|refers to)\b/gi;

    for (const match of paragraph.matchAll(explicitDefinitionPattern)) {
      const pattern = match[2].toLowerCase() as (typeof definitionPatternLabels)[number];

      addDefinedTermResult(resultsByTerm, documentText, match[1], paragraph, pattern, "Likely defined term");
    }

    const parentheticalAliasPattern = /\(\s*(?:the\s+)?["“]([^"”\n]{1,120})["”]\s*\)/gi;

    for (const match of paragraph.matchAll(parentheticalAliasPattern)) {
      addDefinedTermResult(
        resultsByTerm,
        documentText,
        match[1],
        paragraph,
        'parenthetical alias, e.g. (the "Term")',
        "Potential defined term",
      );
    }

    const quotedTermPattern = /["“]([^"”\n]{1,120})["”]/gi;

    for (const match of paragraph.matchAll(quotedTermPattern)) {
      if (!isLikelyQuotedDefinedTerm(match[1])) {
        continue;
      }

      addDefinedTermResult(
        resultsByTerm,
        documentText,
        match[1],
        paragraph,
        "quoted term outside formal definition",
        "Potential defined term",
      );
    }
  }

  return Array.from(resultsByTerm.values()).sort((first, second) => first.term.localeCompare(second.term));
}

export function findDefinedButUnusedTerms(documentText: string, definedTerms = extractDefinedTerms(documentText)) {
  return definedTerms.filter((definedTerm) => definedTerm.usageCount === 0);
}

function normalizeCandidateTerm(term: string) {
  return term.replace(/\s+/g, " ").trim().replace(/^(A|An|Any|Each|The|This)\s+/, "");
}

function isLikelyHeading(paragraph: string, candidate: string) {
  const normalizedParagraph = normalizeCandidateTerm(paragraph.replace(/^[\d().\s]+/, ""));

  return normalizedParagraph === candidate && candidate.length <= 80;
}

function getDefinedTermKeys(definedTerms: DefinedTermResult[]) {
  return new Set(
    definedTerms.flatMap((definedTerm) => [definedTerm.term, ...definedTerm.detectedVariants].map((term) => getTermKey(term))),
  );
}

function getDefinedTermSourceParagraphs(definedTerms: DefinedTermResult[]) {
  return new Set(definedTerms.flatMap((definedTerm) => definedTerm.sourceTexts));
}

function isPotentialUndefinedCandidate(candidate: string) {
  const words = candidate.split(/\s+/);
  const ignoredSingleWords = new Set([
    "Agreement",
    "Article",
    "Exhibit",
    "Party",
    "Parties",
    "Schedule",
    "Section",
  ]);

  if (candidate.length < 4 || candidate.length > 80 || words.length > 5) {
    return false;
  }

  if (words.length === 1 && ignoredSingleWords.has(candidate)) {
    return false;
  }

  return words.every((word) => /^[A-Z][A-Za-z0-9'&-]*$/.test(word));
}

function getCapitalizedCandidatePhrases(capitalizedRun: string) {
  const words = capitalizedRun.trim().split(/\s+/).filter(Boolean);
  const candidates: string[] = [];

  if (words.length === 1) {
    return [normalizeCandidateTerm(words[0])];
  }

  for (let startIndex = 0; startIndex < words.length; startIndex += 1) {
    for (let endIndex = startIndex + 2; endIndex <= words.length; endIndex += 1) {
      candidates.push(normalizeCandidateTerm(words.slice(startIndex, endIndex).join(" ")));
    }
  }

  return uniqueValues(candidates.filter(Boolean));
}

export function findPotentialUndefinedTerms(
  documentText: string,
  definedTerms = extractDefinedTerms(documentText),
): FindPotentialUndefinedTermsResult[] {
  const definedTermKeys = getDefinedTermKeys(definedTerms);
  const candidatesByKey = new Map<string, { term: string; count: number }>();
  const capitalizedPhrasePattern =
    /\b[A-Z][A-Za-z0-9'&-]*(?:\s+[A-Z][A-Za-z0-9'&-]*){0,4}\b/g;
  const paragraphs = documentText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    for (const match of paragraph.matchAll(capitalizedPhrasePattern)) {
      for (const candidate of getCapitalizedCandidatePhrases(match[0])) {
        const candidateKey = getTermKey(candidate);

        if (
          !isPotentialUndefinedCandidate(candidate) ||
          definedTermKeys.has(candidateKey) ||
          isLikelyHeading(paragraph, candidate)
        ) {
          continue;
        }

        const existingCandidate = candidatesByKey.get(candidateKey);

        candidatesByKey.set(candidateKey, {
          term: existingCandidate?.term ?? candidate,
          count: (existingCandidate?.count ?? 0) + 1,
        });
      }
    }
  }

  return Array.from(candidatesByKey.values())
    .filter((candidate) => candidate.count > 1)
    .map((candidate) => ({
      term: candidate.term,
      usageCount: candidate.count,
      reason: "Repeated capitalized term or phrase not found in the defined-term list.",
    }))
    .sort((first, second) => second.usageCount - first.usageCount || first.term.localeCompare(second.term));
}

function getTermWords(term: string) {
  return singularizeLastWord(term)
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function termsShareMeaningfulWord(firstTerm: string, secondTerm: string) {
  const firstWords = getTermWords(firstTerm);
  const secondWords = getTermWords(secondTerm);
  const ignoredWords = new Set(["and", "or", "the"]);

  return firstWords.some((firstWord) =>
    firstWord.length > 4 && !ignoredWords.has(firstWord)
      ? secondWords.some(
          (secondWord) => secondWord === firstWord || secondWord.startsWith(firstWord) || firstWord.startsWith(secondWord),
        )
      : false,
  );
}

function isTermContainedInOtherTerm(firstTerm: string, secondTerm: string) {
  const firstWords = getTermWords(firstTerm);
  const secondWords = getTermWords(secondTerm);
  const shorterWords = firstWords.length <= secondWords.length ? firstWords : secondWords;
  const longerWords = firstWords.length <= secondWords.length ? secondWords : firstWords;

  return shorterWords.every((word) => longerWords.includes(word));
}

export function findSimilarDefinedTerms(definedTerms: DefinedTermResult[]): SimilarDefinedTermsResult[] {
  const results: SimilarDefinedTermsResult[] = [];

  for (const definedTerm of definedTerms) {
    if (definedTerm.detectedVariants.length > 1) {
      results.push({
        firstTerm: definedTerm.detectedVariants[0],
        secondTerm: definedTerm.detectedVariants.slice(1).join(", "),
        reason: "Singular/plural variants were detected for the same defined term.",
      });
    }
  }

  for (let firstIndex = 0; firstIndex < definedTerms.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < definedTerms.length; secondIndex += 1) {
      const firstTerm = definedTerms[firstIndex].term;
      const secondTerm = definedTerms[secondIndex].term;

      if (isTermContainedInOtherTerm(firstTerm, secondTerm)) {
        results.push({
          firstTerm,
          secondTerm,
          reason: "One defined term appears to be contained inside another defined term.",
        });
        continue;
      }

      if (termsShareMeaningfulWord(firstTerm, secondTerm)) {
        results.push({
          firstTerm,
          secondTerm,
          reason: "Defined terms share a similar word stem.",
        });
      }
    }
  }

  return results.sort(
    (first, second) =>
      first.firstTerm.localeCompare(second.firstTerm) || first.secondTerm.localeCompare(second.secondTerm),
  );
}
