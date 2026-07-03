import { detectCrossReferenceHeadings, type CrossReferenceHeading } from "./crossReferences";

export type DetectedParty = {
  name: string;
  role: string | null;
  sourceText: string;
  confidenceLabel: "likely" | "potential";
};

export type ContractLayout = {
  title: string | null;
  headings: CrossReferenceHeading[];
  otherHeadings: string[];
};

export type KeyDate = {
  label: string;
  value: string;
  sourceText: string;
  isPotential: boolean;
};

export type DocumentStats = {
  wordCount: number;
  paragraphCount: number;
  articleCount: number;
  sectionCount: number;
  scheduleCount: number;
  exhibitCount: number;
};

export type GoverningLawResult = {
  governingLaw: string | null;
  sourceText: string | null;
};

export type KeyClause = {
  label: string;
  headingText: string;
};

const keyClausePatterns: Array<{ label: string; pattern: RegExp }> = [
  { label: "Governing Law", pattern: /\bgoverning law\b/i },
  { label: "Notices", pattern: /\bnotices?\b/i },
  { label: "Termination", pattern: /\btermination\b/i },
  { label: "Indemnity", pattern: /\bindemnit(?:y|ication)\b/i },
  { label: "Limitation of Liability", pattern: /\blimitation of liability\b/i },
  { label: "Assignment", pattern: /\bassignment\b/i },
  { label: "Confidentiality", pattern: /\bconfidentiality\b/i },
  { label: "Non-Compete", pattern: /\bnon[-\s]?compete\b/i },
  { label: "Exclusivity", pattern: /\bexclusiv(?:e|ity)\b/i },
];

