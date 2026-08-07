import { useEffect, useId, useRef, useState, type MutableRefObject } from "react";
import { createPortableComponentBundle } from "../export/portable-component-bundle";
import { generatedSourceExportEntriesEqual } from "../export/generated-source-export";
import { getGeneratedComponentVersionUnionById } from "../storage/indexed-db";
import type { GeneratedComponentVersionEntry } from "../shared/generated-version-contract";

declare global {
  interface Window {
    __EC_PORTABLE_COMPONENT_BUNDLE_EXPORT_TEST_HARNESS__?: {
      beforeReread?: () => void | Promise<void>;
      beforeInitiate?: () => void | Promise<void>;
    };
  }
}

type BundleExportState =
  | { status: "idle" }
  | { status: "preparing" }
  | { status: "initiated"; filename: string }
  | { status: "stale" }
  | { status: "failed" };

type BundleDownloadPayload = Readonly<{
  filename: string;
  bytes: Uint8Array;
  blobType: "application/zip";
}>;

export function GeneratedVersionBundleExport({
  entry,
  sourceCaptureId
}: {
  entry: GeneratedComponentVersionEntry;
  sourceCaptureId: string;
}) {
  const statusId = useId();
  const [state, setState] = useState<BundleExportState>({ status: "idle" });
  const attemptTokenRef = useRef(0);
  const preparingRef = useRef(false);
  const objectUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const isPreparing = state.status === "preparing";

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      attemptTokenRef.current += 1;
      preparingRef.current = false;
      revokeOwnedObjectUrl(objectUrlRef);
    };
  }, []);

  useEffect(() => {
    attemptTokenRef.current += 1;
    preparingRef.current = false;
    revokeOwnedObjectUrl(objectUrlRef);
    setState({ status: "idle" });
  }, [entry, sourceCaptureId]);

  const startExport = async () => {
    if (isPreparing || preparingRef.current) {
      return;
    }

    const attemptToken = attemptTokenRef.current + 1;
    attemptTokenRef.current = attemptToken;
    preparingRef.current = true;
    revokeOwnedObjectUrl(objectUrlRef);
    setState({ status: "preparing" });

    try {
      const snapshot = structuredClone(entry);

      await window.__EC_PORTABLE_COMPONENT_BUNDLE_EXPORT_TEST_HARNESS__?.beforeReread?.();
      if (!isCurrentAttempt(attemptTokenRef, attemptToken, mountedRef)) {
        return;
      }

      const reread = await getGeneratedComponentVersionUnionById(snapshot.id);
      if (!isCurrentAttempt(attemptTokenRef, attemptToken, mountedRef)) {
        return;
      }

      if (
        !reread ||
        reread.id !== snapshot.id ||
        reread.sourceCaptureId !== sourceCaptureId ||
        reread.sourceCaptureId !== snapshot.sourceCaptureId ||
        !generatedSourceExportEntriesEqual(reread, snapshot)
      ) {
        preparingRef.current = false;
        setState({ status: "stale" });
        return;
      }

      const bundle = createPortableComponentBundle(reread);
      if (!bundle.ok) {
        preparingRef.current = false;
        setState({ status: "failed" });
        return;
      }

      await window.__EC_PORTABLE_COMPONENT_BUNDLE_EXPORT_TEST_HARNESS__?.beforeInitiate?.();
      if (!isCurrentAttempt(attemptTokenRef, attemptToken, mountedRef)) {
        return;
      }

      const initiated = initiateDownload(
        {
          filename: bundle.value.filename,
          bytes: bundle.value.bytes,
          blobType: bundle.value.blobType
        },
        objectUrlRef
      );
      if (!isCurrentAttempt(attemptTokenRef, attemptToken, mountedRef)) {
        revokeOwnedObjectUrl(objectUrlRef);
        return;
      }
      if (!initiated) {
        preparingRef.current = false;
        setState({ status: "failed" });
        return;
      }

      preparingRef.current = false;
      setState({ status: "initiated", filename: bundle.value.filename });
      scheduleOwnedObjectUrlRevocation(objectUrlRef);
    } catch {
      if (isCurrentAttempt(attemptTokenRef, attemptToken, mountedRef)) {
        revokeOwnedObjectUrl(objectUrlRef);
        preparingRef.current = false;
        setState({ status: "failed" });
      }
    }
  };

  const statusText = getStatusText(state);

  return (
    <div className="generated-version-export">
      <button
        className="secondary-action compact-action"
        type="button"
        aria-label={`Export bundle for ${entry.value.componentName} - ${entry.createdAt}`}
        aria-describedby={statusText ? statusId : undefined}
        disabled={isPreparing}
        onClick={() => void startExport()}
      >
        Export bundle
      </button>
      {state.status === "preparing" ? (
        <p id={statusId} className="save-state save-state-saving" role="status">
          {statusText}
        </p>
      ) : null}
      {state.status === "initiated" ? (
        <p id={statusId} className="save-state save-state-success" role="status">
          {statusText}
        </p>
      ) : null}
      {state.status === "stale" ? (
        <p id={statusId} className="save-state save-state-failed" role="alert">
          {statusText}
        </p>
      ) : null}
      {state.status === "failed" ? (
        <p id={statusId} className="save-state save-state-failed" role="alert">
          {statusText}
        </p>
      ) : null}
    </div>
  );
}

