import type {
  CaptureRecord,
  ChildElementSummary,
  NormalizedStyleSnapshot,
  PseudoElementStyleSnapshot,
  SanitizedDomNode
} from "../shared/capture-schema";
import type {
  ComponentGenerationRequestV1,
  ComponentGenerationRequestWithoutDataUrlV1,
  ComponentGenerationResponseV1
} from "../shared/generation-contract";

export type {
  ComponentGenerationRequestV1,
  ComponentGenerationRequestWithoutDataUrlV1,
  ComponentGenerationResponseV1,
  ExactCaptureContextProjectionV1,
  OpaqueGenerationProviderMetadata,
  TransmittedBoxEdgesV1,
  TransmittedChildSummaryV1,
  TransmittedColorSummaryV1,
  TransmittedComputedStylesV1,
  TransmittedDomNodeV1,
  TransmittedLayoutSummaryV1,
  TransmittedPseudoStylesV1,
  TransmittedSpacingSummaryV1,
  TransmittedTypographySummaryV1
} from "../shared/generation-contract";

export type ComponentGenerationLocalContextV1 = {
  contractVersion: 1;
  sourceCaptureId: string;
  sourceCaptureSavedAt: string;
  sourceRecordWrapperId: string;
  sourceRecordValidationDigest: string;
  screenshotStorageKey: string;
  screenshotBlobDigest: string;
  reviewFingerprint: string;
  reviewedRequestWithoutDataUrl: ComponentGenerationRequestWithoutDataUrlV1;
};

export type GenerationTransport = {
  generate(request: ComponentGenerationRequestV1, signal: AbortSignal): Promise<ComponentGenerationResponseV1>;
};

export type GenerationReviewModel = {
  localContext: ComponentGenerationLocalContextV1;
  screenshot: {
    mediaType: "image/png";
    width: number;
    height: number;
    byteLength: number;
    digest: string;
    blob: Blob;
  };
  endpointCategory: "backend-unconfigured" | "deterministic-mock" | "local-development-proxy";
};

export type ProjectionInput = {
  record: CaptureRecord;
};

export type ProjectionSourceTypes = {
  domNode: SanitizedDomNode;
  childSummary: ChildElementSummary;
  computed: NormalizedStyleSnapshot;
  pseudo: PseudoElementStyleSnapshot;
};
