import type { Page } from "@playwright/test";
import type { CaptureRecord, JsonObject, SerializableRect } from "../../extension/src/shared/capture-schema";
import { serializeCaptureRecordV1, validateCaptureRecordV1 } from "../../extension/src/capture/capture-record-v1";

export type CaptureFixtureSpec = {
  id: string;
  title: string;
  libraryComponentType?: string;
  summaryComponentType?: string;
  tagName: string;
  semanticRole: string;
  sourceUrl: string;
  pageTitle: string;
  savedAt: string;
  width: number;
  height: number;
  color: string;
  libraryTags?: string[];
  libraryNotes?: string;
  elementTextPreview?: string;
  elementId?: string;
  elementClassNames?: string[];
  domTextPreview?: string;
  childSummaryTextPreview?: string;
  styleSentinel?: string;
  generatedVersionCode?: string;
  typographyNotes?: string;
  colorRole?: { role: string; value: string };
  layoutNotes?: string;
  spacingNotes?: string;
  spacingGap?: string;
};

export type SeededCapture = {
  record: CaptureRecord;
  savedAt: string;
  storageKey: string;
  title: string;
  sourceDisplay: string;
  color: string;
};

export const ELEMENT_CATCHER_DATABASE_NAME = "element-catcher-local-persistence";
export const ELEMENT_CATCHER_DATABASE_VERSION = 1;
export const CAPTURE_RECORD_STORE_NAME = "captureRecords";
export const SCREENSHOT_ASSET_STORE_NAME = "screenshotAssets";

export const DEFAULT_CAPTURE_FIXTURES: CaptureFixtureSpec[] = [
  {
    id: "capture-00000000-0000-0000-0000-000000000001",
    title: "Alpha Card",
    libraryComponentType: "pricing-card",
    summaryComponentType: "pricing-card",
    tagName: "article",
    semanticRole: "card",
    sourceUrl: "https://user:secret@example.test/library/alpha?token=hidden#private",
    pageTitle: "Alpha Fixture",
    savedAt: "2026-07-18T09:00:00.000Z",
    width: 80,
    height: 48,
    color: "#2563eb"
  },
  {
    id: "capture-00000000-0000-0000-0000-000000000002",
    title: "Beta Banner",
    libraryComponentType: "hero-banner",
    summaryComponentType: "hero-banner",
    tagName: "section",
    semanticRole: "banner",
    sourceUrl: "https://example.test/library/beta",
    pageTitle: "Beta Fixture",
    savedAt: "2026-07-18T10:00:00.000Z",
    width: 96,
    height: 52,
    color: "#0f766e"
  },
  {
    id: "capture-00000000-0000-0000-0000-000000000003",
    title: "Gamma Modal",
    libraryComponentType: "modal",
    summaryComponentType: "modal",
    tagName: "dialog",
    semanticRole: "dialog",
    sourceUrl: "https://example.test/library/gamma",
    pageTitle: "Gamma Fixture",
    savedAt: "2026-07-18T11:00:00.000Z",
    width: 72,
    height: 64,
    color: "#7c3aed"
  }
];

export async function resetAndSeedSavedCaptures(page: Page, specs = DEFAULT_CAPTURE_FIXTURES) {
  const records = specs.map(createCaptureRecordFixture);
  for (const record of records) {
    validateCaptureRecordV1(record);
  }

  const seeded = await runDatabaseOperation<SeedArg, SeededCapture[]>(page, "seed", {
    records: records.map((record) => serializeCaptureRecordV1(record)),
    specs
  });

  return seeded.sort(compareSeededCapturesNewestFirst);
}

export async function clearTestData(page: Page) {
  await runDatabaseOperation(page, "clear", {});
}

export async function readPersistenceCounts(page: Page) {
  return runDatabaseOperation<Record<string, never>, PersistenceCounts>(page, "counts", {});
}

export async function readRecordWrapper(page: Page, recordId: string) {
  return runDatabaseOperation<{ recordId: string }, unknown>(page, "readRecordWrapper", { recordId });
}

export async function readAllRecordWrappers(page: Page) {
  return runDatabaseOperation<Record<string, never>, unknown[]>(page, "readAllRecordWrappers", {});
}

export async function readScreenshotAssetSnapshot(page: Page, storageKey: string) {
  return runDatabaseOperation<{ storageKey: string }, ScreenshotAssetSnapshot>(page, "readScreenshotAssetSnapshot", {
    storageKey
  });
}

