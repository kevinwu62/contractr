import { useEffect, useRef, useState } from "react";
import { MockProvider, type ClauseAnalysisResult } from "@contractr/ai-adapters";
import {
  extractDefinedTerms,
  extractPotentialObligations,
  findDefinedButUnusedTerms,
  findPotentialBrokenReferences,
  findPotentialUndefinedTerms,
  findSimilarDefinedTerms,
  type DefinedTermResult,
  type FindPotentialUndefinedTermsResult,
  type PotentialObligation,
  type PotentialBrokenReference,
  type SimilarDefinedTermsResult,
} from "@contractr/contract-core";

type OfficeState = "loading" | "ready" | "unavailable";
type ActiveMode = "selectR" | "analyzR";
type OutputKind = "selected" | "document" | "definedTerms" | "crossReferences" | "obligations" | "clauseExplanation";
type ActiveAction =
  | "readSelected"
  | "readDocument"
  | "analyzeDefinedTerms"
  | "analyzeCrossReferences"
  | "analyzeObligations"
  | "explainSelectedClause"
  | "navigate";

const fullDocumentPreviewLimit = 2500;
const selectedClausePreviewLimit = 1200;
const liveSelectionPollIntervalMs = 2000;
const aiProvider = new MockProvider();

type PotentialIssues = {
  definedButUnusedTerms: DefinedTermResult[];
  potentialUndefinedTerms: FindPotentialUndefinedTermsResult[];
  similarDefinedTerms: SimilarDefinedTermsResult[];
};