function getParagraphs(documentText: string) {
  return documentText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getFirstLine(value: string) {
  return normalizeWhitespace(value.split(/\n/)[0] ?? "");
}

function isLikelyHeading(value: string) {
  const normalizedValue = normalizeWhitespace(value);

  if (!normalizedValue || normalizedValue.length > 120) {
    return false;
  }

  if (/[.;:]$/.test(normalizedValue)) {
    return false;
  }

  return !/\b(shall|will|must|means|mean|pursuant|under|subject to)\b/i.test(normalizedValue);
}

function dedupeByKey<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const item of items) {
    const key = getKey(item);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function cleanPartyName(value: string) {
  return normalizeWhitespace(value)
    .replace(/^(?:and|between)\s+/i, "")
    .replace(/[,;:]$/g, "")
    .trim();
}

function cleanRole(value: string) {
  return normalizeWhitespace(value)
    .replace(/^the\s+/i, "")
    .replace(/[,;:]$/g, "")
    .trim();
}

function addParty(parties: DetectedParty[], name: string, role: string | null, sourceText: string, confidenceLabel: "likely" | "potential") {
  const cleanName = cleanPartyName(name);
  const cleanRoleText = role ? cleanRole(role) : null;

  if (!cleanName || cleanName.length < 2 || cleanName.length > 160) {
    return;
  }

  if (/\b(agreement|contract|effective date|recitals|whereas)\b/i.test(cleanName)) {
    return;
  }

  parties.push({
    name: cleanName,
    role: cleanRoleText || null,
    sourceText: normalizeWhitespace(sourceText),
    confidenceLabel,
  });
}

export function extractParties(documentText: string): DetectedParty[] {
  const parties: DetectedParty[] = [];
  const openingText = getParagraphs(documentText).slice(0, 8).join(" ");

  const parentheticalRolePattern =
    /([A-Z][A-Za-z0-9&.,'’\- ]{2,160}?)\s*(?:,?\s+(?:a|an|the)\s+[^()]{0,90}?)?\(\s*(?:the\s+)?["“]([^"”]{2,60})["”]\s*\)/g;
  const betweenPattern =
    /between\s+(.{2,160}?)\s+(?:and|, and)\s+(.{2,160}?)(?:\.|,|\n|$)/i;

  for (const match of openingText.matchAll(parentheticalRolePattern)) {
    addParty(parties, match[1], match[2], match[0], "likely");
  }

  const betweenMatch = openingText.match(betweenPattern);

  if (betweenMatch && parties.length === 0) {
    addParty(parties, betweenMatch[1], null, betweenMatch[0], "potential");
    addParty(parties, betweenMatch[2], null, betweenMatch[0], "potential");
  }

  return dedupeByKey(parties, (party) => `${party.name.toLocaleLowerCase()}:${party.role?.toLocaleLowerCase() ?? ""}`);
}

export function extractContractLayout(documentText: string): ContractLayout {
  const paragraphs = getParagraphs(documentText);
  const title = paragraphs.map(getFirstLine).find((line) => isLikelyHeading(line) && !/^(section|article|schedule|exhibit)\b/i.test(line)) ?? null;
  const headings = detectCrossReferenceHeadings(documentText);
  const headingTexts = new Set(headings.map((heading) => heading.headingText));
  const otherHeadings = paragraphs
    .map(getFirstLine)
    .filter((line) => isLikelyHeading(line) && !headingTexts.has(line))
    .slice(0, 40);

  return {
    title,
    headings,
    otherHeadings,
  };
}

export function extractKeyDates(documentText: string): KeyDate[] {
  const dates: KeyDate[] = [];
  const paragraphs = getParagraphs(documentText);
  const explicitDatePattern =
    /\b((?:Effective|Closing|Termination|Expiration|Outside|Notice)\s+Date)\b[^.\n;:]{0,80}?(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/gi;
  const numericDatePattern = /\b((?:Effective|Closing|Termination|Expiration|Outside|Notice)\s+Date)\b[^.\n;:]{0,80}?(\d{1,2}\/\d{1,2}\/\d{2,4})/gi;
  const timingPattern =
    /\b(within\s+\d+\s+(?:business\s+)?days?|no later than\s+[^.;]{1,80}|on or before\s+[^.;]{1,80}|before Closing|after the date hereof|prior to Closing)\b/gi;

  for (const paragraph of paragraphs) {
    const sourceText = normalizeWhitespace(paragraph);

    for (const match of sourceText.matchAll(explicitDatePattern)) {
      dates.push({
        label: normalizeWhitespace(match[1]),
        value: normalizeWhitespace(match[0].replace(match[1], "")),
        sourceText,
        isPotential: false,
      });
    }

    for (const match of sourceText.matchAll(numericDatePattern)) {
      dates.push({
        label: normalizeWhitespace(match[1]),
        value: match[2],
        sourceText,
        isPotential: false,
      });
    }

    for (const match of sourceText.matchAll(timingPattern)) {
      dates.push({
        label: "Potential timing reference",
        value: normalizeWhitespace(match[1]),
        sourceText,
        isPotential: true,
      });
    }
  }

  return dedupeByKey(dates, (date) => `${date.label}:${date.value}:${date.sourceText}`).slice(0, 80);
}

export function extractDocumentStats(documentText: string): DocumentStats {
  const paragraphs = getParagraphs(documentText);
  const headings = detectCrossReferenceHeadings(documentText);

  return {
    wordCount: normalizeWhitespace(documentText).split(/\s+/).filter(Boolean).length,
    paragraphCount: paragraphs.length,
    articleCount: headings.filter((heading) => heading.type === "article").length,
    sectionCount: headings.filter((heading) => heading.type === "section").length,
    scheduleCount: headings.filter((heading) => heading.type === "schedule").length,
    exhibitCount: headings.filter((heading) => heading.type === "exhibit").length,
  };
}

export function extractGoverningLaw(documentText: string): GoverningLawResult {
  const paragraphs = getParagraphs(documentText);
  const lawPattern =
    /\bgoverned by(?: and construed in accordance with)? the laws of (?:the State of |the Province of |the laws of )?([^.;,\n]+)/i;

  for (const paragraph of paragraphs) {
    const sourceText = normalizeWhitespace(paragraph);
    const match = sourceText.match(lawPattern);

    if (match) {
      return {
        governingLaw: normalizeWhitespace(match[1]),
        sourceText,
      };
    }
  }

  return {
    governingLaw: null,
    sourceText: null,
  };
}

export function detectKeyClauses(documentText: string): KeyClause[] {
  const layout = extractContractLayout(documentText);
  const headings = [...layout.headings.map((heading) => heading.headingText), ...layout.otherHeadings];
  const clauses: KeyClause[] = [];

  for (const headingText of headings) {
    for (const keyClausePattern of keyClausePatterns) {
      if (keyClausePattern.pattern.test(headingText)) {
        clauses.push({
          label: keyClausePattern.label,
          headingText,
        });
      }
    }
  }

  return dedupeByKey(clauses, (clause) => `${clause.label}:${clause.headingText}`).slice(0, 20);
}