export async function readAllScreenshotAssetSnapshots(page: Page) {
  return runDatabaseOperation<Record<string, never>, ScreenshotAssetSnapshot[]>(page, "readAllScreenshotAssetSnapshots", {});
}

export async function deleteRecordWrapper(page: Page, recordId: string) {
  await runDatabaseOperation(page, "deleteRecordWrapper", { recordId });
}

export async function restoreRecordWrapper(page: Page, wrapper: unknown) {
  await runDatabaseOperation(page, "restoreRecordWrapper", { wrapper });
}

export async function replaceWrapperSavedAt(page: Page, recordId: string, savedAt: string) {
  await runDatabaseOperation(page, "replaceWrapperSavedAt", { recordId, savedAt });
}

export async function deleteScreenshotAsset(page: Page, storageKey: string) {
  await runDatabaseOperation(page, "deleteScreenshotAsset", { storageKey });
}

export async function restoreScreenshotAsset(page: Page, seededCapture: SeededCapture) {
  await runDatabaseOperation(page, "restoreScreenshotAsset", { seededCapture });
}

export async function replaceScreenshotAssetVariant(
  page: Page,
  options: {
    seededCapture: SeededCapture;
    variant: "valid-png" | "signature-only" | "truncated-png" | "corrupted-png";
    width?: number;
    height?: number;
    color?: string;
    mediaType?: string;
    declaredByteLength?: number;
    declaredWidth?: number;
    declaredHeight?: number;
    updateRecordReference?: boolean;
  }
) {
  return runDatabaseOperation<typeof options, { byteLength: number; digest: string; type: string }>(page, "replaceScreenshotAssetVariant", options);
}

export async function createBrowserPngDataUrl(
  page: Page,
  options: {
    width: number;
    height: number;
    color: string;
  }
) {
  return runDatabaseOperation<typeof options, { dataUrl: string; byteLength: number; digest: string }>(page, "createBrowserPngDataUrl", options);
}

export async function replaceWrapperWithIdMismatch(page: Page, seededCapture: SeededCapture) {
  await runDatabaseOperation(page, "replaceWrapperWithIdMismatch", { seededCapture });
}

export function createCaptureRecordFixture(spec: CaptureFixtureSpec): CaptureRecord {
  const crop = createRect(spec.width, spec.height);
  return {
    schemaVersion: 1,
    id: spec.id,
    createdAt: "2026-07-18T08:00:00.000Z",
    source: {
      url: spec.sourceUrl,
      pageTitle: spec.pageTitle
    },
    environment: {
      viewport: {
        width: 1280,
        height: 800
      },
      devicePixelRatio: 1
    },
    element: {
      tagName: spec.tagName,
      semanticRole: spec.semanticRole,
      textPreview: spec.elementTextPreview ?? `${spec.title} fixture preview`,
      ...(spec.elementId ? { id: spec.elementId } : {}),
      ...(spec.elementClassNames ? { classNames: spec.elementClassNames } : {}),
      rect: crop
    },
    dom: {
      sanitizedSnapshot: {
        tagName: spec.tagName,
        attributes: {
          role: spec.semanticRole,
          "data-fixture": "element-catcher-e2e"
        },
        textPreview: spec.domTextPreview ?? "Safe fixture text",
        children: [
          {
            tagName: "h3",
            attributes: {},
            textPreview: spec.domTextPreview ?? "Fixture heading",
            children: []
          }
        ]
      },
      childSummary: [
        {
          tagName: "h3",
          semanticRole: "heading",
          textPreview: spec.childSummaryTextPreview ?? "Fixture heading",
          childCount: 0
        }
      ]
    },
    styles: {
      computed: {
        display: "flex",
        boxSizing: "border-box",
        width: `${spec.width}px`,
        height: `${spec.height}px`,
        color: "#111827",
        backgroundColor: spec.styleSentinel ?? spec.color,
        borderRadius: "8px",
        padding: {
          top: "12px",
          right: "12px",
          bottom: "12px",
          left: "12px"
        }
      }
    },
    summaries: {
      ...(spec.summaryComponentType ? { componentType: spec.summaryComponentType } : {}),
      typography: {
        primaryFont: "Inter",
        weights: ["500", "700"],
        ...(spec.typographyNotes ? { notes: spec.typographyNotes } : {})
      },
      colors: {
        foreground: "#111827",
        background: spec.color,
        accent: "#ffffff",
        ...(spec.colorRole ? { roles: [spec.colorRole] } : {})
      },
      layout: {
        display: "flex",
        direction: "vertical",
        density: "comfortable",
        ...(spec.layoutNotes ? { notes: spec.layoutNotes } : {})
      },
      spacing: {
        gap: spec.spacingGap ?? "8px",
        padding: {
          top: "12px",
          right: "12px",
          bottom: "12px",
          left: "12px"
        },
        ...(spec.spacingNotes ? { notes: spec.spacingNotes } : {})
      }
    },
    assets: {
      screenshot: {
        storageKey: `screenshots/${spec.id}.png`,
        mediaType: "image/png",
        width: spec.width,
        height: spec.height,
        crop
      }
    },
    library: {
      title: spec.title,
      ...(spec.libraryComponentType ? { componentType: spec.libraryComponentType } : {}),
      tags: spec.libraryTags ?? ["e2e", "milestone-4b"],
      notes: spec.libraryNotes ?? "Deterministic Playwright fixture."
    },
    generatedVersions: spec.generatedVersionCode
      ? [
          {
            id: `generated-${spec.id}`,
            createdAt: "2026-07-18T08:30:00.000Z",
            generator: "placeholder",
            componentName: "GeneratedFixture",
            framework: "react",
            styling: "tailwind",
            code: spec.generatedVersionCode,
            summary: "Synthetic generated fixture."
          }
        ]
      : []
  };
}

