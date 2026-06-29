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
