export type SelectedTextReadResult = {
  rawText: string;
  displayText: string;
  normalizedText: string;
};

type WordRangeSelectionResult = {
  text: string;
  paragraphTexts: string[];
};

type TokenSpan = {
  text: string;
  start: number;
  end: number;
};

function normalizeLineEndings(text: string) {
  return text.replace(/\r\n?/g, "\n");
}

function trimSelectedText(text: string) {
  return normalizeLineEndings(text).replace(/^[\s\n]+|[\s\n]+$/g, "");
}

export function normalizeSelectedTextForDetection(text: string) {
  return normalizeLineEndings(text).replace(/\s+/g, " ").trim();
}

function tokenizeWithSpans(text: string): TokenSpan[] {
  const tokens: TokenSpan[] = [];
  const tokenPattern = /\S+/g;

  for (const match of text.matchAll(tokenPattern)) {
    const start = match.index ?? 0;
    tokens.push({
      text: match[0],
      start,
      end: start + match[0].length,
    });
  }

  return tokens;
}

function tokenTextsMatch(first: TokenSpan[], second: string[]) {
  return first.length === second.length && first.every((token, index) => token.text === second[index]);
}

function sliceTextByTokens(text: string, tokens: TokenSpan[], startIndex: number, endIndex: number) {
  const selectedTokens = tokens.slice(startIndex, endIndex);

  if (!selectedTokens.length) {
    return "";
  }

  return text.slice(selectedTokens[0].start, selectedTokens[selectedTokens.length - 1].end);
}

function reconstructPartialParagraphSelection(exactText: string, paragraphTexts: string[]) {
  const exactTokens = tokenizeWithSpans(normalizeSelectedTextForDetection(exactText)).map((token) => token.text);

  if (paragraphTexts.length < 2 || !exactTokens.length) {
    return null;
  }

  const paragraphTokens = paragraphTexts.map(tokenizeWithSpans);
  const firstTokens = paragraphTokens[0];
  const lastTokens = paragraphTokens[paragraphTokens.length - 1];
  const middleTokens = paragraphTokens.slice(1, -1).flatMap((tokens) => tokens);

  for (let firstStart = 0; firstStart < firstTokens.length; firstStart += 1) {
    for (let lastEnd = 1; lastEnd <= lastTokens.length; lastEnd += 1) {
      const candidateTokens = [...firstTokens.slice(firstStart), ...middleTokens, ...lastTokens.slice(0, lastEnd)];

      if (!tokenTextsMatch(candidateTokens, exactTokens)) {
        continue;
      }

      const segments = [
        sliceTextByTokens(paragraphTexts[0], firstTokens, firstStart, firstTokens.length),
        ...paragraphTexts.slice(1, -1).map((paragraphText) => paragraphText.trimEnd()),
        sliceTextByTokens(paragraphTexts[paragraphTexts.length - 1], lastTokens, 0, lastEnd),
      ].filter(Boolean);

      return segments.join("\n\n");
    }
  }

  return null;
}

export function getParagraphAwareSelectedTextDisplay(exactText: string, paragraphTexts: string[]) {
  const cleanedParagraphs = paragraphTexts.map((paragraphText) => trimSelectedText(paragraphText)).filter(Boolean);

  if (cleanedParagraphs.length < 2) {
    return null;
  }

  const joinedParagraphs = cleanedParagraphs.join("\n\n");

  if (normalizeSelectedTextForDetection(joinedParagraphs) === normalizeSelectedTextForDetection(exactText)) {
    return joinedParagraphs;
  }

  return reconstructPartialParagraphSelection(exactText, cleanedParagraphs);
}

async function readSelectedTextFromOfficeData() {
  if (!window.Office?.context?.document?.getSelectedDataAsync) {
    return "";
  }

  try {
    return await new Promise<string>((resolve) => {
      Office.context.document.getSelectedDataAsync(Office.CoercionType.Text, (result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded && typeof result.value === "string") {
          resolve(trimSelectedText(result.value));
          return;
        }

        resolve("");
      });
    });
  } catch {
    return "";
  }
}

async function readSelectedTextFromWordRange(): Promise<WordRangeSelectionResult> {
  try {
    let text = "";
    let paragraphTexts: string[] = [];

    await Word.run(async (context) => {
      const selection = context.document.getSelection();
      const paragraphs = selection.paragraphs;

      selection.load("text");
      paragraphs.load("items/text");

      await context.sync();

      text = trimSelectedText(selection.text);
      paragraphTexts = paragraphs.items.map((paragraph) => paragraph.text);
    });

    return { text, paragraphTexts };
  } catch {
    let text = "";

    await Word.run(async (context) => {
      const selection = context.document.getSelection();
      selection.load("text");

      await context.sync();

      text = trimSelectedText(selection.text);
    });

    return { text, paragraphTexts: [] };
  }
}

export async function readSelectedTextFromWordSelection(): Promise<SelectedTextReadResult> {
  const officeSelectedText = await readSelectedTextFromOfficeData();
  const wordRangeSelection = await readSelectedTextFromWordRange();
  const rawText = officeSelectedText || wordRangeSelection.text;
  const displayText =
    rawText.includes("\n") || !wordRangeSelection.paragraphTexts.length
      ? rawText
      : getParagraphAwareSelectedTextDisplay(rawText, wordRangeSelection.paragraphTexts) ?? rawText;

  return {
    rawText,
    displayText,
    normalizedText: normalizeSelectedTextForDetection(displayText),
  };
}
