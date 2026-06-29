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

function addHeading(
  headings: CrossReferenceHeading[],
  headingText: string,
  type: CrossReferenceType,
  value: string,
) {
  headings.push({
    headingText,
    type,
    normalizedTarget: normalizeTarget(type, value),
  });
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
  const paragraphs = getParagraphs(documentText);

  for (const paragraph of paragraphs) {
    const firstLine = paragraph.split(/\n/)[0].trim();

    if (!isLikelyHeadingLine(firstLine)) {
      continue;
    }

    const sectionHeading = firstLine.match(/^(?:Section\s+)?(\d+(?:\.\d+)*(?:\([a-z0-9ivxlcdm]+\))*)(?=\s|$)/i);
    const articleHeading = firstLine.match(/^Article\s+([IVXLCDM]+|\d+(?:\.\d+)*)\b/i);
    const scheduleHeading = firstLine.match(/^Schedule\s+([A-Z0-9]+(?:[-.][A-Z0-9]+)*)\b/i);
    const exhibitHeading = firstLine.match(/^Exhibit\s+([A-Z0-9]+(?:[-.][A-Z0-9]+)*)\b/i);

    if (sectionHeading) {
      addHeading(headings, firstLine, "section", sectionHeading[1]);
    }

    if (articleHeading) {
      addHeading(headings, firstLine, "article", articleHeading[1]);
    }

    if (scheduleHeading) {
      addHeading(headings, firstLine, "schedule", scheduleHeading[1]);
    }

    if (exhibitHeading) {
      addHeading(headings, firstLine, "exhibit", exhibitHeading[1]);
    }
  }

  return headings;
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