function initiateDownload(payload: BundleDownloadPayload, objectUrlRef: MutableRefObject<string | null>) {
  let anchor: HTMLAnchorElement | null = null;
  let initiated = false;
  try {
    const exactBytes = payload.bytes.slice();
    const blobPart = exactBytes.buffer.slice(exactBytes.byteOffset, exactBytes.byteOffset + exactBytes.byteLength);
    const blob = new Blob([blobPart], { type: payload.blobType });
    const objectUrl = URL.createObjectURL(blob);
    objectUrlRef.current = objectUrl;

    anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = payload.filename;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    initiated = true;
  } catch {
    revokeOwnedObjectUrl(objectUrlRef);
  } finally {
    if (anchor && !cleanupTemporaryAnchor(anchor)) {
      revokeOwnedObjectUrl(objectUrlRef);
      initiated = false;
    }
  }
  return initiated;
}

function cleanupTemporaryAnchor(anchor: HTMLAnchorElement) {
  try {
    anchor.remove();
  } catch {
    if (!anchor.isConnected) {
      return true;
    }
    try {
      anchor.parentNode?.removeChild(anchor);
    } catch {
      neutralizeTemporaryAnchor(anchor);
      return false;
    }
  }
  if (anchor.isConnected) {
    neutralizeTemporaryAnchor(anchor);
    return false;
  }
  return true;
}

function neutralizeTemporaryAnchor(anchor: HTMLAnchorElement) {
  try {
    anchor.removeAttribute("href");
  } catch {
    // Best-effort inert cleanup only.
  }
  try {
    anchor.removeAttribute("download");
  } catch {
    // Best-effort inert cleanup only.
  }
  try {
    anchor.tabIndex = -1;
  } catch {
    // Best-effort inert cleanup only.
  }
  try {
    anchor.setAttribute("aria-hidden", "true");
  } catch {
    // Best-effort inert cleanup only.
  }
  try {
    anchor.style.display = "none";
  } catch {
    // Best-effort inert cleanup only.
  }
}

function scheduleOwnedObjectUrlRevocation(objectUrlRef: MutableRefObject<string | null>) {
  const ownedUrl = objectUrlRef.current;
  if (!ownedUrl) {
    return;
  }
  window.setTimeout(() => {
    if (objectUrlRef.current === ownedUrl) {
      revokeOwnedObjectUrl(objectUrlRef);
    }
  }, 0);
}

function revokeOwnedObjectUrl(objectUrlRef: MutableRefObject<string | null>) {
  const ownedUrl = objectUrlRef.current;
  if (!ownedUrl) {
    return;
  }
  objectUrlRef.current = null;
  try {
    URL.revokeObjectURL(ownedUrl);
  } catch {
    // Safe local cleanup: ownership is already cleared, so later attempts cannot revoke this URL again.
  }
}

function isCurrentAttempt(
  attemptTokenRef: MutableRefObject<number>,
  attemptToken: number,
  mountedRef: MutableRefObject<boolean>
) {
  return mountedRef.current && attemptTokenRef.current === attemptToken;
}

function getStatusText(state: BundleExportState) {
  switch (state.status) {
    case "preparing":
      return "Preparing bundle export...";
    case "initiated":
      return `Browser download initiated for ${state.filename}. Bundle V1 is local source-only and is not a runnable or dependency-complete project.`;
    case "stale":
      return "Generated version changed. Refresh or reopen the generated-version list before exporting.";
    case "failed":
      return "Could not prepare bundle export. Refresh or reopen the generated-version list before trying again.";
    case "idle":
      return undefined;
  }
}
