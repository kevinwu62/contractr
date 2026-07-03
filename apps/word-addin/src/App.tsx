import { useEffect, useMemo, useRef, useState } from "react";
import { MockProvider, type ClauseAnalysisResult } from "@contractr/ai-adapters";
import {
  detectKeyClauses,
  extractDefinedTerms,
  extractContractLayout,
  extractDocumentStats,
  extractGoverningLaw,
  extractKeyDates,
  extractParties,
  detectSelectionContext,
  extractPotentialObligations,
  findCrossReferenceTarget,
  findDefinedButUnusedTerms,
  findPotentialBrokenReferences,
  findPotentialUndefinedTerms,
  findSimilarDefinedTerms,
  type CrossReferenceTarget,
  type CrossReferenceType,
  type ContractLayout,
  type DefinedTermResult,
  type DetectedParty,
  type DocumentStats,
  type FindPotentialUndefinedTermsResult,
  type GoverningLawResult,
  type KeyClause,
  type KeyDate,
  type PotentialObligation,
  type PotentialBrokenReference,
  type SelectionActionId,
  type SelectionAvailableAction,
  type SelectionContext,
  type SimilarDefinedTermsResult,
} from "@contractr/contract-core";
import { readSelectedTextFromWordSelection } from "./wordSelection";

type OfficeState = "loading" | "ready" | "unavailable";
type ActiveMode = "selectR" | "analyzR";
type OutputKind = "selected" | "document" | "definedTerms" | "crossReferences" | "obligations" | "contractAnalysis";
type AnalysisSubtab =
  | "parties"
  | "layout"
  | "summary"
  | "dates"
  | "definedTerms"
  | "obligations"
  | "issues"
  | "keyClauses"
  | "documentStats";
type ActiveAction =
  | "readSelected"
  | "readDocument"
  | "analyzeContract"
  | "analyzeDefinedTerms"
  | "analyzeCrossReferences"
  | "analyzeObligations"
  | "explainSelectedClause"
  | "navigate";

const fullDocumentPreviewLimit = 2500;
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

type ContractDashboard = {
  parties: DetectedParty[];
  layout: ContractLayout;
  dates: KeyDate[];
  stats: DocumentStats;
  governingLaw: GoverningLawResult;
  keyClauses: KeyClause[];
  mockSummary: ClauseAnalysisResult;
  analyzedAt: string;
};

type SelectRCardBase = {
  id: string;
  actionId: SelectionActionId;
  actionLabel: string;
  title: string;
  selectedTextSnapshot: string;
  analysisTextSnapshot: string;
  detectedElementsSnapshot: SelectionContext;
  selectionVersion: number;
  isPinned: boolean;
};

type SelectRDefinedTermsCard = SelectRCardBase & {
  type: "definedTerms";
  result: {
    confirmedDefinedTerms: Array<SelectionContext["confirmedDefinedTerms"][number] & { definitionText: string }>;
    definedTermCandidates: SelectionContext["definedTermCandidates"];
  };
};

type SelectRObligationsCard = SelectRCardBase & {
  type: "obligations";
  result: {
    potentialObligations: PotentialObligation[];
    obligationSignals: SelectionContext["obligationSignals"];
  };
};

type SelectRMockEditCard = SelectRCardBase & {
  type: "mockEdit";
  result: {
    summary: string;
    notes: string[];
  };
};

type SelectRMockExplanationCard = SelectRCardBase & {
  type: "mockExplanation";
  result: ClauseAnalysisResult;
};

type SelectRSectionReferenceCard = SelectRCardBase & {
  type: "sectionReference";
  result: {
    referenceText: string;
    referenceType: CrossReferenceType;
    headingText?: string;
    extractedText?: string;
    isApproximate: boolean;
    message: string;
  };
};

type SelectRPlaceholderCard = SelectRCardBase & {
  type: "placeholder";
  result: {
    message: string;
  };
};

type SelectRCard =
  | SelectRDefinedTermsCard
  | SelectRObligationsCard
  | SelectRMockEditCard
  | SelectRMockExplanationCard
  | SelectRSectionReferenceCard
  | SelectRPlaceholderCard;

type NavigationTarget = {
  candidates: string[];
  successMessage: string;
};

type SelectRActionGroupId =
  | "goSection"
  | "openSection"
  | "defineTerms"
  | "analyzeObligations"
  | "explainClause"
  | "aiEdit";

type SelectRReferenceTarget = SelectionContext["references"][number];

