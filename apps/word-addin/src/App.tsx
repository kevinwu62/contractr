import { useEffect, useState } from "react";
import {
  extractDefinedTerms,
  findDefinedButUnusedTerms,
  findPotentialUndefinedTerms,
  findSimilarDefinedTerms,
  type DefinedTermResult,
  type FindPotentialUndefinedTermsResult,
  type SimilarDefinedTermsResult,
} from "@contractr/contract-core";

type OfficeState = "loading" | "ready" | "unavailable";
type OutputKind = "selected" | "document" | "definedTerms";

const fullDocumentPreviewLimit = 2500;

type PotentialIssues = {
  definedButUnusedTerms: DefinedTermResult[];
  potentialUndefinedTerms: FindPotentialUndefinedTermsResult[];
  similarDefinedTerms: SimilarDefinedTermsResult[];
};

type NavigationTarget = {
  candidates: string[];
  successMessage: string;
};

const wordSearchCandidateLimit = 240;

const emptyPotentialIssues: PotentialIssues = {
  definedButUnusedTerms: [],
  potentialUndefinedTerms: [],
  similarDefinedTerms: [],
};

function uniqueNonEmptyTexts(values: string[]) {
  return Array.from(new Set(values.map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean)));
}

function getSearchableTexts(values: string[]) {
  return uniqueNonEmptyTexts(values).filter((value) => value.length <= wordSearchCandidateLimit);
}

