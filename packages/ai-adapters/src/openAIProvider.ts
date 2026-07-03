import type {
  AIProvider,
  AIProviderTask,
  ClauseAnalysisResult,
  CompareToPlaybookInput,
  CrossReferenceReviewInput,
  DefinedTermReviewInput,
  DeterministicReviewItem,
  DeterministicReviewRecommendation,
  DeterministicReviewResult,
  ExplainClauseInput,
  ObligationReviewInput,
  PlaybookComparisonResult,
  SummarizeClauseInput,
} from "./types";

type FetchLike = (url: string, init: OpenAIRequestInit) => Promise<OpenAIResponseLike>;

type OpenAIHeaders = Record<string, string>;

type OpenAIRequestInit = {
  method: "POST";
  headers: OpenAIHeaders;
  body: string;
};

type OpenAIResponseLike = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

type ProcessLike = {
  env?: Record<string, string | undefined>;
};

type OpenAIProviderOptions = {
  apiKey?: string;
  model?: string;
  fetch?: FetchLike;
  endpoint?: string;
};

type OpenAITextResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

type OpenAIClauseResponse = {
  title?: string;
  summary?: string;
  explanation?: string;
  reviewPoints?: string[];
  notes?: string[];
};

type OpenAIPlaybookResponse = {
  title?: string;
  alignmentSummary?: string;
  observations?: string[];
};

type OpenAIReviewResponse = {
  summary?: string;
  reviews?: Array<{
    itemId?: string;
    itemLabel?: string;
    recommendation?: DeterministicReviewRecommendation;
    reason?: string;
    correctedLabel?: string;
    note?: string;
  }>;
};

declare const process: ProcessLike | undefined;

const providerName = "OpenAI";
const defaultModel = "gpt-5.5";
const defaultEndpoint = "https://api.openai.com/v1/responses";
const configurationError = "OpenAI is not configured. Add OPENAI_API_KEY to your local environment.";
const browserError =
  "OpenAIProvider cannot run in frontend/browser code because that would expose OPENAI_API_KEY. Use a server-side or local-only proxy.";

function getMetadata(task: AIProviderTask) {
  return {
    providerName,
    isMock: false,
    task,
  };
}

function isBrowserRuntime() {
  return typeof globalThis === "object" && "window" in globalThis && "document" in globalThis;
}

function getProcessEnvValue(name: string) {
  if (typeof process === "undefined") {
    return undefined;
  }

  return process.env?.[name];
}

function getConfiguredFetch(customFetch?: FetchLike): FetchLike {
  const candidateFetch = customFetch ?? (globalThis as { fetch?: FetchLike }).fetch;

  if (!candidateFetch) {
    throw new Error("OpenAIProvider requires fetch in the server-side runtime.");
  }

  return candidateFetch;
}

function ensureArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getJsonObject(text: string): unknown {
  const trimmedText = text.trim();
  const fencedJsonMatch = trimmedText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fencedJsonMatch?.[1] ?? trimmedText;

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function extractResponseText(payload: unknown) {
  const response = payload as OpenAITextResponse;

  if (typeof response.output_text === "string") {
    return response.output_text.trim();
  }

  const outputText = response.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .filter((text): text is string => typeof text === "string")
    .join("\n")
    .trim();

  return outputText ?? "";
}

function getOpenAIErrorMessage(payload: unknown, status: number) {
  const errorMessage = (payload as OpenAITextResponse).error?.message;

  if (errorMessage) {
    return `OpenAI request failed (${status}): ${errorMessage}`;
  }

  return `OpenAI request failed (${status}).`;
}

function createFallbackReviewItems(labels: string[]): DeterministicReviewItem[] {
  return labels.slice(0, 10).map((label, index) => ({
    itemId: `openai-review-${index + 1}`,
    itemLabel: label,
    recommendation: "uncertain",
    reason: "OpenAI did not return structured review details for this item.",
  }));
}

function normalizeRecommendation(value: unknown): DeterministicReviewRecommendation {
  return value === "keep" || value === "remove" || value === "uncertain" ? value : "uncertain";
}

function parseClauseResult(
  task: AIProviderTask,
  responseText: string,
  fallbackTitle: string,
  fallbackSummary: string,
): ClauseAnalysisResult {
  const parsed = getJsonObject(responseText) as OpenAIClauseResponse | null;

  return {
    ...getMetadata(task),
    title: typeof parsed?.title === "string" ? parsed.title : fallbackTitle,
    summary: typeof parsed?.summary === "string" ? parsed.summary : fallbackSummary,
    explanation: typeof parsed?.explanation === "string" ? parsed.explanation : responseText,
    reviewPoints: ensureArray(parsed?.reviewPoints),
    notes: [
      "OpenAI mode is for personal/non-confidential testing only.",
      "Only the selected text supplied to this request was sent.",
      ...ensureArray(parsed?.notes),
    ],
  };
}

function parsePlaybookResult(responseText: string): PlaybookComparisonResult {
  const parsed = getJsonObject(responseText) as OpenAIPlaybookResponse | null;

  return {
    ...getMetadata("compareToPlaybook"),
    title: typeof parsed?.title === "string" ? parsed.title : "OpenAI playbook comparison",
    alignmentSummary:
      typeof parsed?.alignmentSummary === "string" ? parsed.alignmentSummary : "OpenAI returned an unstructured comparison.",
    observations: ensureArray(parsed?.observations).length ? ensureArray(parsed?.observations) : [responseText],
  };
}

function parseReviewResult(
  task: AIProviderTask,
  responseText: string,
  fallbackSummary: string,
  fallbackLabels: string[],
): DeterministicReviewResult {
  const parsed = getJsonObject(responseText) as OpenAIReviewResponse | null;
  const parsedReviews = Array.isArray(parsed?.reviews) ? parsed.reviews : [];
  const reviews = parsedReviews
    .filter((review) => typeof review.itemLabel === "string" && typeof review.reason === "string")
    .map((review, index): DeterministicReviewItem => {
      const itemLabel = review.itemLabel ?? fallbackLabels[index] ?? `Review item ${index + 1}`;

      return {
        itemId: review.itemId ?? `openai-review-${index + 1}`,
        itemLabel,
        recommendation: normalizeRecommendation(review.recommendation),
        reason: review.reason ?? "OpenAI marked this item for human review.",
        correctedLabel: review.correctedLabel,
        note: review.note,
      };
    });

  return {
    ...getMetadata(task),
    summary: typeof parsed?.summary === "string" ? parsed.summary : fallbackSummary,
    reviews: reviews.length ? reviews : createFallbackReviewItems(fallbackLabels),
  };
}

function createClauseJsonPrompt(taskLabel: string, selectedText: string, sourceReference?: string | null) {
  return [
    `Task: ${taskLabel}.`,
    "Use only the selected text supplied below. Do not assume missing contract context.",
    "Return compact JSON with keys: title, summary, explanation, reviewPoints, notes.",
    "This is for personal/non-confidential testing and is not legal advice.",
    sourceReference ? `Source reference: ${sourceReference}` : null,
    "Selected text:",
    selectedText,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n\n");
}

function createSystemPrompt() {
  return [
    "You are Contractr's AI adapter for personal/non-confidential contract testing.",
    "Be concise, practical, and careful.",
    "Do not provide legal advice.",
    "Do not claim to have reviewed the full contract unless the user-provided input contains it.",
    "Prefer uncertainty over overstatement.",
  ].join(" ");
}

export class OpenAIProvider implements AIProvider {
  readonly providerName = providerName;
  readonly isMock = false;

  private readonly apiKey?: string;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly fetch: FetchLike;

  constructor(options: OpenAIProviderOptions = {}) {
    if (isBrowserRuntime()) {
      throw new Error(browserError);
    }

    this.apiKey = options.apiKey ?? getProcessEnvValue("OPENAI_API_KEY");
    this.model = options.model ?? getProcessEnvValue("OPENAI_MODEL") ?? defaultModel;
    this.endpoint = options.endpoint ?? defaultEndpoint;
    this.fetch = getConfiguredFetch(options.fetch);
  }

  async explainClause(input: ExplainClauseInput): Promise<ClauseAnalysisResult> {
    const responseText = await this.createTextResponse(
      createClauseJsonPrompt("Explain this selected clause in plain English", input.selectedText, input.sourceReference),
    );

    return parseClauseResult(
      "explainClause",
      responseText,
      "OpenAI clause explanation",
      "OpenAI returned a clause explanation for the selected text.",
    );
  }

  async summarizeClause(input: SummarizeClauseInput): Promise<ClauseAnalysisResult> {
    const responseText = await this.createTextResponse(
      createClauseJsonPrompt("Summarize this selected clause", input.selectedText, input.sourceReference),
    );

    return parseClauseResult(
      "summarizeClause",
      responseText,
      "OpenAI clause summary",
      "OpenAI returned a summary for the selected text.",
    );
  }

  async compareToPlaybook(input: CompareToPlaybookInput): Promise<PlaybookComparisonResult> {
    const responseText = await this.createTextResponse(
      [
        "Compare the selected clause to the playbook text.",
        "Use only the selected text and playbook excerpt supplied below.",
        "Return compact JSON with keys: title, alignmentSummary, observations.",
        input.playbookName ? `Playbook name: ${input.playbookName}` : null,
        "Selected text:",
        input.selectedText,
        "Playbook text:",
        input.playbookText,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n\n"),
    );

    return parsePlaybookResult(responseText);
  }

  async reviewDefinedTermAnalysis(input: DefinedTermReviewInput): Promise<DeterministicReviewResult> {
    const labels = [
      ...input.detectedTerms.map((term) => term.term),
      ...input.potentialIssues.map((issue) => issue.itemLabel),
    ];
    const responseText = await this.createTextResponse(
      [
        "Review deterministic defined-term analysis results.",
        "Use only these structured results and limited snippets. Do not assume full-document access.",
        "Return compact JSON with keys: summary, reviews. Each review should include itemId, itemLabel, recommendation, reason, correctedLabel, note.",
        "Allowed recommendation values: keep, remove, uncertain.",
        JSON.stringify(input),
      ].join("\n\n"),
    );

    return parseReviewResult(
      "reviewDefinedTermAnalysis",
      responseText,
      "OpenAI reviewed the defined-term analysis results.",
      labels,
    );
  }

  async reviewCrossReferenceAnalysis(input: CrossReferenceReviewInput): Promise<DeterministicReviewResult> {
    const labels = input.potentialBrokenReferences.map((issue) => issue.referenceText);
    const responseText = await this.createTextResponse(
      [
        "Review deterministic cross-reference analysis results.",
        "Use only these structured results and limited snippets. Do not assume full-document access.",
        "Return compact JSON with keys: summary, reviews. Each review should include itemId, itemLabel, recommendation, reason, correctedLabel, note.",
        "Allowed recommendation values: keep, remove, uncertain.",
        JSON.stringify(input),
      ].join("\n\n"),
    );

    return parseReviewResult(
      "reviewCrossReferenceAnalysis",
      responseText,
      "OpenAI reviewed the cross-reference analysis results.",
      labels,
    );
  }

  async reviewObligationAnalysis(input: ObligationReviewInput): Promise<DeterministicReviewResult> {
    const labels = input.potentialObligations.map((obligation) => obligation.obligationText);
    const responseText = await this.createTextResponse(
      [
        "Review deterministic obligation analysis results.",
        "Use only these structured results and limited snippets. Do not assume full-document access.",
        "Return compact JSON with keys: summary, reviews. Each review should include itemId, itemLabel, recommendation, reason, correctedLabel, note.",
        "Allowed recommendation values: keep, remove, uncertain.",
        JSON.stringify(input),
      ].join("\n\n"),
    );

    return parseReviewResult("reviewObligationAnalysis", responseText, "OpenAI reviewed the obligation analysis results.", labels);
  }

  private async createTextResponse(userPrompt: string) {
    if (!this.apiKey) {
      throw new Error(configurationError);
    }

    const response = await this.fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: createSystemPrompt() }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userPrompt }],
          },
        ],
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(getOpenAIErrorMessage(payload, response.status));
    }

    const responseText = extractResponseText(payload);

    if (!responseText) {
      throw new Error("OpenAI returned an empty response.");
    }

    return responseText;
  }
}