type SelectRActionGroup = {
  id: SelectRActionGroupId;
  label: string;
  action?: SelectionAvailableAction;
  targets?: SelectRReferenceTarget[];
  status: "available" | "mockOnly" | "unavailable";
  reason: string;
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

const analysisSubtabs: Array<{ id: AnalysisSubtab; label: string }> = [
  { id: "parties", label: "Parties" },
  { id: "layout", label: "Layout" },
  { id: "summary", label: "Summary" },
  { id: "dates", label: "Dates" },
  { id: "definedTerms", label: "Defined Terms" },
  { id: "obligations", label: "Obligations" },
  { id: "issues", label: "Issues" },
  { id: "keyClauses", label: "Key Clauses" },
  { id: "documentStats", label: "Document Stats" },
];

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

function cloneSelectionContext(context: SelectionContext): SelectionContext {
  return {
    normalizedText: context.normalizedText,
    references: context.references.map((reference) => ({ ...reference })),
    confirmedDefinedTerms: context.confirmedDefinedTerms.map((definedTerm) => ({ ...definedTerm })),
    definedTermCandidates: context.definedTermCandidates.map((candidate) => ({ ...candidate })),
    obligationSignals: context.obligationSignals.map((signal) => ({ ...signal })),
    isClauseLike: context.isClauseLike,
    availableActions: context.availableActions.map((availableAction) => ({ ...availableAction })),
  };
}

function getFirstSelectionReference(context: SelectionContext) {
  return context.references[0] ?? null;
}

function getReferenceTypeLabel(type: CrossReferenceType) {
  return type.charAt(0).toLocaleUpperCase() + type.slice(1);
}

function getReferenceNavigationMessage(target: CrossReferenceTarget) {
  return `Selected the likely ${target.type} heading for ${target.referenceText}.`;
}

function getReferenceButtonLabel(reference: SelectRReferenceTarget) {
  return reference.referenceText;
}

function getReferenceTargetButtonLabel(reference: SelectRReferenceTarget) {
  const targetText = reference.referenceText
    .replace(/^(section|article|schedule|exhibit)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const prefixByType: Record<CrossReferenceType, string> = {
    section: "Sec.",
    article: "Art.",
    schedule: "Sch.",
    exhibit: "Ex.",
  };

  return `${prefixByType[reference.type]} ${targetText || reference.referenceText}`;
}

function getReferenceActionLabel(actionLabel: string, reference?: SelectRReferenceTarget) {
  return reference ? `${actionLabel} ${getReferenceButtonLabel(reference)}` : actionLabel;
}

function createSelectRAction(
  id: SelectionActionId,
  label: string,
  status: SelectionAvailableAction["status"],
  reason: string,
): SelectionAvailableAction {
  return {
    id,
    label,
    status,
    reason,
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
  const [contractDashboard, setContractDashboard] = useState<ContractDashboard | null>(null);
  const [activeAnalysisSubtab, setActiveAnalysisSubtab] = useState<AnalysisSubtab>("parties");
  const [currentSelectionText, setCurrentSelectionText] = useState("");
  const [selectionVersion, setSelectionVersion] = useState(0);
  const [currentSelectionError, setCurrentSelectionError] = useState("");
  const [selectRCards, setSelectRCards] = useState<SelectRCard[]>([]);
  const [hasAnalyzedDefinedTerms, setHasAnalyzedDefinedTerms] = useState(false);
  const [hasAnalyzedCrossReferences, setHasAnalyzedCrossReferences] = useState(false);
  const [hasAnalyzedObligations, setHasAnalyzedObligations] = useState(false);
  const [message, setMessage] = useState("Select text in Word, then click the button.");
  const isSelectionRefreshRunningRef = useRef(false);
  const hasAutoRunContractAnalysisRef = useRef(false);
  const selectRCardCounterRef = useRef(0);

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
    const selection = await readSelectedTextFromWordSelection();
    return selection.displayText;
  }

  async function refreshCurrentSelectionPreview() {
    if (officeState !== "ready" || activeMode !== "selectR" || isSelectionRefreshRunningRef.current) {
      return;
    }

    isSelectionRefreshRunningRef.current = true;

    try {
      const text = await readSelectedTextFromWord();

      updateCurrentSelectionText(text);
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
    setContractDashboard(null);
    setHasAnalyzedDefinedTerms(false);
    setHasAnalyzedCrossReferences(false);
    setHasAnalyzedObligations(false);
  }

  useEffect(() => {
    if (officeState !== "ready" || hasAutoRunContractAnalysisRef.current) {
      return;
    }

    hasAutoRunContractAnalysisRef.current = true;
    void runContractAnalysis("auto");
  }, [officeState]);

  function canStartAction() {
    return officeState === "ready" && activeAction === null;
  }

  function isActionButtonDisabled(action: ActiveAction) {
    return officeState !== "ready" || activeAction !== null;
  }

  function getButtonLabel(action: ActiveAction, idleLabel: string) {
    return activeAction === action ? "Working..." : idleLabel;
  }

  function updateCurrentSelectionText(nextText: string) {
    setCurrentSelectionText((previousText) => {
      if (previousText === nextText) {
        return previousText;
      }

      setSelectionVersion((previousVersion) => previousVersion + 1);
      return nextText;
    });
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

      updateCurrentSelectionText(text);
      setOutputKind("selected");
      setOutputText(text);
      setCharacterCount(null);
      resetAnalysisResults();
      setMessage(text ? "Selected text:" : "No text is selected. Select text in Word and try again.");
    } catch (error) {
      console.error("Unable to read selected text.", error);
      setOutputKind("selected");
      setOutputText("");
      updateCurrentSelectionText("");
      setCharacterCount(null);
      setDefinedTerms([]);
      setPotentialIssues(emptyPotentialIssues);
      setCrossReferenceIssues(emptyCrossReferenceIssues);
      setPotentialObligations([]);
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

  function getMockAnalysisText(documentText: string, layout: ContractLayout, parties: DetectedParty[]) {
    const titleLine = layout.title ? `Title: ${layout.title}` : "Title: Not detected";
    const partiesLine = parties.length
      ? `Parties: ${parties.map((party) => `${party.name}${party.role ? ` (${party.role})` : ""}`).join("; ")}`
      : "Parties: Not detected";
    const excerpt = documentText.replace(/\s+/g, " ").trim().slice(0, 1200);

    return [titleLine, partiesLine, `Excerpt for mock-only summary: ${excerpt || "No document text detected."}`].join("\n");
  }

  async function runContractAnalysis(source: "auto" | "manual") {
    if (!canStartAction()) {
      return;
    }

    setActiveAction("analyzeContract");
    setOutputKind("contractAnalysis");
    setOutputText("");
    setMessage(source === "auto" ? "Contractr is analyzing the current document..." : "Refreshing contract analysis...");

    try {
      const text = await readDocumentText();
      const definedTermResults = extractDefinedTerms(text);
      const issues: PotentialIssues = {
        definedButUnusedTerms: findDefinedButUnusedTerms(text, definedTermResults),
        potentialUndefinedTerms: findPotentialUndefinedTerms(text, definedTermResults),
        similarDefinedTerms: findSimilarDefinedTerms(definedTermResults),
      };
      const referenceIssues: CrossReferenceIssues = {
        potentialBrokenReferences: findPotentialBrokenReferences(text),
      };
      const obligationResults = extractPotentialObligations(text);
      const parties = extractParties(text);
      const layout = extractContractLayout(text);
      const dates = extractKeyDates(text);
      const stats = extractDocumentStats(text);
      const governingLaw = extractGoverningLaw(text);
      const keyClauses = detectKeyClauses(text);
      const mockSummary = await aiProvider.summarizeClause({
        selectedText: getMockAnalysisText(text, layout, parties),
        sourceReference: "analyzR mock contract summary",
      });

      setOutputKind("contractAnalysis");
      setOutputText("");
      setCharacterCount(text.length);
      setDefinedTerms(definedTermResults);
      setPotentialIssues(issues);
      setCrossReferenceIssues(referenceIssues);
      setPotentialObligations(obligationResults);
      setContractDashboard({
        parties,
        layout,
        dates,
        stats,
        governingLaw,
        keyClauses,
        mockSummary,
        analyzedAt: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      });
      setHasAnalyzedDefinedTerms(true);
      setHasAnalyzedCrossReferences(true);
      setHasAnalyzedObligations(true);
      setMessage(
        `Contract analysis complete: ${definedTermResults.length.toLocaleString()} defined term${
          definedTermResults.length === 1 ? "" : "s"
        }, ${referenceIssues.potentialBrokenReferences.length.toLocaleString()} potential broken reference${
          referenceIssues.potentialBrokenReferences.length === 1 ? "" : "s"
        }, ${obligationResults.length.toLocaleString()} potential obligation${obligationResults.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      console.error("Unable to analyze contract.", error);
      setOutputKind("contractAnalysis");
      setOutputText("");
      setCharacterCount(null);
      setDefinedTerms([]);
      setPotentialIssues(emptyPotentialIssues);
      setCrossReferenceIssues(emptyCrossReferenceIssues);
      setPotentialObligations([]);
      setContractDashboard(null);
      setHasAnalyzedDefinedTerms(false);
      setHasAnalyzedCrossReferences(false);
      setHasAnalyzedObligations(false);
      setMessage("Contractr could not analyze the contract. Please check that a Word document is open and try again.");
    } finally {
      clearActiveAction("analyzeContract");
    }
  }

  async function analyzeContract() {
    await runContractAnalysis("manual");
  }

  function createBaseSelectRCard(
    action: SelectionAvailableAction,
    selectedTextSnapshot: string,
    detectedElementsSnapshot: SelectionContext,
    cardSelectionVersion = selectionVersion,
  ): SelectRCardBase {
    selectRCardCounterRef.current += 1;

    return {
      id: `selectr-card-${Date.now()}-${selectRCardCounterRef.current}`,
      actionId: action.id,
      actionLabel: action.label,
      title: action.label,
      selectedTextSnapshot,
      analysisTextSnapshot: detectedElementsSnapshot.normalizedText,
      detectedElementsSnapshot: cloneSelectionContext(detectedElementsSnapshot),
      selectionVersion: cardSelectionVersion,
      isPinned: false,
    };
  }

  function addSelectRCard(card: SelectRCard) {
    setSelectRCards((cards) => [card, ...cards.filter((existingCard) => existingCard.isPinned)]);
  }

  function getDefinedTermDefinitionText(term: string) {
    const normalizedTerm = term.toLocaleLowerCase();
    const match = definedTerms.find(
      (definedTerm) =>
        definedTerm.term.toLocaleLowerCase() === normalizedTerm ||
        definedTerm.detectedVariants.some((variant) => variant.toLocaleLowerCase() === normalizedTerm),
    );

    return match?.definitionText ?? "";
  }

  function createSelectRCard(action: SelectionAvailableAction) {
    if (!currentSelectionText) {
      setMessage("Select text in Word before opening a selectR action card.");
      return;
    }

    const selectionContextSnapshot = cloneSelectionContext(currentSelectionContext);
    const baseCard = createBaseSelectRCard(action, currentSelectionText, selectionContextSnapshot);

    let card: SelectRCard;

    if (action.id === "analyzeDefinedTerms") {
      card = {
        ...baseCard,
        type: "definedTerms",
        result: {
          confirmedDefinedTerms: selectionContextSnapshot.confirmedDefinedTerms.map((definedTerm) => ({
            ...definedTerm,
            definitionText: getDefinedTermDefinitionText(definedTerm.term),
          })),
          definedTermCandidates: selectionContextSnapshot.definedTermCandidates.map((candidate) => ({ ...candidate })),
        },
      };
    } else if (action.id === "analyzeRelevantObligations") {
      card = {
        ...baseCard,
        type: "obligations",
        result: {
          potentialObligations: extractPotentialObligations(selectionContextSnapshot.normalizedText),
          obligationSignals: selectionContextSnapshot.obligationSignals.map((signal) => ({ ...signal })),
        },
      };
    } else if (action.id === "editWithAi") {
      card = {
        ...baseCard,
        title: "AI Edit (mock)",
        type: "mockEdit",
        result: {
          summary: "Drafting suggestions will appear here when a workplace-approved provider is configured.",
          notes: [
            "No selected text was sent outside this task pane.",
            "This is a mock-only placeholder, not legal advice.",
          ],
        },
      };
    } else {
      card = {
        ...baseCard,
        type: "placeholder",
        result: {
          message: "This action is a placeholder for a future section-navigation step.",
        },
      };
    }

    addSelectRCard(card);
    setMessage(`${action.label} card opened from the current selectR selection.`);
  }

  async function createSelectRMockExplanationCard(action: SelectionAvailableAction) {
    if (!canStartAction()) {
      return;
    }

    setActiveAction("explainSelectedClause");

    try {
      const selectedTextSnapshot = await readSelectedTextFromWord();
      const cardSelectionVersion = selectedTextSnapshot === currentSelectionText ? selectionVersion : selectionVersion + 1;
      updateCurrentSelectionText(selectedTextSnapshot);

      if (!selectedTextSnapshot) {
        setMessage("No clause text is selected. Select a clause in Word and try again.");
        return;
      }

      const selectionContextSnapshot = detectSelectionContext(selectedTextSnapshot, {
        knownDefinedTerms: hasAnalyzedDefinedTerms ? definedTerms : [],
      });
      const result = await aiProvider.explainClause({ selectedText: selectedTextSnapshot });
      const card: SelectRMockExplanationCard = {
        ...createBaseSelectRCard(action, selectedTextSnapshot, selectionContextSnapshot, cardSelectionVersion),
        title: "Explain Clause (mock)",
        type: "mockExplanation",
        result,
      };

      setOutputKind("selected");
      setOutputText("");
      setCharacterCount(null);
      addSelectRCard(card);
      setMessage("Mock clause explanation card opened from the current selectR selection.");
    } catch (error) {
      console.error("Unable to explain selected clause with the mock provider.", error);
      setMessage("Contractr could not explain the selected clause with the mock provider. Please try again.");
    } finally {
      clearActiveAction("explainSelectedClause");
    }
  }

  function closeSelectRCard(cardId: string) {
    setSelectRCards((cards) => cards.filter((card) => card.id !== cardId));
  }

  function toggleSelectRCardPin(cardId: string) {
    setSelectRCards((cards) =>
      cards.map((card) => (card.id === cardId ? { ...card, isPinned: !card.isPinned } : card)),
    );
  }

  async function selectFirstDocumentText(candidates: string[]) {
    let selectedCandidate = "";

    await Word.run(async (context) => {
      for (const candidate of candidates) {
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
          selectedCandidate = candidate;
          await context.sync();
          return;
        }
      }
    });

    return selectedCandidate;
  }

  async function navigateToDocumentText(target: NavigationTarget) {
    if (!canStartAction()) {
      return;
    }

    setActiveAction("navigate");

    try {
      const selectedCandidate = await selectFirstDocumentText(target.candidates);
      setMessage(selectedCandidate ? target.successMessage : "Contractr could not find that text in the current Word document.");
    } catch (error) {
      console.error("Unable to navigate in the document.", error);
      setMessage("Contractr could not navigate to that text. Please try analyzing the document again.");
    } finally {
      clearActiveAction("navigate");
    }
  }

  async function navigateToSelectionReference(referenceTarget?: SelectRReferenceTarget) {
    if (!canStartAction()) {
      return;
    }

    const selectionContextSnapshot = cloneSelectionContext(currentSelectionContext);
    const reference = referenceTarget ?? getFirstSelectionReference(selectionContextSnapshot);

    if (!currentSelectionText || !reference) {
      setMessage("Select text containing a section, article, schedule, or exhibit reference before navigating.");
      return;
    }

    setActiveAction("navigate");

    try {
      const documentText = await readDocumentText();
      const targetResult = findCrossReferenceTarget(documentText, reference.referenceText, reference.type);

      if (!targetResult.found) {
        setMessage(`${reference.referenceText}: ${targetResult.reason}`);
        return;
      }

      const selectedCandidate = await selectFirstDocumentText(targetResult.target.searchCandidates);
      setMessage(
        selectedCandidate
          ? getReferenceNavigationMessage(targetResult.target)
          : `${reference.referenceText}: Contractr found a likely heading in the extracted text, but Word search could not select it.`,
      );
    } catch (error) {
      console.error("Unable to navigate to selected reference.", error);
      setMessage("Contractr could not navigate to that reference. Please check that the document is open and try again.");
    } finally {
      clearActiveAction("navigate");
    }
  }

  async function openSelectionReferenceInSidebar(action: SelectionAvailableAction, referenceTarget?: SelectRReferenceTarget) {
    if (!canStartAction()) {
      return;
    }

    const selectedTextSnapshot = currentSelectionText;
    const selectionContextSnapshot = cloneSelectionContext(currentSelectionContext);
    const reference = referenceTarget ?? getFirstSelectionReference(selectionContextSnapshot);

    if (!selectedTextSnapshot || !reference) {
      setMessage("Select text containing a section, article, schedule, or exhibit reference before opening a section card.");
      return;
    }

    setActiveAction("readDocument");

    try {
      const documentText = await readDocumentText();
      const targetResult = findCrossReferenceTarget(documentText, reference.referenceText, reference.type);
      const baseCard = createBaseSelectRCard(action, selectedTextSnapshot, selectionContextSnapshot);
      const card: SelectRSectionReferenceCard = targetResult.found
        ? {
            ...baseCard,
            title: targetResult.target.referenceText,
            type: "sectionReference",
            result: {
              referenceText: targetResult.target.referenceText,
              referenceType: targetResult.target.type,
              headingText: targetResult.target.headingText,
              extractedText: targetResult.target.extractedText,
              isApproximate: targetResult.target.isApproximate,
              message: `Approximate ${getReferenceTypeLabel(targetResult.target.type).toLocaleLowerCase()} text extracted from the current document.`,
            },
          }
        : {
            ...baseCard,
            title: reference.referenceText,
            type: "sectionReference",
            result: {
              referenceText: reference.referenceText,
              referenceType: reference.type,
              isApproximate: true,
              message: targetResult.reason,
            },
          };

      addSelectRCard(card);
      setMessage(
        targetResult.found
          ? `${targetResult.target.referenceText} card opened from the current document.`
          : `${reference.referenceText}: ${targetResult.reason}`,
      );
    } catch (error) {
      console.error("Unable to open selected reference in sidebar.", error);
      setMessage("Contractr could not open that reference in the sidebar. Please check that the document is open and try again.");
    } finally {
      clearActiveAction("readDocument");
    }
  }

  async function handleSelectRAction(action: SelectionAvailableAction, referenceTarget?: SelectRReferenceTarget) {
    if (action.id === "goToSectionOrArticle") {
      await navigateToSelectionReference(referenceTarget);
      return;
    }

    if (action.id === "openSectionOrArticleInSidebar") {
      await openSelectionReferenceInSidebar(action, referenceTarget);
      return;
    }

    if (action.id === "explainSelectedClause") {
      await createSelectRMockExplanationCard(action);
      return;
    }

    createSelectRCard(action);
  }

  const issueCount =
    potentialIssues.definedButUnusedTerms.length +
    potentialIssues.potentialUndefinedTerms.length +
    potentialIssues.similarDefinedTerms.length;
  const crossReferenceIssueCount = crossReferenceIssues.potentialBrokenReferences.length;
  const currentSelectionContext = useMemo(
    () =>
      detectSelectionContext(currentSelectionText, {
        knownDefinedTerms: hasAnalyzedDefinedTerms ? definedTerms : [],
      }),
    [currentSelectionText, definedTerms, hasAnalyzedDefinedTerms],
  );
  const selectRActionGroups = useMemo<SelectRActionGroup[]>(() => {
    const references = currentSelectionContext.references;
    const hasSelection = Boolean(currentSelectionText);
    const hasDefinedTerms =
      currentSelectionContext.confirmedDefinedTerms.length > 0 || currentSelectionContext.definedTermCandidates.length > 0;
    const hasObligations = currentSelectionContext.obligationSignals.length > 0;
    const hasClauseLikeSelection = currentSelectionContext.isClauseLike;

    return [
      {
        id: "goSection",
        label: "Go section",
        action: createSelectRAction(
          "goToSectionOrArticle",
          "Go section",
          "available",
          "A section, article, schedule, or exhibit reference was detected.",
        ),
        targets: references,
        status: hasSelection && references.length ? "available" : "unavailable",
        reason: references.length
          ? "Select a target to navigate to its likely heading."
          : "No section, article, schedule, or exhibit reference detected.",
      },
      {
        id: "openSection",
        label: "Open section",
        action: createSelectRAction(
          "openSectionOrArticleInSidebar",
          "Open section",
          "available",
          "A section, article, schedule, or exhibit reference was detected.",
        ),
        targets: references,
        status: hasSelection && references.length ? "available" : "unavailable",
        reason: references.length
          ? "Select a target to open its likely text in a card."
          : "No section, article, schedule, or exhibit reference detected.",
      },
      {
        id: "defineTerms",
        label: "Define terms",
        action: createSelectRAction(
          "analyzeDefinedTerms",
          "Defined Terms",
          "available",
          "A likely defined term was detected in the selection.",
        ),
        status: hasSelection && hasDefinedTerms ? "available" : "unavailable",
        reason: hasDefinedTerms ? "Defined terms or candidates were detected." : "No defined terms detected.",
      },
      {
        id: "analyzeObligations",
        label: "Analyze obligations",
        action: createSelectRAction(
          "analyzeRelevantObligations",
          "Obligations",
          "available",
          "Obligation language was detected in the selection.",
        ),
        status: hasSelection && hasObligations ? "available" : "unavailable",
        reason: hasObligations ? "Obligation language was detected." : "No obligation language detected.",
      },
      {
        id: "explainClause",
        label: "Explain clause",
        action: createSelectRAction(
          "explainSelectedClause",
          "Explain Clause",
          "mockOnly",
          "The selection looks clause-like. This uses only the local mock provider.",
        ),
        status: hasSelection && hasClauseLikeSelection ? "mockOnly" : "unavailable",
        reason: hasClauseLikeSelection ? "Clause-like text was detected." : "No clause-like selection detected.",
      },
      {
        id: "aiEdit",
        label: "AI edit",
        action: createSelectRAction(
          "editWithAi",
          "AI Edit",
          "mockOnly",
          "The selection looks clause-like, but real AI editing is not enabled.",
        ),
        status: hasSelection && hasClauseLikeSelection ? "mockOnly" : "unavailable",
        reason: hasClauseLikeSelection ? "Clause-like text was detected." : "No clause-like selection detected.",
      },
    ];
  }, [currentSelectionContext, currentSelectionText]);
  const hasDetectedSelectionElements =
    currentSelectionContext.references.length > 0 ||
    currentSelectionContext.confirmedDefinedTerms.length > 0 ||
    currentSelectionContext.definedTermCandidates.length > 0 ||
    currentSelectionContext.obligationSignals.length > 0 ||
    currentSelectionContext.isClauseLike;
  function renderSelectRCardResult(card: SelectRCard) {
    if (card.type === "definedTerms") {
      const hasDefinedTermResults = card.result.confirmedDefinedTerms.length > 0 || card.result.definedTermCandidates.length > 0;

      return hasDefinedTermResults ? (
        <ul className="selectr-card-result-list">
          {card.result.confirmedDefinedTerms.map((definedTerm) => (
            <li key={`${card.id}-${definedTerm.term}-${definedTerm.matchedText}`}>
              <strong>{definedTerm.term}</strong>
              <span>{definedTerm.definitionText || "Definition was not found in the current analyzR results."}</span>
            </li>
          ))}
          {card.result.definedTermCandidates.map((candidate) => (
            <li key={`${card.id}-${candidate.source}-${candidate.term}`}>
              <strong>{candidate.term}</strong>
              <span>May be a defined term, but no definition was found.</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="term-meta">No defined terms or candidates were found in this selection snapshot.</p>
      );
    }

    if (card.type === "obligations") {
      return card.result.potentialObligations.length ? (
        <ol className="defined-term-list">
          {card.result.potentialObligations.map((obligation, index) => (
            <li className="selectr-card-result-item" key={`${card.id}-${obligation.obligationText}-${index}`}>
              <p className="term-meta">
                Party: <strong>{obligation.responsibleParty ?? "Possible responsible party not detected"}</strong>
              </p>
              <p className="term-meta">
                Trigger: <strong>{obligation.triggerText}</strong>
              </p>
              {obligation.deadlineOrTiming ? (
                <p className="term-meta">
                  Timing: <strong>{obligation.deadlineOrTiming}</strong>
                </p>
              ) : null}
              <p className="definition-label">Potential obligation text</p>
              <p className="definition-text">{obligation.obligationText}</p>
            </li>
          ))}
        </ol>
      ) : card.result.obligationSignals.length ? (
        <div className="selection-detection-group">
          <p className="definition-label">Obligation triggers found</p>
          <ul>
            {card.result.obligationSignals.map((signal) => (
              <li key={`${card.id}-${signal.triggerText}`}>
                <strong>{signal.triggerText}</strong>
                <span>Potential obligation language detected in this selection snapshot.</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="term-meta">No potential obligations were found in this selection snapshot.</p>
      );
    }

    if (card.type === "mockEdit") {
      return (
        <>
          <p className="mock-label">Mock output only - no real AI provider was called.</p>
          <p className="definition-text">{card.result.summary}</p>
          <div className="issue-group">
            <h3>Mock notes</h3>
            <ul>
              {card.result.notes.map((note) => (
                <li key={`${card.id}-${note}`}>{note}</li>
              ))}
            </ul>
          </div>
        </>
      );
    }

    if (card.type === "mockExplanation") {
      return (
        <>
          <p className="mock-label">Mock output only - no real AI provider was called.</p>
          <p className="definition-label">Mock summary</p>
          <p className="definition-text">{card.result.summary}</p>
          <p className="definition-label">Mock explanation</p>
          <p className="definition-text">{card.result.explanation}</p>
          <div className="issue-group">
            <h3>Mock review points</h3>
            <ul>
              {card.result.reviewPoints.map((point) => (
                <li key={`${card.id}-${point}`}>{point}</li>
              ))}
            </ul>
          </div>
          <div className="issue-group">
            <h3>Mock safety notes</h3>
            <ul>
              {card.result.notes.map((note) => (
                <li key={`${card.id}-${note}`}>{note}</li>
              ))}
            </ul>
          </div>
        </>
      );
    }

    if (card.type === "sectionReference") {
      if (!card.result.extractedText) {
        return <p className="term-meta">{card.result.message}</p>;
      }

      return (
        <div className="section-preview-card">
          <p className="term-meta section-preview-text">{card.result.extractedText}</p>
        </div>
      );
    }

    return <p className="term-meta">{card.result.message}</p>;
  }

  function renderAnalysisSubtab() {
    if (!contractDashboard) {
      return activeAction === "analyzeContract" ? (
        <p className="term-meta">Analyzing the current Word document...</p>
      ) : (
        <p className="term-meta">Contract analysis has not run yet.</p>
      );
    }

    if (activeAnalysisSubtab === "parties") {
      return contractDashboard.parties.length ? (
        <ol className="defined-term-list">
          {contractDashboard.parties.map((party) => (
            <li className="defined-term-item" key={`${party.name}-${party.role ?? "unknown"}`}>
              <h2>{party.name}</h2>
              <p className="term-meta">
                Role: <strong>{party.role ?? "Not detected"}</strong>
              </p>
              <p className="term-meta">
                Confidence: <strong>{party.confidenceLabel}</strong>
              </p>
              <p className="definition-label">Source snippet</p>
              <p className="definition-text">{party.sourceText}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="term-meta">No likely parties were detected using the current deterministic patterns.</p>
      );
    }

    if (activeAnalysisSubtab === "layout") {
      const articleSectionHeadings = contractDashboard.layout.headings.filter(
        (heading) => heading.type === "article" || heading.type === "section",
      );
      const scheduleExhibitHeadings = contractDashboard.layout.headings.filter(
        (heading) => heading.type === "schedule" || heading.type === "exhibit",
      );

      return (
        <div className="analysis-tab-panel">
          <p className="term-meta">
            Title: <strong>{contractDashboard.layout.title ?? "Not detected"}</strong>
          </p>
          {articleSectionHeadings.length ? (
            <div className="issue-group">
              <h3>Articles and Sections</h3>
              <ul>
                {articleSectionHeadings.map((heading) => (
                  <li key={`${heading.normalizedTarget}-${heading.headingText}`}>
                    <strong>{heading.headingText}</strong>
                    <span>{heading.type}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="term-meta">No article or section headings were detected.</p>
          )}
          {scheduleExhibitHeadings.length ? (
            <div className="issue-group">
              <h3>Schedules and Exhibits</h3>
              <ul>
                {scheduleExhibitHeadings.map((heading) => (
                  <li key={`${heading.normalizedTarget}-${heading.headingText}`}>
                    <strong>{heading.headingText}</strong>
                    <span>{heading.type}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {contractDashboard.layout.otherHeadings.length ? (
            <div className="issue-group">
              <h3>Other Potential Headings</h3>
              <ul>
                {contractDashboard.layout.otherHeadings.map((heading) => (
                  <li key={heading}>{heading}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      );
    }

    if (activeAnalysisSubtab === "summary") {
      return (
        <div className="analysis-tab-panel">
          <p className="mock-label">Mock output only - no real AI provider was called.</p>
          <p className="definition-label">Mock summary</p>
          <p className="definition-text">{contractDashboard.mockSummary.summary}</p>
          <p className="definition-label">Mock explanation</p>
          <p className="definition-text">{contractDashboard.mockSummary.explanation}</p>
          <div className="issue-group">
            <h3>Future summary scope</h3>
            <ul>
              {contractDashboard.mockSummary.reviewPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        </div>
      );
    }

    if (activeAnalysisSubtab === "dates") {
      return contractDashboard.dates.length ? (
        <ol className="defined-term-list">
          {contractDashboard.dates.map((date, index) => (
            <li className="defined-term-item" key={`${date.label}-${date.value}-${index}`}>
              <h2>{date.label}</h2>
              <p className="term-meta">
                {date.isPotential ? "Potential timing" : "Detected date"}: <strong>{date.value}</strong>
              </p>
              <p className="definition-label">Source snippet</p>
              <p className="definition-text">{date.sourceText}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="term-meta">No dates, deadlines, or timing references were detected using the current patterns.</p>
      );
    }

    if (activeAnalysisSubtab === "definedTerms") {
      return definedTerms.length ? (
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
      );
    }

    if (activeAnalysisSubtab === "obligations") {
      return potentialObligations.length ? (
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
      );
    }

    if (activeAnalysisSubtab === "issues") {
      return issueCount || crossReferenceIssueCount ? (
        <div className="analysis-tab-panel">
          {crossReferenceIssues.potentialBrokenReferences.length ? (
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
          ) : null}
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
        </div>
      ) : (
        <p className="term-meta">No potential issues were found using the current deterministic checks.</p>
      );
    }

    if (activeAnalysisSubtab === "keyClauses") {
      return contractDashboard.keyClauses.length ? (
        <ul className="snapshot-list">
          {contractDashboard.keyClauses.map((clause) => (
            <li key={`${clause.label}-${clause.headingText}`}>
              <strong>{clause.label}</strong>
              <span>{clause.headingText}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="term-meta">No common key clause headings were detected.</p>
      );
    }

    return (
      <ul className="snapshot-list">
        <li>
          <strong>Words</strong>
          <span>{contractDashboard.stats.wordCount.toLocaleString()}</span>
        </li>
        <li>
          <strong>Paragraphs</strong>
          <span>{contractDashboard.stats.paragraphCount.toLocaleString()}</span>
        </li>
        <li>
          <strong>Articles</strong>
          <span>{contractDashboard.stats.articleCount.toLocaleString()}</span>
        </li>
        <li>
          <strong>Sections</strong>
          <span>{contractDashboard.stats.sectionCount.toLocaleString()}</span>
        </li>
        <li>
          <strong>Schedules</strong>
          <span>{contractDashboard.stats.scheduleCount.toLocaleString()}</span>
        </li>
        <li>
          <strong>Exhibits</strong>
          <span>{contractDashboard.stats.exhibitCount.toLocaleString()}</span>
        </li>
      </ul>
    );
  }

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
          <section className="selection-context" aria-labelledby="available-actions-heading">
            <h3 id="available-actions-heading">Available Actions</h3>
            {currentSelectionError ? <p className="term-meta">{currentSelectionError}</p> : null}
            {!currentSelectionText ? (
              <p className="term-meta">Select text in Word to see context-aware actions.</p>
            ) : null}
            <div className="available-action-grid">
              {selectRActionGroups.map((group) => {
                const isGroupAvailable = group.status !== "unavailable" && group.action;
                const isDisabled = officeState !== "ready" || activeAction !== null || !isGroupAvailable;
                const targets = group.targets ?? [];
                const singleTarget = targets.length === 1 ? targets[0] : undefined;
                const actionLabel =
                  group.id === "goSection"
                    ? getReferenceActionLabel("Go", singleTarget)
                    : group.id === "openSection"
                      ? getReferenceActionLabel("Open", singleTarget)
                      : group.label;

                return (
                  <div
                    className={`available-action-item${isGroupAvailable ? "" : " available-action-item-disabled"}`}
                    key={group.id}
                  >
                    {group.targets && targets.length > 1 ? (
                      <div className="action-target-cell" aria-label={`${group.label} targets`}>
                        <span className="action-target-cell-label">{group.label}</span>
                        <div className="action-target-button-row">
                          {targets.map((target, targetIndex) => (
                            <button
                              className="action-target-button"
                              type="button"
                              disabled={isDisabled}
                              title={`${group.label}: ${getReferenceButtonLabel(target)}`}
                              key={`${targetIndex}-${target.type}-${target.referenceText}`}
                              onClick={() => {
                                if (group.action) {
                                  void handleSelectRAction(group.action, target);
                                }
                              }}
                            >
                              {getReferenceTargetButtonLabel(target)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : group.targets ? (
                      <button
                        className="action-box"
                        type="button"
                        disabled={isDisabled}
                        title={group.reason}
                        onClick={() => {
                          if (group.action && singleTarget) {
                            void handleSelectRAction(group.action, singleTarget);
                          }
                        }}
                      >
                        {actionLabel}
                      </button>
                    ) : (
                      <button
                        className="action-box"
                        type="button"
                        disabled={isDisabled}
                        title={group.reason}
                        onClick={() => {
                          if (group.action) {
                            void handleSelectRAction(group.action);
                          }
                        }}
                      >
                        {group.label}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          <section className="selection-context" aria-labelledby="open-action-cards-heading">
            <h3 id="open-action-cards-heading">Open Action Cards</h3>
            {selectRCards.length ? (
              <ol className="selectr-card-list">
                {selectRCards.map((card) => (
                  <li className="selectr-card" key={card.id}>
                    <div className="selectr-card-header">
                      <div className="selectr-card-title-group">
                        <h4>{card.title}</h4>
                      </div>
                      <div className="selectr-card-actions">
                        <button
                          className={`pin-card-button${card.isPinned ? " pin-card-button-active" : ""}`}
                          type="button"
                          aria-label={card.isPinned ? "Unpin card" : "Pin card"}
                          aria-pressed={card.isPinned}
                          title={card.isPinned ? "Unpin card" : "Pin card"}
                          onClick={() => toggleSelectRCardPin(card.id)}
                        >
                          <span className="pin-card-icon" aria-hidden="true" />
                        </button>
                        <button className="close-card-button" type="button" onClick={() => closeSelectRCard(card.id)}>
                          Close
                        </button>
                      </div>
                    </div>
                    {renderSelectRCardResult(card)}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="term-meta">No action cards open yet. Select text and choose an action to create one.</p>
            )}
          </section>
          <section className="selection-context" aria-labelledby="detected-elements-heading">
            <h3 id="detected-elements-heading">Detected Elements — for bug fixing only</h3>
            {!currentSelectionText ? (
              <p className="term-meta">Select text in Word to detect references, defined terms, obligations, and clause-like text.</p>
            ) : hasDetectedSelectionElements ? (
              <div className="selection-detection-list">
                {currentSelectionContext.references.length ? (
                  <div className="selection-detection-group">
                    <p className="definition-label">References</p>
                    <ul>
                      {currentSelectionContext.references.map((reference) => (
                        <li key={`${reference.type}-${reference.referenceText}`}>
                          <strong>{reference.referenceText}</strong>
                          <span>{reference.type}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {currentSelectionContext.confirmedDefinedTerms.length ? (
                  <div className="selection-detection-group">
                    <p className="definition-label">Defined terms found in selection</p>
                    <ul>
                      {currentSelectionContext.confirmedDefinedTerms.map((definedTerm) => (
                        <li key={`${definedTerm.term}-${definedTerm.matchedText}`}>
                          <strong>{definedTerm.term}</strong>
                          <span>
                            Known defined term
                            {definedTerm.matchedText !== definedTerm.term ? `, matched as ${definedTerm.matchedText}` : ""}
                            {definedTerm.confidenceLabel ? ` (${definedTerm.confidenceLabel})` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {currentSelectionContext.definedTermCandidates.length ? (
                  <div className="selection-detection-group">
                    <p className="definition-label">Potential defined-term candidates</p>
                    <ul>
                      {currentSelectionContext.definedTermCandidates.map((candidate) => (
                        <li key={`${candidate.source}-${candidate.term}`}>
                          <strong>{candidate.term}</strong>
                          <span>{candidate.source}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {!hasAnalyzedDefinedTerms ? (
                  <p className="term-meta">Run Analyze Contract in analyzR for more accurate selectR defined-term detection.</p>
                ) : null}
                {currentSelectionContext.obligationSignals.length ? (
                  <div className="selection-detection-group">
                    <p className="definition-label">Obligation language</p>
                    <ul>
                      {currentSelectionContext.obligationSignals.map((signal) => (
                        <li key={signal.triggerText}>
                          <strong>{signal.triggerText}</strong>
                          <span>obligation trigger</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {currentSelectionContext.isClauseLike ? (
                  <p className="term-meta">This selection is long enough to treat as clause-like text.</p>
                ) : null}
              </div>
            ) : (
              <p className="term-meta">No selection-specific elements were detected yet.</p>
            )}
          </section>
        </section>
      ) : (
        <section className="tool-group" aria-labelledby="analyzr-heading">
          <h2 id="analyzr-heading">analyzR</h2>
          <p className="mode-description">analyzR automatically reads the current Word document for local analysis.</p>
          <div className="analyzr-control-row">
            <button className="refresh-analysis-button" type="button" disabled={isActionButtonDisabled("analyzeContract")} onClick={analyzeContract}>
              {getButtonLabel("analyzeContract", "Refresh")}
            </button>
            {contractDashboard?.analyzedAt ? <span>Updated {contractDashboard.analyzedAt}</span> : null}
          </div>
          <section className="contract-snapshot" aria-labelledby="contract-snapshot-heading">
            <h3 id="contract-snapshot-heading">Contract Snapshot</h3>
            <div className="snapshot-grid">
              <section>
                <h4>Parties</h4>
                {contractDashboard?.parties.length ? (
                  <ul className="snapshot-list">
                    {contractDashboard.parties.slice(0, 4).map((party) => (
                      <li key={`${party.name}-${party.role ?? "unknown"}`}>
                        <strong>{party.name}</strong>
                        <span>{party.role ?? "Role not detected"}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="term-meta">Not detected</p>
                )}
              </section>
              <section>
                <h4>Contract Nature</h4>
                <p className="term-meta">
                  {contractDashboard ? contractDashboard.mockSummary.summary : "Mock-only summary pending."}
                </p>
              </section>
              <section>
                <h4>Contract Elements</h4>
                <ul className="snapshot-list compact-snapshot-list">
                  <li>
                    <strong>Articles</strong>
                    <span>{contractDashboard?.stats.articleCount.toLocaleString() ?? "0"}</span>
                  </li>
                  <li>
                    <strong>Sections</strong>
                    <span>{contractDashboard?.stats.sectionCount.toLocaleString() ?? "0"}</span>
                  </li>
                  <li>
                    <strong>Schedules</strong>
                    <span>{contractDashboard?.stats.scheduleCount.toLocaleString() ?? "0"}</span>
                  </li>
                  <li>
                    <strong>Exhibits</strong>
                    <span>{contractDashboard?.stats.exhibitCount.toLocaleString() ?? "0"}</span>
                  </li>
                  <li>
                    <strong>Defined terms</strong>
                    <span>{definedTerms.length.toLocaleString()}</span>
                  </li>
                  <li>
                    <strong>Obligations</strong>
                    <span>{potentialObligations.length.toLocaleString()}</span>
                  </li>
                  <li>
                    <strong>Potential issues</strong>
                    <span>{(issueCount + crossReferenceIssueCount).toLocaleString()}</span>
                  </li>
                </ul>
              </section>
              <section>
                <h4>Governing Law</h4>
                <p className="term-meta">{contractDashboard?.governingLaw.governingLaw ?? "Not detected"}</p>
              </section>
            </div>
          </section>
          <section className="analysis-tabs" aria-labelledby="analysis-tabs-heading">
            <h3 id="analysis-tabs-heading">Analysis Details</h3>
            <div className="analysis-tab-list" role="tablist" aria-label="analyzR detail tabs">
              {analysisSubtabs.map((tab) => (
                <button
                  className={`analysis-tab-button${activeAnalysisSubtab === tab.id ? " analysis-tab-button-active" : ""}`}
                  type="button"
                  role="tab"
                  aria-selected={activeAnalysisSubtab === tab.id}
                  key={tab.id}
                  onClick={() => setActiveAnalysisSubtab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="analysis-tab-content" role="tabpanel">
              {renderAnalysisSubtab()}
            </div>
          </section>
          <p className="status">{message}</p>
          {characterCount !== null ? <p className="count">{characterCount.toLocaleString()} characters</p> : null}
        </section>
      )}
    </main>
  );
}
