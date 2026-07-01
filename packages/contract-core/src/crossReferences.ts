export type CrossReferenceType = "section" | "article" | "schedule" | "exhibit";

export type CrossReference = {
  referenceText: string;
  type: CrossReferenceType;
  normalizedTarget: string;
  sourceText: string;
};

export type CrossReferenceHeading = {
  headingText: string;
  type: CrossReferenceType;
  normalizedTarget: string;
};

export type CrossReferenceTarget = {
  referenceText: string;
  type: CrossReferenceType;
  normalizedTarget: string;
  headingText: string;
  extractedText: string;
  isApproximate: boolean;
  searchCandidates: string[];
};

export type CrossReferenceTargetResult =
  | {
      found: true;
      target: CrossReferenceTarget;
    }
  | {
      found: false;
      referenceText: string;
      type?: CrossReferenceType;
      reason: string;
      searchCandidates: string[];
    };

export type PotentialBrokenReference = {
  referenceText: string;
  type: CrossReferenceType;
  sourceText: string;
  reason: string;
  sourceNavigationText: string;
};

const typeLabels: Record<CrossReferenceType, string> = {
  section: "Section",
  article: "Article",
  schedule: "Schedule",
  exhibit: "Exhibit",
};

function getParagraphs(documentText: string) {
  return documentText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function getParagraphRecords(documentText: string) {
  return documentText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => ({
      text: paragraph,
      firstLine: paragraph.split(/\n/)[0].trim(),
    }));
}

function normalizeValue(value: string) {
  return value.replace(/\s+/g, "").replace(/[.,;:]$/g, "").toLocaleLowerCase();
}

function normalizeTarget(type: CrossReferenceType, value: string) {
  return `${type}:${normalizeValue(value)}`;
}

function getSourceSnippet(paragraph: string, referenceText: string) {
  const referenceIndex = paragraph.toLocaleLowerCase().indexOf(referenceText.toLocaleLowerCase());

  if (referenceIndex === -1 || paragraph.length <= 220) {
    return paragraph;
  }

  const snippetStart = Math.max(0, referenceIndex - 80);
  const snippetEnd = Math.min(paragraph.length, referenceIndex + referenceText.length + 120);

  return paragraph.slice(snippetStart, snippetEnd).trim();
}

function addReference(
  references: CrossReference[],
  paragraph: string,
  match: RegExpMatchArray,
  type: CrossReferenceType,
) {
  references.push({
    referenceText: match[0].trim(),
    type,
    normalizedTarget: normalizeTarget(type, match[1]),
    sourceText: getSourceSnippet(paragraph, match[0]),
  });
}

function isLikelyHeadingLine(value: string) {
  const normalizedValue = value.trim();

  if (!normalizedValue || normalizedValue.length > 140) {
    return false;
  }

  if (/[.;:]$/.test(normalizedValue)) {
    return false;
  }

  return !/\b(shall|will|must|may|means|mean|is|are|was|were|has|have|pursuant|under)\b/i.test(normalizedValue);
}

function getHeadingFromLine(firstLine: string): CrossReferenceHeading | null {
  if (!isLikelyHeadingLine(firstLine)) {
    return null;
  }

  const sectionHeading = firstLine.match(/^(?:Section\s+)?(\d+(?:\.\d+)*(?:\([a-z0-9ivxlcdm]+\))*)(?=\s|$)/i);
  const articleHeading = firstLine.match(/^Article\s+([IVXLCDM]+|\d+(?:\.\d+)*)\b/i);
  const scheduleHeading = firstLine.match(/^Schedule\s+([A-Z0-9]+(?:[-.][A-Z0-9]+)*)\b/i);
  const exhibitHeading = firstLine.match(/^Exhibit\s+([A-Z0-9]+(?:[-.][A-Z0-9]+)*)\b/i);

  if (sectionHeading) {
    return {
      headingText: firstLine,
      type: "section",
      normalizedTarget: normalizeTarget("section", sectionHeading[1]),
    };
  }

  if (articleHeading) {
    return {
      headingText: firstLine,
      type: "article",
      normalizedTarget: normalizeTarget("article", articleHeading[1]),
    };
  }

  if (scheduleHeading) {
    return {
      headingText: firstLine,
      type: "schedule",
      normalizedTarget: normalizeTarget("schedule", scheduleHeading[1]),
    };
  }

  if (exhibitHeading) {
    return {
      headingText: firstLine,
      type: "exhibit",
      normalizedTarget: normalizeTarget("exhibit", exhibitHeading[1]),
    };
  }

  return null;
}

function parseCrossReferenceText(referenceText: string, fallbackType?: CrossReferenceType): CrossReference | null {
  const detectedReference = detectCrossReferences(referenceText)[0];

  if (detectedReference) {
    return detectedReference;
  }

  if (!fallbackType) {
    return null;
  }

  const value = referenceText
    .replace(new RegExp(`^${typeLabels[fallbackType]}\\s+`, "i"), "")
    .trim();

  if (!value) {
    return null;
  }

  return {
    referenceText: referenceText.trim(),
    type: fallbackType,
    normalizedTarget: normalizeTarget(fallbackType, value),
    sourceText: referenceText.trim(),
  };
}

