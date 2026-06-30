export type AIProviderTask =
  | "explainClause"
  | "summarizeClause"
  | "compareToPlaybook"
  | "reviewDefinedTermAnalysis"
  | "reviewCrossReferenceAnalysis"
  | "reviewObligationAnalysis";

export type AIProviderMetadata = {
  providerName: string;
  isMock: boolean;
  task: AIProviderTask;
};

export type SelectedTextInput = {
  selectedText: string;
  sourceReference?: string | null;
};

export type ExplainClauseInput = SelectedTextInput;

export type SummarizeClauseInput = SelectedTextInput;

export type CompareToPlaybookInput = SelectedTextInput & {
  playbookName?: string | null;
  playbookText: string;
};

export type ClauseAnalysisResult = AIProviderMetadata & {
  title: string;
  summary: string;
  notes: string[];
};

export type PlaybookComparisonResult = AIProviderMetadata & {
  title: string;
  alignmentSummary: string;
  observations: string[];
};

export type DeterministicReviewRecommendation = "keep" | "remove" | "uncertain";

export type DeterministicReviewItem = {
  itemId: string;
  itemLabel: string;
  recommendation: DeterministicReviewRecommendation;
  reason: string;
  correctedLabel?: string;
  note?: string;
};

export type DeterministicReviewResult = AIProviderMetadata & {
  summary: string;
  reviews: DeterministicReviewItem[];
};

export type DefinedTermForReview = {
  term: string;
  detectedVariants: string[];
  definitionText: string;
  sourceTexts: string[];
  usageCount: number;
  patternLabel: string;
  confidenceLabel: string;
};

export type DefinedTermIssueForReview = {
  issueType: "definedButUnused" | "potentialUndefined" | "similarTerms";
  itemLabel: string;
  reason: string;
  sourceSnippet?: string;
};

export type DefinedTermReviewInput = {
  detectedTerms: DefinedTermForReview[];
  potentialIssues: DefinedTermIssueForReview[];
  limitedContextSnippets?: string[];
};

export type CrossReferenceIssueForReview = {
  referenceText: string;
  type: "section" | "article" | "schedule" | "exhibit";
  sourceText: string;
  reason: string;
};

export type CrossReferenceReviewInput = {
  potentialBrokenReferences: CrossReferenceIssueForReview[];
  detectedHeadingLabels?: string[];
  limitedContextSnippets?: string[];
};

export type ObligationForReview = {
  responsibleParty: string | null;
  obligationText: string;
  deadlineOrTiming: string | null;
  sourceReference: string | null;
  sourceText: string;
  triggerText: string;
};

export type ObligationReviewInput = {
  potentialObligations: ObligationForReview[];
  limitedContextSnippets?: string[];
};

export interface AIProvider {
  readonly providerName: string;
  readonly isMock: boolean;

  explainClause(input: ExplainClauseInput): Promise<ClauseAnalysisResult>;
  summarizeClause(input: SummarizeClauseInput): Promise<ClauseAnalysisResult>;
  compareToPlaybook(input: CompareToPlaybookInput): Promise<PlaybookComparisonResult>;
  reviewDefinedTermAnalysis(input: DefinedTermReviewInput): Promise<DeterministicReviewResult>;
  reviewCrossReferenceAnalysis(input: CrossReferenceReviewInput): Promise<DeterministicReviewResult>;
  reviewObligationAnalysis(input: ObligationReviewInput): Promise<DeterministicReviewResult>;
}
