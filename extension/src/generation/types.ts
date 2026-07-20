import type {
  CaptureRecord,
  ChildElementSummary,
  NormalizedStyleSnapshot,
  PseudoElementStyleSnapshot,
  SanitizedDomNode
} from "../shared/capture-schema";

export type TransmittedBoxEdgesV1 = {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
};

export type TransmittedDomNodeV1 = {
  tagName: string;
  attributes: {
    id?: string;
    class?: string;
    role?: string;
    ariaLabel?: string;
    ariaPressed?: string;
    ariaSelected?: string;
    ariaExpanded?: string;
    ariaCurrent?: string;
    type?: string;
    name?: string;
  };
  textPreview?: string;
  children: TransmittedDomNodeV1[];
};

export type TransmittedChildSummaryV1 = {
  tagName: string;
  semanticRole?: string;
  textPreview?: string;
  childCount: number;
};

export type TransmittedComputedStylesV1 = {
  display?: string;
  position?: string;
  boxSizing?: string;
  width?: string;
  height?: string;
  color?: string;
  backgroundColor?: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  letterSpacing?: string;
  textAlign?: string;
  border?: string;
  borderRadius?: string;
  boxShadow?: string;
  padding?: TransmittedBoxEdgesV1;
  margin?: TransmittedBoxEdgesV1;
  gap?: string;
  flexDirection?: string;
  alignItems?: string;
  justifyContent?: string;
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
};

export type TransmittedPseudoStylesV1 = {
  exists: boolean;
  content?: string;
  display?: string;
  color?: string;
  backgroundColor?: string;
  width?: string;
  height?: string;
};

export type TransmittedTypographySummaryV1 = {
  primaryFont?: string;
  scale?: string[];
  weights?: string[];
  notes?: string;
};

export type TransmittedColorSummaryV1 = {
  foreground?: string;
  background?: string;
  accent?: string;
  border?: string;
  roles?: Array<{
    role: string;
    value: string;
  }>;
};

export type TransmittedLayoutSummaryV1 = {
  display?: string;
  direction?: string;
  alignment?: string;
  density?: "compact" | "comfortable" | "spacious";
  notes?: string;
};

export type TransmittedSpacingSummaryV1 = {
  padding?: TransmittedBoxEdgesV1;
  margin?: TransmittedBoxEdgesV1;
  gap?: string;
  notes?: string;
};

export type ExactCaptureContextProjectionV1 = {
  library: {
    title?: string;
    componentType?: string;
    tags: string[];
  };
  element: {
    tagName: string;
    semanticRole?: string;
    rect: {
      width: number;
      height: number;
    };
  };
  dom: {
    sanitizedSnapshot: TransmittedDomNodeV1;
    childSummary: TransmittedChildSummaryV1[];
  };
  styles: {
    computed: TransmittedComputedStylesV1;
    before?: TransmittedPseudoStylesV1;
    after?: TransmittedPseudoStylesV1;
  };
  summaries: {
    componentType?: string;
    typography: TransmittedTypographySummaryV1;
    colors: TransmittedColorSummaryV1;
    layout: TransmittedLayoutSummaryV1;
    spacing: TransmittedSpacingSummaryV1;
  };
  pageTitlePolicy: {
    included: false;
    reason: string;
  };
  sourceUrlPolicy: {
    included: false;
    reason: string;
  };
};

export type ComponentGenerationRequestWithoutDataUrlV1 = {
  contractVersion: 1;
  screenshot: {
    mediaType: "image/png";
    width: number;
    height: number;
    byteLength: number;
  };
  captureContext: ExactCaptureContextProjectionV1;
  requestedOutput: {
    framework: "react";
    styling: "tailwind";
    fields: ["componentName", "code", "summary", "approximationNotes"];
  };
};

export type ComponentGenerationRequestV1 = ComponentGenerationRequestWithoutDataUrlV1 & {
  screenshot: ComponentGenerationRequestWithoutDataUrlV1["screenshot"] & {
    dataUrl: string;
  };
};

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

export type OpaqueGenerationProviderMetadata = {
  providerLabel?: string;
  providerModelLabel?: string;
};

export type ComponentGenerationResponseV1 = {
  contractVersion: 1;
  componentName: string;
  framework: "react";
  styling: "tailwind";
  code: string;
  summary: string;
  approximationNotes: string;
  metadata?: OpaqueGenerationProviderMetadata;
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
  };
  endpointCategory: "backend-unconfigured" | "deterministic-mock";
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