function getDefinitionSourceSnippets(result: DefinedTermResult) {
  const terms = getSearchableTexts([result.term, ...result.detectedVariants]).map((term) => term.toLocaleLowerCase());
  const snippets: string[] = [];
  const sourceSnippetPattern =
    /\(\s*(?:the\s+)?["“][^"”\n]{1,120}["”]\s*\)|["“][^"”\n]{1,120}["”]\s+(?:means|shall mean|has the meaning|refers to)\b/gi;

  for (const sourceText of result.sourceTexts) {
    for (const match of sourceText.matchAll(sourceSnippetPattern)) {
      const snippet = match[0];
      const normalizedSnippet = snippet.toLocaleLowerCase();

      if (terms.some((term) => normalizedSnippet.includes(term))) {
        snippets.push(snippet);
      }
    }
  }

  return snippets;
}

function getDefinitionSourceContextCandidates(result: DefinedTermResult) {
  const snippets = getDefinitionSourceSnippets(result);
  const candidates: string[] = [];
  const contextCharacterLimit = wordSearchCandidateLimit;

  for (const sourceText of result.sourceTexts) {
    candidates.push(sourceText);

    for (const snippet of snippets) {
      const snippetStart = sourceText.indexOf(snippet);

      if (snippetStart === -1) {
        continue;
      }

      const extraCharacterCount = Math.max(0, contextCharacterLimit - snippet.length);
      const contextStart = Math.max(0, snippetStart - Math.floor(extraCharacterCount / 2));
      const contextEnd = Math.min(sourceText.length, snippetStart + snippet.length + Math.ceil(extraCharacterCount / 2));

      candidates.push(sourceText.slice(contextStart, contextEnd));
    }
  }

  return getSearchableTexts(candidates);
}

function getParentheticalDefinitionCandidates(result: DefinedTermResult) {
  return getSearchableTexts([result.term, ...result.detectedVariants]).flatMap((term) => [
    `(the "${term}")`,
    `("${term}")`,
    `(the “${term}”)`,
    `(“${term}”)`,
  ]);
}

function getExplicitDefinitionCandidates(result: DefinedTermResult) {
  return getSearchableTexts([result.term, ...result.detectedVariants]).flatMap((term) => [
    `"${term}" means`,
    `"${term}" shall mean`,
    `"${term}" has the meaning`,
    `"${term}" refers to`,
    `“${term}” means`,
    `“${term}” shall mean`,
    `“${term}” has the meaning`,
    `“${term}” refers to`,
  ]);
}

function getDefinitionNavigationTarget(result: DefinedTermResult): NavigationTarget {
  return {
    candidates: getSearchableTexts([
      ...getDefinitionSourceContextCandidates(result),
      ...getDefinitionSourceSnippets(result),
      ...getParentheticalDefinitionCandidates(result),
      ...getExplicitDefinitionCandidates(result),
      result.definitionText,
      ...result.sourceTexts,
      ...getUsageNavigationTarget(result).candidates,
    ]),
    successMessage: `Selected the likely definition for ${result.term}.`,
  };
}

function getUsageNavigationTarget(result: DefinedTermResult): NavigationTarget {
  return {
    candidates: getSearchableTexts([...result.detectedVariants, result.term]),
    successMessage: `Selected the first match for ${result.term}.`,
  };
}

function getTermNavigationTarget(term: string): NavigationTarget {
  return {
    candidates: getSearchableTexts([term]),
    successMessage: `Selected the first match for ${term}.`,
  };
}

export function App() {
  const [officeState, setOfficeState] = useState<OfficeState>("loading");
  const [outputText, setOutputText] = useState("");
  const [outputKind, setOutputKind] = useState<OutputKind>("selected");
  const [characterCount, setCharacterCount] = useState<number | null>(null);
  const [definedTerms, setDefinedTerms] = useState<DefinedTermResult[]>([]);
  const [potentialIssues, setPotentialIssues] = useState<PotentialIssues>(emptyPotentialIssues);
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
        setPotentialIssues(emptyPotentialIssues);
        setMessage(text ? "Selected text:" : "No text is selected. Select text in Word and try again.");
      });
    } catch (error) {
      console.error("Unable to read selected text.", error);
      setOutputKind("selected");
      setOutputText("");
      setCharacterCount(null);
      setDefinedTerms([]);
      setPotentialIssues(emptyPotentialIssues);
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
        setPotentialIssues(emptyPotentialIssues);
        setMessage(text ? "Full document preview:" : "This document appears to be empty.");
      });
    } catch (error) {
      console.error("Unable to read full document.", error);
      setOutputKind("document");
      setOutputText("");
      setCharacterCount(null);
      setDefinedTerms([]);
      setPotentialIssues(emptyPotentialIssues);
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
        const issues: PotentialIssues = {
          definedButUnusedTerms: findDefinedButUnusedTerms(text, results),
          potentialUndefinedTerms: findPotentialUndefinedTerms(text, results),
          similarDefinedTerms: findSimilarDefinedTerms(results),
        };

        setOutputKind("definedTerms");
        setOutputText("");
        setCharacterCount(text.length);
        setDefinedTerms(results);
        setPotentialIssues(issues);
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
      setPotentialIssues(emptyPotentialIssues);
      setMessage("Contractr could not analyze defined terms. Please check that a Word document is open and try again.");
    }
  }

  async function navigateToDocumentText(target: NavigationTarget) {
    if (officeState !== "ready") {
      return;
    }

    try {
      await Word.run(async (context) => {
        for (const candidate of target.candidates) {
          const matches = context.document.body.search(candidate, {
            ignorePunct: true,
            ignoreSpace: true,
            matchCase: false,
            matchWholeWord: false,
          });

          matches.load("items");
          await context.sync();

          if (matches.items.length > 0) {
            matches.items[0].select();
            await context.sync();
            setMessage(target.successMessage);
            return;
          }
        }

        setMessage("Contractr could not find that text in the current Word document.");
      });
    } catch (error) {
      console.error("Unable to navigate in the document.", error);
      setMessage("Contractr could not navigate to that text. Please try analyzing the document again.");
    }
  }

  const issueCount =
    potentialIssues.definedButUnusedTerms.length +
    potentialIssues.potentialUndefinedTerms.length +
    potentialIssues.similarDefinedTerms.length;

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
        {outputKind === "definedTerms" && (definedTerms.length || issueCount) ? (
          <>
            <section className="potential-issues" aria-labelledby="potential-issues-heading">
              <h2 id="potential-issues-heading">Potential Issues</h2>
              {issueCount ? (
                <>
                  {potentialIssues.definedButUnusedTerms.length ? (
                    <div className="issue-group">
                      <h3>Defined but unused</h3>
                      <ul>
                        {potentialIssues.definedButUnusedTerms.map((issue) => (
                          <li key={issue.term}>
                            <button
                              className="link-button issue-link"
                              type="button"
                              onClick={() => navigateToDocumentText(getDefinitionNavigationTarget(issue))}
                            >
                              {issue.term}
                            </button>
                            <span>Potentially no meaningful usage outside its own definition.</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {potentialIssues.potentialUndefinedTerms.length ? (
                    <div className="issue-group">
                      <h3>Potentially undefined</h3>
                      <ul>
                        {potentialIssues.potentialUndefinedTerms.map((issue) => (
                          <li key={issue.term}>
                            <button
                              className="link-button issue-link"
                              type="button"
                              onClick={() => navigateToDocumentText(getTermNavigationTarget(issue.term))}
                            >
                              {issue.term}
                            </button>
                            <span>
                              {issue.usageCount.toLocaleString()} appearances. {issue.reason}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {potentialIssues.similarDefinedTerms.length ? (
                    <div className="issue-group">
                      <h3>Similar-looking terms</h3>
                      <ul>
                        {potentialIssues.similarDefinedTerms.map((issue) => (
                          <li key={`${issue.firstTerm}-${issue.secondTerm}`}>
                            <button
                              className="link-button issue-link"
                              type="button"
                              onClick={() => navigateToDocumentText(getTermNavigationTarget(issue.firstTerm))}
                            >
                              {issue.firstTerm} / {issue.secondTerm}
                            </button>
                            <span>{issue.reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="term-meta">No potential defined-term issues found using the current deterministic checks.</p>
              )}
            </section>
            {definedTerms.length ? (
              <ol className="defined-term-list">
                {definedTerms.map((result) => (
                  <li className="defined-term-item" key={result.term}>
                    <h2>
                      <button
                        className="link-button defined-term-link"
                        type="button"
                        onClick={() => navigateToDocumentText(getDefinitionNavigationTarget(result))}
                      >
                        {result.term}
                      </button>
                    </h2>
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
                    {result.usageCount > 0 ? (
                      <button
                        className="small-action-button"
                        type="button"
                        onClick={() => navigateToDocumentText(getUsageNavigationTarget(result))}
                      >
                        Jump to first usage
                      </button>
                    ) : null}
                    <p className="definition-label">Likely source paragraph</p>
                    <p className="definition-text">{result.definitionText}</p>
                  </li>
                ))}
              </ol>
            ) : null}
          </>
        ) : null}
        {outputText ? <pre>{outputText}</pre> : null}
      </section>
    </main>
  );
}
