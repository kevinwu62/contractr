export {
  countTermUsages,
  extractDefinedTerms,
  findDefinedButUnusedTerms,
  findPotentialUndefinedTerms,
  findSimilarDefinedTerms,
} from "./definedTerms";
export {
  detectCrossReferenceHeadings,
  detectCrossReferences,
  findPotentialBrokenReferences,
} from "./crossReferences";
export { extractPotentialObligations } from "./obligations";
export { detectSelectionContext } from "./selectionContext";

export type {
  DefinedTermResult,
  FindPotentialUndefinedTermsResult,
  SimilarDefinedTermsResult,
} from "./definedTerms";
export type {
  CrossReference,
  CrossReferenceHeading,
  CrossReferenceType,
  PotentialBrokenReference,
} from "./crossReferences";
export type { PotentialObligation } from "./obligations";
export type {
  SelectionActionId,
  SelectionAvailableAction,
  SelectionContext,
  SelectionContextOptions,
  SelectionConfirmedDefinedTerm,
  SelectionDefinedTermCandidate,
  SelectionKnownDefinedTerm,
  SelectionObligationSignal,
  SelectionReference,
  SelectionReferenceType,
} from "./selectionContext";
