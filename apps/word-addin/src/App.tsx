import { useEffect, useState } from "react";
import { extractDefinedTerms, type DefinedTermResult } from "@contractr/contract-core";

type OfficeState = "loading" | "ready" | "unavailable";
type OutputKind = "selected" | "document" | "definedTerms";

const fullDocumentPreviewLimit = 2500;

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
        const results = extractDefinedTerms(text);

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
                {result.detectedVariants.length > 1 ? (
                  <p className="term-meta">
                    Detected variants: <strong>{result.detectedVariants.join(", ")}</strong>
                  </p>
                ) : null}
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
