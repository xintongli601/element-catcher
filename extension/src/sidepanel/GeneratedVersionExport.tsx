import { useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  generatedSourceExportEntriesEqual,
  prepareGeneratedSourceExport,
  type GeneratedSourceExportPayload
} from "../export/generated-source-export";
import { getGeneratedComponentVersionUnionById } from "../storage/indexed-db";
import type { GeneratedComponentVersionEntry } from "../shared/generated-version-contract";

declare global {
  interface Window {
    __EC_GENERATED_SOURCE_EXPORT_TEST_HARNESS__?: {
      beforeReread?: () => void | Promise<void>;
      beforeInitiate?: () => void | Promise<void>;
    };
  }
}

type ExportState =
  | { status: "idle" }
  | { status: "preparing" }
  | { status: "initiated"; filename: string }
  | { status: "stale" }
  | { status: "failed" };

export function GeneratedVersionExport({
  entry,
  sourceCaptureId
}: {
  entry: GeneratedComponentVersionEntry;
  sourceCaptureId: string;
}) {
  const [state, setState] = useState<ExportState>({ status: "idle" });
  const attemptTokenRef = useRef(0);
  const objectUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const isPreparing = state.status === "preparing";

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      attemptTokenRef.current += 1;
      revokeOwnedObjectUrl(objectUrlRef);
    };
  }, []);

  const startExport = async () => {
    if (isPreparing) {
      return;
    }

    const attemptToken = attemptTokenRef.current + 1;
    attemptTokenRef.current = attemptToken;
    revokeOwnedObjectUrl(objectUrlRef);
    setState({ status: "preparing" });

    const snapshot = cloneGeneratedVersionEntry(entry);

    try {
      await window.__EC_GENERATED_SOURCE_EXPORT_TEST_HARNESS__?.beforeReread?.();
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
        setState({ status: "stale" });
        return;
      }

      const prepared = prepareGeneratedSourceExport(reread);
      if (!prepared.ok) {
        setState({ status: "failed" });
        return;
      }

      await window.__EC_GENERATED_SOURCE_EXPORT_TEST_HARNESS__?.beforeInitiate?.();
      if (!isCurrentAttempt(attemptTokenRef, attemptToken, mountedRef)) {
        return;
      }

      initiateDownload(prepared.value, objectUrlRef);
      if (!isCurrentAttempt(attemptTokenRef, attemptToken, mountedRef)) {
        revokeOwnedObjectUrl(objectUrlRef);
        return;
      }

      setState({ status: "initiated", filename: prepared.value.filename });
      scheduleOwnedObjectUrlRevocation(objectUrlRef);
    } catch {
      if (isCurrentAttempt(attemptTokenRef, attemptToken, mountedRef)) {
        revokeOwnedObjectUrl(objectUrlRef);
        setState({ status: "failed" });
      }
    }
  };

  return (
    <div className="generated-version-export">
      <button
        className="secondary-action compact-action"
        type="button"
        aria-label={`Export .tsx for ${entry.value.componentName} - ${entry.createdAt}`}
        disabled={isPreparing}
        onClick={() => void startExport()}
      >
        Export .tsx
      </button>
      {state.status === "preparing" ? (
        <p className="save-state save-state-saving" role="status">
          Preparing export...
        </p>
      ) : null}
      {state.status === "initiated" ? (
        <p className="save-state save-state-success" role="status">
          Browser download initiated for {state.filename}.
        </p>
      ) : null}
      {state.status === "stale" ? (
        <p className="save-state save-state-failed" role="alert">
          Generated version changed. Refresh or reopen the generated-version list before exporting.
        </p>
      ) : null}
      {state.status === "failed" ? (
        <p className="save-state save-state-failed" role="alert">
          Could not prepare export. Refresh or reopen the generated-version list before trying again.
        </p>
      ) : null}
    </div>
  );
}

function initiateDownload(payload: GeneratedSourceExportPayload, objectUrlRef: MutableRefObject<string | null>) {
  const blob = new Blob([payload.source], { type: payload.blobType });
  const objectUrl = URL.createObjectURL(blob);
  objectUrlRef.current = objectUrl;

  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = payload.filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function scheduleOwnedObjectUrlRevocation(objectUrlRef: MutableRefObject<string | null>) {
  const ownedUrl = objectUrlRef.current;
  if (!ownedUrl) {
    return;
  }
  window.setTimeout(() => {
    if (objectUrlRef.current === ownedUrl) {
      URL.revokeObjectURL(ownedUrl);
      objectUrlRef.current = null;
    }
  }, 0);
}

function revokeOwnedObjectUrl(objectUrlRef: MutableRefObject<string | null>) {
  if (!objectUrlRef.current) {
    return;
  }
  URL.revokeObjectURL(objectUrlRef.current);
  objectUrlRef.current = null;
}

function isCurrentAttempt(
  attemptTokenRef: MutableRefObject<number>,
  attemptToken: number,
  mountedRef: MutableRefObject<boolean>
) {
  return mountedRef.current && attemptTokenRef.current === attemptToken;
}

function cloneGeneratedVersionEntry(entry: GeneratedComponentVersionEntry): GeneratedComponentVersionEntry {
  return JSON.parse(JSON.stringify(entry)) as GeneratedComponentVersionEntry;
}