function createRect(width: number, height: number): SerializableRect {
  return {
    x: 10,
    y: 20,
    width,
    height,
    top: 20,
    right: 10 + width,
    bottom: 20 + height,
    left: 10
  };
}

function compareSeededCapturesNewestFirst(left: SeededCapture, right: SeededCapture) {
  if (left.savedAt !== right.savedAt) {
    return right.savedAt.localeCompare(left.savedAt);
  }

  return left.record.id.localeCompare(right.record.id);
}

type SeedArg = {
  records: JsonObject[];
  specs: CaptureFixtureSpec[];
};

type PersistenceCounts = {
  version: number;
  stores: string[];
  captureRecords: number;
  screenshotAssets: number;
};

type ScreenshotAssetSnapshot = {
  storageKey: string;
  mediaType: string;
  width: number;
  height: number;
  byteLength: number;
  crop: SerializableRect;
  digest: string;
};

async function runDatabaseOperation<TArg, TResult>(page: Page, operation: string, arg: TArg) {
  return page.evaluate(
    async ({ operation, arg, constants }) => {
      const {
        databaseName,
        databaseVersion,
        captureRecordStoreName,
        screenshotAssetStoreName
      } = constants;

      const operations: Record<string, (value: unknown) => Promise<unknown>> = {
        seed: async (value) => {
          const { records, specs } = value as SeedArg;
          const database = await openDatabase();

          try {
            await clearStores(database);
            const results: SeededCapture[] = [];

            for (let index = 0; index < records.length; index += 1) {
              const spec = specs[index];
              const record = records[index] as CaptureRecord;
              const blob = await createPngBlob(spec.width, spec.height, spec.color);
              record.assets.screenshot.byteLength = blob.size;

              await putValue(database, screenshotAssetStoreName, {
                storageKey: record.assets.screenshot.storageKey,
                blob,
                mediaType: "image/png",
                width: spec.width,
                height: spec.height,
                byteLength: blob.size,
                crop: record.assets.screenshot.crop
              });
              await putValue(database, captureRecordStoreName, {
                id: record.id,
                value: JSON.parse(JSON.stringify(record)) as JsonObject,
                savedAt: spec.savedAt
              });

              results.push({
                record,
                savedAt: spec.savedAt,
                storageKey: record.assets.screenshot.storageKey,
                title: getFixtureDisplayTitle(record),
                sourceDisplay: getFixtureSourceDisplay(record.source.url),
                color: spec.color
              });
            }

            return results;
          } finally {
            database.close();
          }
        },
        clear: async () => {
          const database = await openDatabase();

          try {
            await clearStores(database);
            return undefined;
          } finally {
            database.close();
          }
        },
        counts: async () => {
          const database = await openDatabase();

          try {
            return {
              version: database.version,
              stores: Array.from(database.objectStoreNames).sort(),
              captureRecords: await countStore(database, captureRecordStoreName),
              screenshotAssets: await countStore(database, screenshotAssetStoreName)
            };
          } finally {
            database.close();
          }
        },
        readRecordWrapper: async (value) => {
          const { recordId } = value as { recordId: string };
          const database = await openDatabase();

          try {
            return await getValue(database, captureRecordStoreName, recordId);
          } finally {
            database.close();
          }
        },
        readAllRecordWrappers: async () => {
          const database = await openDatabase();

          try {
            return await getAllValues(database, captureRecordStoreName);
          } finally {
            database.close();
          }
        },
        readScreenshotAssetSnapshot: async (value) => {
          const { storageKey } = value as { storageKey: string };
          const database = await openDatabase();

          try {
            const asset = await getValue(database, screenshotAssetStoreName, storageKey) as {
              storageKey: string;
              blob: Blob;
              mediaType: string;
              width: number;
              height: number;
              byteLength: number;
              crop: SerializableRect;
            } | undefined;

            if (!asset) {
              return undefined;
            }

            return {
              storageKey: asset.storageKey,
              mediaType: asset.mediaType,
              width: asset.width,
              height: asset.height,
              byteLength: asset.byteLength,
              crop: asset.crop,
              digest: await digestBlob(asset.blob)
            };
          } finally {
            database.close();
          }
        },
        readAllScreenshotAssetSnapshots: async () => {
          const database = await openDatabase();

          try {
            const assets = await getAllValues(database, screenshotAssetStoreName) as Array<{
              storageKey: string;
              blob: Blob;
              mediaType: string;
              width: number;
              height: number;
              byteLength: number;
              crop: SerializableRect;
            }>;

            const snapshots = [];
            for (const asset of assets) {
              snapshots.push({
                storageKey: asset.storageKey,
                mediaType: asset.mediaType,
                width: asset.width,
                height: asset.height,
                byteLength: asset.byteLength,
                crop: asset.crop,
                digest: await digestBlob(asset.blob)
              });
            }

            return snapshots.sort((left, right) => left.storageKey.localeCompare(right.storageKey));
          } finally {
            database.close();
          }
        },
        deleteRecordWrapper: async (value) => {
          const { recordId } = value as { recordId: string };
          const database = await openDatabase();

          try {
            await deleteValue(database, captureRecordStoreName, recordId);
            return undefined;
          } finally {
            database.close();
          }
        },
        replaceWrapperSavedAt: async (value) => {
          const { recordId, savedAt } = value as { recordId: string; savedAt: string };
          const database = await openDatabase();

          try {
            const wrapper = await getValue(database, captureRecordStoreName, recordId) as Record<string, unknown> | undefined;
            if (!wrapper) {
              throw new Error("Could not alter missing wrapper savedAt.");
            }

            await putValue(database, captureRecordStoreName, {
              ...wrapper,
              savedAt
            });
            return undefined;
          } finally {
            database.close();
          }
        },
        restoreRecordWrapper: async (value) => {
          const { wrapper } = value as { wrapper: unknown };
          const database = await openDatabase();

          try {
            await putValue(database, captureRecordStoreName, wrapper);
            return undefined;
          } finally {
            database.close();
          }
        },
        deleteScreenshotAsset: async (value) => {
          const { storageKey } = value as { storageKey: string };
          const database = await openDatabase();

          try {
            await deleteValue(database, screenshotAssetStoreName, storageKey);
            return undefined;
          } finally {
            database.close();
          }
        },
        restoreScreenshotAsset: async (value) => {
          const { seededCapture } = value as { seededCapture: SeededCapture };
          const database = await openDatabase();

          try {
            const blob = await createPngBlob(
              seededCapture.record.assets.screenshot.width,
              seededCapture.record.assets.screenshot.height,
              seededCapture.color
            );
            await putValue(database, screenshotAssetStoreName, {
              storageKey: seededCapture.storageKey,
              blob,
              mediaType: "image/png",
              width: seededCapture.record.assets.screenshot.width,
              height: seededCapture.record.assets.screenshot.height,
              byteLength: blob.size,
              crop: seededCapture.record.assets.screenshot.crop
            });
            return undefined;
          } finally {
            database.close();
          }
        },
        replaceScreenshotAssetVariant: async (value) => {
          const {
            seededCapture,
            variant,
            width,
            height,
            color,
            mediaType,
            declaredByteLength,
            declaredWidth,
            declaredHeight,
            updateRecordReference
          } = value as {
            seededCapture: SeededCapture;
            variant: "valid-png" | "signature-only" | "truncated-png" | "corrupted-png";
            width?: number;
            height?: number;
            color?: string;
            mediaType?: string;
            declaredByteLength?: number;
            declaredWidth?: number;
            declaredHeight?: number;
            updateRecordReference?: boolean;
          };
          const database = await openDatabase();

          try {
            const actualWidth = width ?? seededCapture.record.assets.screenshot.width;
            const actualHeight = height ?? seededCapture.record.assets.screenshot.height;
            const blob = await createScreenshotVariantBlob(variant, actualWidth, actualHeight, color ?? seededCapture.color);
            const nextMediaType = mediaType ?? "image/png";
            const nextWidth = declaredWidth ?? actualWidth;
            const nextHeight = declaredHeight ?? actualHeight;
            const nextByteLength = declaredByteLength ?? blob.size;
            const nextCrop = {
              ...seededCapture.record.assets.screenshot.crop,
              width: nextWidth,
              height: nextHeight,
              right: seededCapture.record.assets.screenshot.crop.left + nextWidth,
              bottom: seededCapture.record.assets.screenshot.crop.top + nextHeight
            };
            await putValue(database, screenshotAssetStoreName, {
              storageKey: seededCapture.storageKey,
              blob,
              mediaType: nextMediaType,
              width: nextWidth,
              height: nextHeight,
              byteLength: nextByteLength,
              crop: nextCrop
            });
            if (updateRecordReference) {
              const wrapper = await getValue(database, captureRecordStoreName, seededCapture.record.id) as {
                id: string;
                value: CaptureRecord;
                savedAt: string;
              } | undefined;
              if (!wrapper) {
                throw new Error("Could not update missing wrapper screenshot reference.");
              }
              const { byteLength: _omittedByteLength, ...screenshotReferenceWithoutByteLength } = wrapper.value.assets.screenshot;
              await putValue(database, captureRecordStoreName, {
                ...wrapper,
                value: {
                  ...wrapper.value,
                  assets: {
                    ...wrapper.value.assets,
                    screenshot: {
                      ...screenshotReferenceWithoutByteLength,
                      mediaType: nextMediaType,
                      width: nextWidth,
                      height: nextHeight,
                      crop: nextCrop
                    }
                  }
                }
              });
            }
            return {
              byteLength: blob.size,
              digest: await digestBlob(blob),
              type: blob.type
            };
          } finally {
            database.close();
          }
        },
        createBrowserPngDataUrl: async (value) => {
          const { width, height, color } = value as { width: number; height: number; color: string };
          const blob = await createPngBlob(width, height, color);
          return {
            dataUrl: await blobToDataUrl(blob),
            byteLength: blob.size,
            digest: await digestBlob(blob)
          };
        },
        replaceWrapperWithIdMismatch: async (value) => {
          const { seededCapture } = value as { seededCapture: SeededCapture };
          const database = await openDatabase();

          try {
            await putValue(database, captureRecordStoreName, {
              id: seededCapture.record.id,
              value: {
                ...seededCapture.record,
                id: "capture-ffffffff-ffff-ffff-ffff-ffffffffffff"
              },
              savedAt: seededCapture.savedAt
            });
            return undefined;
          } finally {
            database.close();
          }
        }
      };

      async function openDatabase() {
        return new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(databaseName, databaseVersion);

          request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(screenshotAssetStoreName)) {
              database.createObjectStore(screenshotAssetStoreName, { keyPath: "storageKey" });
            }

            if (!database.objectStoreNames.contains(captureRecordStoreName)) {
              database.createObjectStore(captureRecordStoreName, { keyPath: "id" });
            }
          };
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
      }

      function requestResult<T>(request: IDBRequest<T>) {
        return new Promise<T>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      }

      function transactionComplete(transaction: IDBTransaction) {
        return new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onabort = () => reject(transaction.error);
          transaction.onerror = () => reject(transaction.error);
        });
      }

      async function clearStores(database: IDBDatabase) {
        const transaction = database.transaction([captureRecordStoreName, screenshotAssetStoreName], "readwrite");
        transaction.objectStore(captureRecordStoreName).clear();
        transaction.objectStore(screenshotAssetStoreName).clear();
        await transactionComplete(transaction);
      }

      async function putValue(database: IDBDatabase, storeName: string, value: unknown) {
        const transaction = database.transaction(storeName, "readwrite");
        transaction.objectStore(storeName).put(value);
        await transactionComplete(transaction);
      }

      async function deleteValue(database: IDBDatabase, storeName: string, key: string) {
        const transaction = database.transaction(storeName, "readwrite");
        transaction.objectStore(storeName).delete(key);
        await transactionComplete(transaction);
      }

      async function getValue(database: IDBDatabase, storeName: string, key: string) {
        return requestResult(database.transaction(storeName, "readonly").objectStore(storeName).get(key));
      }

      async function getAllValues(database: IDBDatabase, storeName: string) {
        return requestResult(database.transaction(storeName, "readonly").objectStore(storeName).getAll());
      }

      async function countStore(database: IDBDatabase, storeName: string) {
        return requestResult(database.transaction(storeName, "readonly").objectStore(storeName).count());
      }

      async function createPngBlob(width: number, height: number, color: string) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Could not create canvas context for PNG fixture.");
        }

        context.fillStyle = color;
        context.fillRect(0, 0, width, height);
        context.fillStyle = "#ffffff";
        context.fillRect(4, 4, Math.max(1, width - 8), Math.max(1, height - 8));

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((result) => {
            if (!result) {
              reject(new Error("Could not create PNG fixture blob."));
              return;
            }

            resolve(result);
          }, "image/png");
        });

        if (blob.type !== "image/png" || blob.size <= 0) {
          throw new Error("Invalid PNG fixture blob.");
        }

        return blob;
      }

      async function createScreenshotVariantBlob(
        variant: "valid-png" | "signature-only" | "truncated-png" | "corrupted-png",
        width: number,
        height: number,
        color: string
      ) {
        const png = await createPngBlob(width, height, color);
        if (variant === "valid-png") {
          return png;
        }

        const bytes = new Uint8Array(await png.arrayBuffer());
        if (variant === "truncated-png") {
          return new Blob([bytes.slice(0, Math.max(24, Math.floor(bytes.length / 3)))], { type: "image/png" });
        }

        if (variant === "corrupted-png") {
          const corrupted = new Uint8Array(bytes);
          for (let index = 40; index < Math.min(corrupted.length, 80); index += 1) {
            corrupted[index] = corrupted[index] ^ 0xff;
          }
          return new Blob([corrupted], { type: "image/png" });
        }

        const signatureOnly = new Uint8Array(bytes.length);
        signatureOnly.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
        writeUint32(signatureOnly, 16, width);
        writeUint32(signatureOnly, 20, height);
        return new Blob([signatureOnly], { type: "image/png" });
      }

      function writeUint32(bytes: Uint8Array, offset: number, value: number) {
        bytes[offset] = (value >>> 24) & 0xff;
        bytes[offset + 1] = (value >>> 16) & 0xff;
        bytes[offset + 2] = (value >>> 8) & 0xff;
        bytes[offset + 3] = value & 0xff;
      }

      function blobToDataUrl(blob: Blob) {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      }

      async function digestBlob(blob: Blob) {
        const buffer = await blob.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", buffer);
        return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      }

      function getFixtureDisplayTitle(record: CaptureRecord) {
        return record.library.title ?? record.library.componentType ?? record.summaries.componentType ?? `${record.element.tagName.toLowerCase()} capture`;
      }

      function getFixtureSourceDisplay(value: string) {
        try {
          const url = new URL(value);
          url.username = "";
          url.password = "";
          url.search = "";
          url.hash = "";
          return `${url.origin}${url.pathname}`;
        } catch {
          return "Source unavailable";
        }
      }

      const selectedOperation = operations[operation];
      if (!selectedOperation) {
        throw new Error(`Unknown IndexedDB fixture operation: ${operation}`);
      }

      return (await selectedOperation(arg)) as TResult;
    },
    {
      operation,
      arg,
      constants: {
        databaseName: ELEMENT_CATCHER_DATABASE_NAME,
        databaseVersion: ELEMENT_CATCHER_DATABASE_VERSION,
        captureRecordStoreName: CAPTURE_RECORD_STORE_NAME,
        screenshotAssetStoreName: SCREENSHOT_ASSET_STORE_NAME
      }
    }
  );
}