type CrossReferenceIssues = {
  potentialBrokenReferences: PotentialBrokenReference[];
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

const emptyCrossReferenceIssues: CrossReferenceIssues = {
  potentialBrokenReferences: [],
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
  const [activeMode, setActiveMode] = useState<ActiveMode>("selectR");
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);
  const [outputText, setOutputText] = useState("");
  const [outputKind, setOutputKind] = useState<OutputKind>("selected");
  const [characterCount, setCharacterCount] = useState<number | null>(null);
  const [definedTerms, setDefinedTerms] = useState<DefinedTermResult[]>([]);
  const [potentialIssues, setPotentialIssues] = useState<PotentialIssues>(emptyPotentialIssues);
  const [crossReferenceIssues, setCrossReferenceIssues] = useState<CrossReferenceIssues>(emptyCrossReferenceIssues);
  const [potentialObligations, setPotentialObligations] = useState<PotentialObligation[]>([]);
  const [clauseExplanation, setClauseExplanation] = useState<ClauseAnalysisResult | null>(null);
  const [clauseExplanationSelectedText, setClauseExplanationSelectedText] = useState("");
  const [currentSelectionText, setCurrentSelectionText] = useState("");
  const [currentSelectionError, setCurrentSelectionError] = useState("");
  const [hasAnalyzedDefinedTerms, setHasAnalyzedDefinedTerms] = useState(false);
  const [hasAnalyzedCrossReferences, setHasAnalyzedCrossReferences] = useState(false);
  const [hasAnalyzedObligations, setHasAnalyzedObligations] = useState(false);
  const [message, setMessage] = useState("Select text in Word, then click the button.");
  const isSelectionRefreshRunningRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const markOfficeUnavailable = (nextMessage: string) => {
      if (!isMounted) {
        return;
      }

      setOfficeState("unavailable");
      setActiveAction(null);
      setMessage(nextMessage);
    };

    if (!window.Office) {
      markOfficeUnavailable("Open this task pane inside Microsoft Word to use Contractr.");
      return () => {
        isMounted = false;
      };
    }

    const readinessTimer = window.setTimeout(() => {
      markOfficeUnavailable(
        "Contractr is waiting for Microsoft Word. If the add-in just opened, wait a moment or reload the task pane.",
      );
    }, 8000);

    Office.onReady()
      .then((info) => {
        if (!isMounted) {
          return;
        }

        window.clearTimeout(readinessTimer);

        if (info.host === Office.HostType.Word) {
          setOfficeState("ready");
          setMessage("Select text in Word, then click the button.");
        } else {
          markOfficeUnavailable("Contractr is intended to run inside Microsoft Word.");
        }
      })
      .catch((error) => {
        console.error("Office initialization failed.", error);
        window.clearTimeout(readinessTimer);
        markOfficeUnavailable("Contractr could not initialize Office.js. Reload the task pane after Word is ready.");
      });

    return () => {
      isMounted = false;
      window.clearTimeout(readinessTimer);
    };
  }, []);

  async function readDocumentText() {
    let text = "";

    await Word.run(async (context) => {
      const paragraphs = context.document.body.paragraphs;
      paragraphs.load("items/text");

      await context.sync();

      text = paragraphs.items
        .map((paragraph) => paragraph.text.trimEnd())
        .join("\n\n")
        .trim();
    });

    return text;
  }

  async function readSelectedTextFromWord() {
    let text = "";

    await Word.run(async (context) => {
      const selection = context.document.getSelection();
      selection.load("text");

      await context.sync();

      text = selection.text.trim();
    });

    return text;
  }

  async function refreshCurrentSelectionPreview() {
    if (officeState !== "ready" || activeMode !== "selectR" || isSelectionRefreshRunningRef.current) {
      return;
    }

    isSelectionRefreshRunningRef.current = true;

    try {
      const text = await readSelectedTextFromWord();

      setCurrentSelectionText((previousText) => (previousText === text ? previousText : text));
      setCurrentSelectionError("");
    } catch (error) {
      console.error("Unable to refresh current selection preview.", error);
      setCurrentSelectionError("Contractr could not refresh the current selection preview.");
    } finally {
      isSelectionRefreshRunningRef.current = false;
    }
  }

  useEffect(() => {
    if (officeState !== "ready" || activeMode !== "selectR" || !window.Office?.context?.document) {
      return;
    }

    let isMounted = true;
    const handleSelectionChanged = () => {
      if (isMounted) {
        void refreshCurrentSelectionPreview();
      }
    };

    void refreshCurrentSelectionPreview();

    try {
      Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, handleSelectionChanged, (result) => {
        if (result.status === Office.AsyncResultStatus.Failed) {
          console.warn("Office selection change event was not registered.", result.error);
        }
      });
    } catch (error) {
      console.warn("Office selection change event is not available in this Word host.", error);
    }

    const pollSelectionTimer = window.setInterval(() => {
      if (isMounted) {
        void refreshCurrentSelectionPreview();
      }
    }, liveSelectionPollIntervalMs);

    return () => {
      isMounted = false;
      window.clearInterval(pollSelectionTimer);

      try {
        Office.context.document.removeHandlerAsync(Office.EventType.DocumentSelectionChanged, { handler: handleSelectionChanged });
      } catch (error) {
        console.warn("Office selection change event cleanup was skipped.", error);
      }
    };
  }, [activeMode, officeState]);

  function resetAnalysisResults() {
    setDefinedTerms([]);
    setPotentialIssues(emptyPotentialIssues);
    setCrossReferenceIssues(emptyCrossReferenceIssues);
    setPotentialObligations([]);
    setClauseExplanation(null);
    setClauseExplanationSelectedText("");
    setHasAnalyzedDefinedTerms(false);
    setHasAnalyzedCrossReferences(false);
    setHasAnalyzedObligations(false);
  }

  function canStartAction() {
    return officeState === "ready" && activeAction === null;
  }

  function isActionButtonDisabled(action: ActiveAction) {
    return officeState !== "ready" || activeAction === action;
  }

  function getButtonLabel(action: ActiveAction, idleLabel: string) {
    return activeAction === action ? "Working..." : idleLabel;
  }

  function getReadyMessage() {
    if (officeState === "loading") {
      return "Contractr is connecting to Microsoft Word...";
    }

    if (officeState === "unavailable") {
      return message;
    }

    return null;
  }

  function clearActiveAction(action: ActiveAction) {
    setActiveAction((currentAction) => {
      if (currentAction === action) {
        return null;
      }

      return currentAction;
    });
  }

  async function readSelectedText() {
    if (!canStartAction()) {
      return;
    }

    setActiveAction("readSelected");

    try {
      const text = await readSelectedTextFromWord();

      setCurrentSelectionText(text);
      setOutputKind("selected");
      setOutputText(text);
      setCharacterCount(null);
      resetAnalysisResults();
      setMessage(text ? "Selected text:" : "No text is selected. Select text in Word and try again.");
    } catch (error) {
      console.error("Unable to read selected text.", error);
      setOutputKind("selected");
      setOutputText("");
      setCurrentSelectionText("");
      setCharacterCount(null);
      setDefinedTerms([]);
      setPotentialIssues(emptyPotentialIssues);
      setCrossReferenceIssues(emptyCrossReferenceIssues);
      setPotentialObligations([]);
      setClauseExplanation(null);
      setClauseExplanationSelectedText("");
      setHasAnalyzedDefinedTerms(false);
      setHasAnalyzedCrossReferences(false);
      setHasAnalyzedObligations(false);
      setMessage("Contractr could not read the selected text. Please try again.");
    } finally {
      clearActiveAction("readSelected");
    }
  }

  async function readFullDocument() {
    if (!canStartAction()) {
      return;
    }

    setActiveAction("readDocument");

    try {
      const text = await readDocumentText();
      const preview =
        text.length > fullDocumentPreviewLimit
          ? `${text.slice(0, fullDocumentPreviewLimit).trimEnd()}\n\n[Preview truncated]`
          : text;

      setOutputKind("document");
      setOutputText(preview);
      setCharacterCount(text.length);
      resetAnalysisResults();
      setMessage(text ? "Full document preview:" : "This document appears to be empty.");
    } catch (error) {
      console.error("Unable to read full document.", error);
      setOutputKind("document");
      setOutputText("");
      setCharacterCount(null);
      setDefinedTerms([]);
      setPotentialIssues(emptyPotentialIssues);
      setCrossReferenceIssues(emptyCrossReferenceIssues);
      setPotentialObligations([]);
      setClauseExplanation(null);
      setClauseExplanationSelectedText("");
      setHasAnalyzedDefinedTerms(false);
      setHasAnalyzedCrossReferences(false);
      setHasAnalyzedObligations(false);
      setMessage("Contractr could not read the full document. Please check that a Word document is open and try again.");
    } finally {
      clearActiveAction("readDocument");
    }
  }

  async function analyzeFullDocumentDefinedTerms() {
    if (!canStartAction()) {
      return;
    }

    setActiveAction("analyzeDefinedTerms");

    try {
      const text = await readDocumentText();
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
      setHasAnalyzedDefinedTerms(true);
      setMessage(
        results.length
          ? `Found ${results.length.toLocaleString()} likely defined term${results.length === 1 ? "" : "s"}.`
          : "No likely defined terms were found using the current deterministic patterns.",
      );
    } catch (error) {
      console.error("Unable to analyze defined terms.", error);
      setOutputKind("definedTerms");
      setOutputText("");
      setCharacterCount(null);
      setDefinedTerms([]);
      setPotentialIssues(emptyPotentialIssues);
      setHasAnalyzedDefinedTerms(false);
      setMessage("Contractr could not analyze defined terms. Please check that a Word document is open and try again.");
    } finally {
      clearActiveAction("analyzeDefinedTerms");
    }
  }

  async function analyzeFullDocumentCrossReferences() {
    if (!canStartAction()) {
      return;
    }

    setActiveAction("analyzeCrossReferences");

    try {
      const text = await readDocumentText();
      const referenceIssues: CrossReferenceIssues = {
        potentialBrokenReferences: findPotentialBrokenReferences(text),
      };

      setOutputKind("crossReferences");
      setOutputText("");
      setCharacterCount(text.length);
      setCrossReferenceIssues(referenceIssues);
      setHasAnalyzedCrossReferences(true);
      setMessage(
        referenceIssues.potentialBrokenReferences.length
          ? `Found ${referenceIssues.potentialBrokenReferences.length.toLocaleString()} potential broken reference${
              referenceIssues.potentialBrokenReferences.length === 1 ? "" : "s"
            }.`
          : "No potential broken cross-references found using the current deterministic checks.",
      );
    } catch (error) {
      console.error("Unable to analyze cross-references.", error);
      setOutputKind("crossReferences");
      setOutputText("");
      setCharacterCount(null);
      setCrossReferenceIssues(emptyCrossReferenceIssues);
      setHasAnalyzedCrossReferences(false);
      setMessage("Contractr could not analyze cross-references. Please check that a Word document is open and try again.");
    } finally {
      clearActiveAction("analyzeCrossReferences");
    }
  }

  async function analyzeFullDocumentObligations() {
    if (!canStartAction()) {
      return;
    }

    setActiveAction("analyzeObligations");

    try {
      const text = await readDocumentText();
      const results = extractPotentialObligations(text);

      setOutputKind("obligations");
      setOutputText("");
      setCharacterCount(text.length);
      setPotentialObligations(results);
      setHasAnalyzedObligations(true);
      setMessage(
        results.length
          ? `Found ${results.length.toLocaleString()} potential obligation${results.length === 1 ? "" : "s"}.`
          : "No potential obligations were found using the current deterministic patterns.",
      );
    } catch (error) {
      console.error("Unable to analyze obligations.", error);
      setOutputKind("obligations");
      setOutputText("");
      setCharacterCount(null);
      setPotentialObligations([]);
      setHasAnalyzedObligations(false);
      setMessage("Contractr could not analyze obligations. Please check that a Word document is open and try again.");
    } finally {
      clearActiveAction("analyzeObligations");
    }
  }

  async function explainSelectedClause() {
    if (!canStartAction()) {
      return;
    }

    setActiveAction("explainSelectedClause");

    try {
      const text = await readSelectedTextFromWord();

      setCurrentSelectionText(text);
      setOutputKind("clauseExplanation");
      setOutputText("");
      setCharacterCount(null);

      if (!text) {
        setClauseExplanation(null);
        setClauseExplanationSelectedText("");
        setMessage("No clause text is selected. Select a clause in Word and try again.");
        return;
      }

      const result = await aiProvider.explainClause({ selectedText: text });

      setClauseExplanation(result);
      setClauseExplanationSelectedText(text);
      setMessage("Mock clause explanation:");
    } catch (error) {
      console.error("Unable to explain selected clause with the mock provider.", error);
      setOutputKind("clauseExplanation");
      setOutputText("");
      setCharacterCount(null);
      setClauseExplanation(null);
      setClauseExplanationSelectedText("");
      setMessage("Contractr could not explain the selected clause with the mock provider. Please try again.");
    } finally {
      clearActiveAction("explainSelectedClause");
    }
  }

  async function navigateToDocumentText(target: NavigationTarget) {
    if (!canStartAction()) {
      return;
    }

    setActiveAction("navigate");

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
    } finally {
      clearActiveAction("navigate");
    }
  }

  const issueCount =
    potentialIssues.definedButUnusedTerms.length +
    potentialIssues.potentialUndefinedTerms.length +
    potentialIssues.similarDefinedTerms.length;
  const crossReferenceIssueCount = crossReferenceIssues.potentialBrokenReferences.length;
  const shouldShowMockExplanation = activeMode === "selectR" || outputKind === "clauseExplanation" || clauseExplanation;
  const shouldShowDocumentAnalysis =
    activeMode === "analyzR" ||
    outputKind === "definedTerms" ||
    outputKind === "crossReferences" ||
    outputKind === "obligations" ||
    hasAnalyzedDefinedTerms ||
    hasAnalyzedCrossReferences ||
    hasAnalyzedObligations;

  return (
    <main className="app-shell">
      <section className="header">
        <p className="eyebrow">Word add-in</p>
        <h1>Contractr</h1>
      </section>

      {getReadyMessage() ? <p className="status">{getReadyMessage()}</p> : null}

      <section className="mode-switch" aria-label="Contractr mode">
        <button
          className={`mode-button${activeMode === "selectR" ? " mode-button-active" : ""}`}
          type="button"
          aria-pressed={activeMode === "selectR"}
          onClick={() => setActiveMode("selectR")}
        >
          selectR
        </button>
        <button
          className={`mode-button${activeMode === "analyzR" ? " mode-button-active" : ""}`}
          type="button"
          aria-pressed={activeMode === "analyzR"}
          onClick={() => setActiveMode("analyzR")}
        >
          analyzR
        </button>
      </section>

      {activeMode === "selectR" ? (
        <section className="tool-group" aria-labelledby="selectr-heading">
          <h2 id="selectr-heading">selectR</h2>
          <p className="mode-description">selectR tools act on the text currently selected in Word.</p>
          <section className="current-selection" aria-labelledby="current-selection-heading">
            <h3 id="current-selection-heading">Current Selection</h3>
            {currentSelectionError ? <p className="term-meta">{currentSelectionError}</p> : null}
            {currentSelectionText ? (
              <>
                <p className="definition-text">
                  {currentSelectionText.length > selectedClausePreviewLimit
                    ? `${currentSelectionText.slice(0, selectedClausePreviewLimit).trimEnd()}...`
                    : currentSelectionText}
                </p>
                <p className="term-meta">{currentSelectionText.length.toLocaleString()} characters</p>
                <p className="term-meta">Actions will use this selected text only.</p>
              </>
            ) : (
              <p className="term-meta">Select text in Word to see context-aware options.</p>
            )}
          </section>
          <button className="primary-button" disabled={isActionButtonDisabled("readSelected")} onClick={readSelectedText}>
            {getButtonLabel("readSelected", "Read Selected Text")}
          </button>
          <button
            className="secondary-button"
            disabled={isActionButtonDisabled("explainSelectedClause")}
            onClick={explainSelectedClause}
          >
            {getButtonLabel("explainSelectedClause", "Explain Selected Clause")}
          </button>
        </section>
      ) : (
        <section className="tool-group" aria-labelledby="analyzr-heading">
          <h2 id="analyzr-heading">analyzR</h2>
          <p className="mode-description">analyzR tools read the current Word document for deterministic analysis.</p>
          <button className="primary-button" disabled={isActionButtonDisabled("readDocument")} onClick={readFullDocument}>
            {getButtonLabel("readDocument", "Read Full Document")}
          </button>
          <button
            className="secondary-button"
            disabled={isActionButtonDisabled("analyzeDefinedTerms")}
            onClick={analyzeFullDocumentDefinedTerms}
          >
            {getButtonLabel("analyzeDefinedTerms", "Analyze Defined Terms")}
          </button>
          <button
            className="secondary-button"
            disabled={isActionButtonDisabled("analyzeCrossReferences")}
            onClick={analyzeFullDocumentCrossReferences}
          >
            {getButtonLabel("analyzeCrossReferences", "Analyze Cross-References")}
          </button>
          <button
            className="secondary-button"
            disabled={isActionButtonDisabled("analyzeObligations")}
            onClick={analyzeFullDocumentObligations}
          >
            {getButtonLabel("analyzeObligations", "Analyze Obligations")}
          </button>
        </section>
      )}

      <section className="output" aria-live="polite">
        <p className="status">{message}</p>
        {(outputKind === "document" ||
          outputKind === "definedTerms" ||
          outputKind === "crossReferences" ||
          outputKind === "obligations") &&
        characterCount !== null ? (
          <p className="count">{characterCount.toLocaleString()} characters</p>
        ) : null}
        {shouldShowMockExplanation ? (
          <section className="mock-explanation" aria-labelledby="mock-clause-explanation-heading">
            <h2 id="mock-clause-explanation-heading">Mock Clause Explanation</h2>
            <p className="mock-label">Mock output only — no real AI provider was called.</p>
            {!clauseExplanation ? (
              <p className="term-meta">Select a clause and click Explain Selected Clause to test the mock AI adapter.</p>
            ) : (
              <>
                <p className="definition-label">Selected text preview</p>
                <p className="definition-text">
                  {clauseExplanationSelectedText.length > selectedClausePreviewLimit
                    ? `${clauseExplanationSelectedText.slice(0, selectedClausePreviewLimit).trimEnd()}...`
                    : clauseExplanationSelectedText}
                </p>
                <p className="definition-label">Mock summary</p>
                <p className="definition-text">{clauseExplanation.summary}</p>
                <p className="definition-label">Mock explanation</p>
                <p className="definition-text">{clauseExplanation.explanation}</p>
                <div className="issue-group">
                  <h3>Mock review points</h3>
                  <ul>
                    {clauseExplanation.reviewPoints.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </div>
                <div className="issue-group">
                  <h3>Mock safety notes</h3>
                  <ul>
                    {clauseExplanation.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </section>
        ) : null}
        {shouldShowDocumentAnalysis ? (
          <>
            <section className="potential-issues" aria-labelledby="potential-obligations-heading">
              <h2 id="potential-obligations-heading">Potential Obligations</h2>
              {!hasAnalyzedObligations ? (
                <p className="term-meta">Run Analyze Obligations to check likely duties and timing requirements.</p>
              ) : potentialObligations.length ? (
                <ol className="defined-term-list">
                  {potentialObligations.map((obligation, index) => (
                    <li className="defined-term-item" key={`${obligation.obligationText}-${index}`}>
                      <h2>
                        <button
                          className="link-button defined-term-link"
                          type="button"
                          disabled={activeAction === "navigate"}
                          onClick={() => navigateToDocumentText(getTermNavigationTarget(obligation.sourceNavigationText))}
                        >
                          {obligation.responsibleParty ?? "Possible responsible party not detected"}
                        </button>
                      </h2>
                      <p className="term-meta">
                        Trigger: <strong>{obligation.triggerText}</strong>
                      </p>
                      {obligation.sourceReference ? (
                        <p className="term-meta">
                          Source: <strong>{obligation.sourceReference}</strong>
                        </p>
                      ) : null}
                      {obligation.deadlineOrTiming ? (
                        <p className="term-meta">
                          Timing: <strong>{obligation.deadlineOrTiming}</strong>
                        </p>
                      ) : null}
                      <p className="definition-label">Potential obligation text</p>
                      <p className="definition-text">{obligation.obligationText}</p>
                      <p className="definition-label">Source snippet</p>
                      <p className="definition-text">{obligation.sourceText}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="term-meta">No potential obligations were found using the current deterministic patterns.</p>
              )}
            </section>
            <section className="potential-issues" aria-labelledby="cross-reference-issues-heading">
              <h2 id="cross-reference-issues-heading">Cross-Reference Issues</h2>
              {!hasAnalyzedCrossReferences ? (
                <p className="term-meta">Run Analyze Cross-References to check section and schedule references.</p>
              ) : crossReferenceIssueCount ? (
                <div className="issue-group">
                  <h3>Potential Broken References</h3>
                  <ul>
                    {crossReferenceIssues.potentialBrokenReferences.map((issue, index) => (
                      <li key={`${issue.referenceText}-${index}`}>
                        <button
                          className="link-button issue-link"
                          type="button"
                          onClick={() => navigateToDocumentText(getTermNavigationTarget(issue.sourceNavigationText))}
                        >
                          {issue.referenceText}
                        </button>
                        <span>
                          {issue.reason} Source: {issue.sourceText}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="term-meta">No potential broken cross-references found using the current deterministic checks.</p>
              )}
            </section>
            <section className="potential-issues" aria-labelledby="potential-issues-heading">
              <h2 id="potential-issues-heading">Potential Issues</h2>
              {!hasAnalyzedDefinedTerms ? (
                <p className="term-meta">Run Analyze Defined Terms to check defined-term issues.</p>
              ) : issueCount ? (
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
            <section aria-labelledby="defined-terms-heading">
              <h2 id="defined-terms-heading">Defined Terms</h2>
              {!hasAnalyzedDefinedTerms ? (
                <p className="term-meta">Run Analyze Defined Terms to list likely defined terms.</p>
              ) : definedTerms.length ? (
                <ol className="defined-term-list">
                  {definedTerms.map((result) => (
                    <li className="defined-term-item" key={result.term}>
                      <h2>
                        <button
                          className="link-button defined-term-link"
                          type="button"
                          disabled={activeAction === "navigate"}
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
                          disabled={activeAction === "navigate"}
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
              ) : (
                <p className="term-meta">No likely defined terms were found using the current deterministic patterns.</p>
              )}
            </section>
          </>
        ) : null}
        {outputText ? <pre>{outputText}</pre> : null}
      </section>
    </main>
  );
}