function buildTargetSearchCandidates(reference: CrossReference, headingText: string) {
  const headingWithoutSectionPrefix =
    reference.type === "section" ? headingText.replace(/^Section\s+/i, "").trim() : headingText;

  return Array.from(
    new Set(
      [headingText, headingWithoutSectionPrefix, reference.referenceText]
        .map((candidate) => candidate.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .filter((candidate) => candidate.length <= 240),
    ),
  );
}

function extractApproximateTargetText(paragraphs: ReturnType<typeof getParagraphRecords>, startIndex: number) {
  const selectedParagraphs = [paragraphs[startIndex].text];

  for (let index = startIndex + 1; index < paragraphs.length; index += 1) {
    const nextHeading = getHeadingFromLine(paragraphs[index].firstLine);

    if (nextHeading) {
      break;
    }

    selectedParagraphs.push(paragraphs[index].text);

    if (selectedParagraphs.join("\n\n").length >= 1800) {
      break;
    }
  }

  const extractedText = selectedParagraphs.join("\n\n").trim();

  return extractedText.length > 2200 ? `${extractedText.slice(0, 2200).trimEnd()}\n\n[Snippet truncated]` : extractedText;
}

export function detectCrossReferences(documentText: string): CrossReference[] {
  const references: CrossReference[] = [];
  const paragraphs = getParagraphs(documentText);

  for (const paragraph of paragraphs) {
    const sectionPattern = /\bSection\s+(\d+(?:\.\d+)*(?:\([a-z0-9ivxlcdm]+\))*)/gi;
    const articlePattern = /\bArticle\s+([IVXLCDM]+|\d+(?:\.\d+)*)/gi;
    const schedulePattern = /\bSchedule\s+([A-Z0-9]+(?:[-.][A-Z0-9]+)*)/gi;
    const exhibitPattern = /\bExhibit\s+([A-Z0-9]+(?:[-.][A-Z0-9]+)*)/gi;

    for (const match of paragraph.matchAll(sectionPattern)) {
      addReference(references, paragraph, match, "section");
    }

    for (const match of paragraph.matchAll(articlePattern)) {
      addReference(references, paragraph, match, "article");
    }

    for (const match of paragraph.matchAll(schedulePattern)) {
      addReference(references, paragraph, match, "schedule");
    }

    for (const match of paragraph.matchAll(exhibitPattern)) {
      addReference(references, paragraph, match, "exhibit");
    }
  }

  return references;
}

export function detectCrossReferenceHeadings(documentText: string): CrossReferenceHeading[] {
  const headings: CrossReferenceHeading[] = [];
  const paragraphs = getParagraphRecords(documentText);

  for (const paragraph of paragraphs) {
    const heading = getHeadingFromLine(paragraph.firstLine);

    if (!heading) {
      continue;
    }

    headings.push(heading);
  }

  return headings;
}

export function findCrossReferenceTarget(
  documentText: string,
  referenceText: string,
  fallbackType?: CrossReferenceType,
): CrossReferenceTargetResult {
  const reference = parseCrossReferenceText(referenceText, fallbackType);

  if (!reference) {
    return {
      found: false,
      referenceText,
      type: fallbackType,
      reason: "Contractr could not parse that reference.",
      searchCandidates: [referenceText].filter(Boolean),
    };
  }

  const paragraphs = getParagraphRecords(documentText);
  const targetIndex = paragraphs.findIndex((paragraph) => {
    const heading = getHeadingFromLine(paragraph.firstLine);
    return heading?.normalizedTarget === reference.normalizedTarget;
  });

  if (targetIndex === -1) {
    return {
      found: false,
      referenceText: reference.referenceText,
      type: reference.type,
      reason: `No matching ${typeLabels[reference.type].toLocaleLowerCase()} heading was detected in the document.`,
      searchCandidates: [reference.referenceText],
    };
  }

  const heading = getHeadingFromLine(paragraphs[targetIndex].firstLine);
  const headingText = heading?.headingText ?? paragraphs[targetIndex].firstLine;

  return {
    found: true,
    target: {
      referenceText: reference.referenceText,
      type: reference.type,
      normalizedTarget: reference.normalizedTarget,
      headingText,
      extractedText: extractApproximateTargetText(paragraphs, targetIndex),
      isApproximate: true,
      searchCandidates: buildTargetSearchCandidates(reference, headingText),
    },
  };
}

export function findPotentialBrokenReferences(documentText: string): PotentialBrokenReference[] {
  const references = detectCrossReferences(documentText);
  const headingTargets = new Set(detectCrossReferenceHeadings(documentText).map((heading) => heading.normalizedTarget));
  const seenIssues = new Set<string>();
  const issues: PotentialBrokenReference[] = [];

  for (const reference of references) {
    if (headingTargets.has(reference.normalizedTarget)) {
      continue;
    }

    const issueKey = `${reference.normalizedTarget}:${reference.sourceText}`;

    if (seenIssues.has(issueKey)) {
      continue;
    }

    seenIssues.add(issueKey);
    issues.push({
      referenceText: reference.referenceText,
      type: reference.type,
      sourceText: reference.sourceText,
      sourceNavigationText: reference.referenceText,
      reason: `No matching ${typeLabels[reference.type].toLocaleLowerCase()} heading was detected in the document.`,
    });
  }

  return issues;
}
