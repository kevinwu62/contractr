export type PotentialObligation = {
  responsibleParty: string | null;
  obligationText: string;
  deadlineOrTiming: string | null;
  sourceReference: string | null;
  sourceText: string;
  sourceNavigationText: string;
  triggerText: string;
};

type ParagraphInfo = {
  text: string;
  sourceReference: string | null;
};

const obligationTriggerPattern =
  /\b(shall not|must not|is required to|agrees to|covenants to|shall|must|will)\b/i;

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

function detectSourceReference(paragraph: string) {
  const firstLine = getFirstLine(paragraph);
  const sectionHeading = firstLine.match(/^(?:Section\s+)?(\d+(?:\.\d+)*(?:\([a-z0-9ivxlcdm]+\))*)\b(?:\s+(.+))?/i);
  const articleHeading = firstLine.match(/^Article\s+([IVXLCDM]+|\d+(?:\.\d+)*)\b(?:\s+(.+))?/i);
  const scheduleHeading = firstLine.match(/^Schedule\s+([A-Z0-9]+(?:[-.][A-Z0-9]+)*)\b(?:\s+(.+))?/i);
  const exhibitHeading = firstLine.match(/^Exhibit\s+([A-Z0-9]+(?:[-.][A-Z0-9]+)*)\b(?:\s+(.+))?/i);

  if (sectionHeading) {
    return `Section ${sectionHeading[1]}`;
  }

  if (articleHeading) {
    return `Article ${articleHeading[1]}`;
  }

  if (scheduleHeading) {
    return `Schedule ${scheduleHeading[1]}`;
  }

  if (exhibitHeading) {
    return `Exhibit ${exhibitHeading[1]}`;
  }

  return null;
}

function getParagraphInfos(documentText: string): ParagraphInfo[] {
  const paragraphInfos: ParagraphInfo[] = [];
  let currentSourceReference: string | null = null;

  for (const paragraph of getParagraphs(documentText)) {
    const detectedReference = detectSourceReference(paragraph);

    if (detectedReference) {
      currentSourceReference = detectedReference;
    }

    paragraphInfos.push({
      text: paragraph,
      sourceReference: currentSourceReference,
    });
  }

  return paragraphInfos;
}

function splitIntoCandidateSentences(paragraph: string) {
  const normalizedParagraph = normalizeWhitespace(paragraph);
  const candidates = normalizedParagraph
    .split(/(?<=[.!?])\s+(?=[A-Z"“(])/)
    .map((candidate) => candidate.trim())
    .filter(Boolean);

  return candidates.length ? candidates : [normalizedParagraph];
}

function cleanResponsibleParty(value: string) {
  const party = value
    .replace(/^(?:Section\s+)?\d+(?:\.\d+)*(?:\([a-z0-9ivxlcdm]+\))*\s+/i, "")
    .replace(/^(?:Article|Schedule|Exhibit)\s+[A-Z0-9IVXLCDM.-]+\s+/i, "")
    .replace(/^[,;:()\s]+/, "")
    .trim();

  if (!party || party.length > 140) {
    return null;
  }

  return party;
}

function extractResponsibleParty(sentence: string, triggerIndex: number) {
  const beforeTrigger = sentence.slice(0, triggerIndex).trim();
  const likelyParty = beforeTrigger.split(/\s*(?:;|, and|, but| provided that| except that)\s*/i).pop() ?? beforeTrigger;

  return cleanResponsibleParty(likelyParty);
}

function extractDeadlineOrTiming(sentence: string) {
  const timingMatch = sentence.match(
    /\b((?:within|no later than|on or before|on or prior to|prior to|before|after|by|upon|promptly|immediately|during|until|following)\b[^.;]{0,120})/i,
  );

  return timingMatch ? normalizeWhitespace(timingMatch[1].replace(/[,)]$/g, "")) : null;
}

function getSourceSnippet(paragraph: string, sentence: string) {
  const normalizedParagraph = normalizeWhitespace(paragraph);

  if (sentence.length <= 260) {
    return sentence;
  }

  const triggerMatch = sentence.match(obligationTriggerPattern);

  if (!triggerMatch || triggerMatch.index === undefined) {
    return sentence.slice(0, 260).trim();
  }

  const snippetStart = Math.max(0, triggerMatch.index - 100);
  const snippetEnd = Math.min(sentence.length, triggerMatch.index + triggerMatch[0].length + 160);
  const snippet = sentence.slice(snippetStart, snippetEnd).trim();

  return snippet || normalizedParagraph.slice(0, 260).trim();
}

function addPotentialObligation(
  obligations: PotentialObligation[],
  seen: Set<string>,
  paragraphInfo: ParagraphInfo,
  sentence: string,
) {
  const triggerMatch = sentence.match(obligationTriggerPattern);

  if (!triggerMatch || triggerMatch.index === undefined) {
    return;
  }

  const obligationText = normalizeWhitespace(sentence);
  const sourceText = getSourceSnippet(paragraphInfo.text, obligationText);
  const sourceNavigationText = sourceText.length <= 220 ? sourceText : triggerMatch[0];
  const issueKey = `${paragraphInfo.sourceReference ?? "unknown"}:${obligationText.toLocaleLowerCase()}`;

  if (seen.has(issueKey)) {
    return;
  }

  seen.add(issueKey);
  obligations.push({
    responsibleParty: extractResponsibleParty(obligationText, triggerMatch.index),
    obligationText,
    deadlineOrTiming: extractDeadlineOrTiming(obligationText),
    sourceReference: paragraphInfo.sourceReference,
    sourceText,
    sourceNavigationText,
    triggerText: triggerMatch[0],
  });
}

export function extractPotentialObligations(documentText: string): PotentialObligation[] {
  const obligations: PotentialObligation[] = [];
  const seen = new Set<string>();

  for (const paragraphInfo of getParagraphInfos(documentText)) {
    for (const sentence of splitIntoCandidateSentences(paragraphInfo.text)) {
      addPotentialObligation(obligations, seen, paragraphInfo, sentence);
    }
  }

  return obligations;
}
