import type {
  AIProvider,
  AIProviderTask,
  ClauseAnalysisResult,
  CompareToPlaybookInput,
  CrossReferenceReviewInput,
  DefinedTermReviewInput,
  DeterministicReviewItem,
  DeterministicReviewResult,
  ExplainClauseInput,
  ObligationReviewInput,
  PlaybookComparisonResult,
  SummarizeClauseInput,
} from "./types";

const mockProviderName = "Mock AI Provider";

function getMetadata(task: AIProviderTask) {
  return {
    providerName: mockProviderName,
    isMock: true,
    task,
  };
}

function getPreview(value: string, fallback: string) {
  const normalizedValue = value.replace(/\s+/g, " ").trim();

  if (!normalizedValue) {
    return fallback;
  }

  return normalizedValue.length <= 90 ? normalizedValue : `${normalizedValue.slice(0, 87)}...`;
}

function createPlaceholderReviewItems(labels: string[]): DeterministicReviewItem[] {
  const fallbackLabels = ["Sample item to keep", "Sample item to remove", "Sample uncertain item"];
  const reviewLabels = [...labels, ...fallbackLabels].slice(0, 3);

  return [
    {
      itemId: "mock-keep-1",
      itemLabel: reviewLabels[0],
      recommendation: "keep",
      reason: "Mock result only: this shows how a future provider could confirm a deterministic item.",
    },
    {
      itemId: "mock-remove-1",
      itemLabel: reviewLabels[1],
      recommendation: "remove",
      reason: "Mock result only: this shows how a future provider could suggest removing a false positive.",
      note: "No deterministic output should be overwritten automatically.",
    },
    {
      itemId: "mock-uncertain-1",
      itemLabel: reviewLabels[2],
      recommendation: "uncertain",
      reason: "Mock result only: this shows how a future provider could flag an item for human review.",
    },
  ];
}

function createReviewResult(
  task: AIProviderTask,
  summary: string,
  labels: string[],
): DeterministicReviewResult {
  return {
    ...getMetadata(task),
    summary,
    reviews: createPlaceholderReviewItems(labels),
  };
}

export class MockProvider implements AIProvider {
  readonly providerName = mockProviderName;
  readonly isMock = true;

  async explainClause(input: ExplainClauseInput): Promise<ClauseAnalysisResult> {
    return {
      ...getMetadata("explainClause"),
      title: "Mock clause explanation",
      summary: `Mock output only. A future provider would explain the selected text: ${getPreview(
        input.selectedText,
        "No selected text supplied.",
      )}`,
      notes: [
        "No real AI provider was called.",
        "No contract text was sent outside the app.",
        "This placeholder should not be treated as legal advice.",
      ],
    };
  }

  async summarizeClause(input: SummarizeClauseInput): Promise<ClauseAnalysisResult> {
    return {
      ...getMetadata("summarizeClause"),
      title: "Mock clause summary",
      summary: `Mock output only. A future provider would summarize: ${getPreview(
        input.selectedText,
        "No selected text supplied.",
      )}`,
      notes: [
        "No real AI provider was called.",
        "Future summaries should be limited to selected text unless explicitly approved.",
      ],
    };
  }

  async compareToPlaybook(input: CompareToPlaybookInput): Promise<PlaybookComparisonResult> {
    return {
      ...getMetadata("compareToPlaybook"),
      title: "Mock playbook comparison",
      alignmentSummary: `Mock output only. A future provider would compare selected text to ${
        input.playbookName ?? "the supplied playbook"
      }.`,
      observations: [
        "No real AI provider was called.",
        `Selected text preview: ${getPreview(input.selectedText, "No selected text supplied.")}`,
        `Playbook preview: ${getPreview(input.playbookText, "No playbook text supplied.")}`,
      ],
    };
  }

  async reviewDefinedTermAnalysis(input: DefinedTermReviewInput): Promise<DeterministicReviewResult> {
    const labels = [
      ...input.detectedTerms.map((term) => term.term),
      ...input.potentialIssues.map((issue) => issue.itemLabel),
    ];

    return createReviewResult(
      "reviewDefinedTermAnalysis",
      "Mock output only. A future provider could review detected defined terms and potential definition issues without receiving the full document by default.",
      labels,
    );
  }

  async reviewCrossReferenceAnalysis(input: CrossReferenceReviewInput): Promise<DeterministicReviewResult> {
    const labels = input.potentialBrokenReferences.map((issue) => issue.referenceText);

    return createReviewResult(
      "reviewCrossReferenceAnalysis",
      "Mock output only. A future provider could review structured cross-reference issues and suggest whether each issue should be kept, removed, or treated as uncertain.",
      labels,
    );
  }

  async reviewObligationAnalysis(input: ObligationReviewInput): Promise<DeterministicReviewResult> {
    const labels = input.potentialObligations.map((obligation) =>
      getPreview(obligation.obligationText, obligation.sourceReference ?? "Potential obligation"),
    );

    return createReviewResult(
      "reviewObligationAnalysis",
      "Mock output only. A future provider could review potential obligations and flag likely false positives or uncertain extracted fields.",
      labels,
    );
  }
}
