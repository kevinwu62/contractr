import { useEffect, useState } from "react";

type OfficeState = "loading" | "ready" | "unavailable";
type OutputKind = "selected" | "document" | "definedTerms";

type DefinedTermResult = {
  term: string;
  definitionText: string;
  usageCount: number;
  patternLabel: string;
  confidenceLabel: string;
};

const fullDocumentPreviewLimit = 2500;

const definitionPatternLabels = [
  "means",
  "shall mean",
  "has the meaning",
  "refers to",
] as const;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countTermUsage(documentText: string, term: string) {
  const termPattern = escapeRegExp(term);
  const usagePattern = new RegExp(`(^|[^A-Za-z0-9])${termPattern}([^A-Za-z0-9]|$)`, "g");

  return Array.from(documentText.matchAll(usagePattern)).length;
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

  if (!normalizedTerm || resultsByTerm.has(normalizedTerm)) {
    return;
  }

  resultsByTerm.set(normalizedTerm, {
    term: normalizedTerm,
    definitionText,
    usageCount: countTermUsage(documentText, normalizedTerm),
    patternLabel,
    confidenceLabel,
  });
}

function analyzeDefinedTerms(documentText: string): DefinedTermResult[] {
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

export function App() {
  const [officeState, setOfficeState] = useState<OfficeState>("loading");
  const [outputText, setOutputText] = useState("");
  const [outputKind, setOutputKind] = useState<OutputKind>("selected");
  const [characterCount, setCharacterCount] = useState<number | null>(null);
  const [definedTerms, setDefinedTerms] = useState<DefinedTermResult[]>([]);
  const [message, setMessage] = useState("Select text in Word, then click the button.");

  useEffect(() => {
    if (!window.Office) {
      setOfficeState("unavailable");
      setMessage("Open this task pane inside Microsoft Word to read selected text.");
      return;
    }

    Office.onReady((info) => {
      if (info.host === Office.HostType.Word) {
        setOfficeState("ready");
        setMessage("Select text in Word, then click the button.");
      } else {
        setOfficeState("unavailable");
        setMessage("Contractr is intended to run inside Microsoft Word.");
      }
    });
  }, []);

  async function readSelectedText() {
    if (officeState !== "ready") {
      return;
    }

    try {
      await Word.run(async (context) => {
        const selection = context.document.getSelection();
        selection.load("text");

        await context.sync();

        const text = selection.text.trim();
        setOutputKind("selected");
        setOutputText(text);
        setCharacterCount(null);
        setDefinedTerms([]);
        setMessage(text ? "Selected text:" : "No text is selected. Select text in Word and try again.");
      });
    } catch (error) {
      console.error("Unable to read selected text.", error);
      setOutputKind("selected");
      setOutputText("");
      setCharacterCount(null);
      setDefinedTerms([]);
      setMessage("Contractr could not read the selected text. Please try again.");
    }
  }

  async function readFullDocument() {
    if (officeState !== "ready") {
      return;
    }

    try {
      await Word.run(async (context) => {
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load("items/text");

        await context.sync();

        const text = paragraphs.items
          .map((paragraph) => paragraph.text.trimEnd())
          .join("\n\n")
          .trim();
        const preview =
          text.length > fullDocumentPreviewLimit
            ? `${text.slice(0, fullDocumentPreviewLimit).trimEnd()}\n\n[Preview truncated]`
            : text;

        setOutputKind("document");
        setOutputText(preview);
        setCharacterCount(text.length);
        setDefinedTerms([]);
        setMessage(text ? "Full document preview:" : "This document appears to be empty.");
      });
    } catch (error) {
      console.error("Unable to read full document.", error);
      setOutputKind("document");
      setOutputText("");
      setCharacterCount(null);
      setDefinedTerms([]);
      setMessage("Contractr could not read the full document. Please check that a Word document is open and try again.");
    }
  }

  async function analyzeFullDocumentDefinedTerms() {
    if (officeState !== "ready") {
      return;
    }

    try {
      await Word.run(async (context) => {
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load("items/text");

        await context.sync();

        const text = paragraphs.items
          .map((paragraph) => paragraph.text.trimEnd())
          .join("\n\n")
          .trim();
        const results = analyzeDefinedTerms(text);

        setOutputKind("definedTerms");
        setOutputText("");
        setCharacterCount(text.length);
        setDefinedTerms(results);
        setMessage(
          results.length
            ? `Found ${results.length.toLocaleString()} likely defined term${results.length === 1 ? "" : "s"}.`
            : "No likely defined terms were found using the current deterministic patterns.",
        );
      });
    } catch (error) {
      console.error("Unable to analyze defined terms.", error);
      setOutputKind("definedTerms");
      setOutputText("");
      setCharacterCount(null);
      setDefinedTerms([]);
      setMessage("Contractr could not analyze defined terms. Please check that a Word document is open and try again.");
    }
  }

  return (
    <main className="app-shell">
      <section className="header">
        <p className="eyebrow">Word add-in</p>
        <h1>Contractr</h1>
      </section>

      <button className="primary-button" disabled={officeState !== "ready"} onClick={readSelectedText}>
        Read Selected Text
      </button>
      <button className="secondary-button" disabled={officeState !== "ready"} onClick={readFullDocument}>
        Read Full Document
      </button>
      <button className="secondary-button" disabled={officeState !== "ready"} onClick={analyzeFullDocumentDefinedTerms}>
        Analyze Defined Terms
      </button>

      <section className="output" aria-live="polite">
        <p className="status">{message}</p>
        {(outputKind === "document" || outputKind === "definedTerms") && characterCount !== null ? (
          <p className="count">{characterCount.toLocaleString()} characters</p>
        ) : null}
        {outputKind === "definedTerms" && definedTerms.length ? (
          <ol className="defined-term-list">
            {definedTerms.map((result) => (
              <li className="defined-term-item" key={result.term}>
                <h2>{result.term}</h2>
                <p className="term-meta">
                  {result.confidenceLabel}: <strong>{result.patternLabel}</strong>
                </p>
                <p className="term-meta">
                  Potential usage count: <strong>{result.usageCount.toLocaleString()}</strong>
                </p>
                <p className="definition-label">Likely source paragraph</p>
                <p className="definition-text">{result.definitionText}</p>
              </li>
            ))}
          </ol>
        ) : null}
        {outputText ? <pre>{outputText}</pre> : null}
      </section>
    </main>
  );
}
