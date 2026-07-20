import { useEffect, useState } from "react";
import {
  boundCaptureLibraryQuerySummaryText,
  createCaptureLibraryFilterOptions,
  createDefaultCaptureLibraryQuery,
  filterSavedCaptureLibrary,
  getUserVisibleComponentType,
  hasActiveCaptureLibraryQuery,
  normalizeCaptureLibrarySearchQuery,
  type CaptureLibraryQueryState
} from "../library/capture-library-query";
import type { SavedCaptureReadModel } from "../storage/capture-save";
import {
  boundText,
  formatSourceLocation,
  formatTimestamp,
  getCaptureDisplayTitle,
  normalizedOptionalText
} from "./display-format";

export type CaptureLibraryState =
  | {
      status: "loading";
    }
  | {
      status: "empty";
    }
  | {
      status: "loaded";
      savedCaptures: SavedCaptureReadModel[];
    }
  | {
      status: "failed";
      message: string;
    };

export function CaptureLibrary({
  libraryState,
  queryState,
  statusMessage,
  onQueryChange,
  onRetry,
  onOpenCapture
}: {
  libraryState: CaptureLibraryState;
  queryState: CaptureLibraryQueryState;
  statusMessage?: string | null;
  onQueryChange: (queryState: CaptureLibraryQueryState) => void;
  onRetry: () => void;
  onOpenCapture: (recordId: string) => void;
}) {
  const loadedCount = libraryState.status === "loaded" ? libraryState.savedCaptures.length : 0;
  const filteredCaptures =
    libraryState.status === "loaded" ? filterSavedCaptureLibrary(libraryState.savedCaptures, queryState) : [];
  const hasActiveQuery = hasActiveCaptureLibraryQuery(queryState);
  const filterOptions =
    libraryState.status === "loaded"
      ? createCaptureLibraryFilterOptions(libraryState.savedCaptures, queryState)
      : { componentTypes: [], tags: [] };

  return (
    <section className="capture-library" aria-labelledby="capture-library-heading">
      <div className="capture-library-header">
        <div>
          <p className="eyebrow">Local Library</p>
          <h2 id="capture-library-heading">Capture Library</h2>
        </div>
        {libraryState.status === "loaded" ? <p className="library-count">{loadedCount}</p> : null}
        {libraryState.status === "failed" ? (
          <button className="secondary-action compact-action" type="button" onClick={onRetry}>
            Retry loading
          </button>
        ) : null}
      </div>

      {statusMessage ? (
        <p className="save-state save-state-saved" role="status">
          {statusMessage}
        </p>
      ) : null}
      {libraryState.status === "loading" ? <p className="empty-note">Loading local captures...</p> : null}
      {libraryState.status === "empty" ? <p className="empty-note">No explicitly saved captures yet.</p> : null}
      {libraryState.status === "failed" ? (
        <p className="save-state save-state-failed" role="alert">
          Could not load the Capture Library. {libraryState.message}
        </p>
      ) : null}
      {libraryState.status === "loaded" ? (
        <>
          <CaptureLibraryQueryControls
            queryState={queryState}
            options={filterOptions}
            visibleCount={filteredCaptures.length}
            totalCount={loadedCount}
            hasActiveQuery={hasActiveQuery}
            onQueryChange={onQueryChange}
          />
          {filteredCaptures.length ? (
            <ul className="capture-library-list" aria-label="Saved captures">
              {filteredCaptures.map((savedCapture) => (
                <CaptureLibraryItem
                  key={savedCapture.record.id}
                  savedCapture={savedCapture}
                  onOpenCapture={onOpenCapture}
                />
              ))}
            </ul>
          ) : (
            <div className="library-no-results" aria-labelledby="library-no-results-heading">
              <h3 id="library-no-results-heading">No matching captures</h3>
              <p>Try another search term or clear the active filters.</p>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

function CaptureLibraryQueryControls({
  queryState,
  options,
  visibleCount,
  totalCount,
  hasActiveQuery,
  onQueryChange
}: {
  queryState: CaptureLibraryQueryState;
  options: ReturnType<typeof createCaptureLibraryFilterOptions>;
  visibleCount: number;
  totalCount: number;
  hasActiveQuery: boolean;
  onQueryChange: (queryState: CaptureLibraryQueryState) => void;
}) {
  const updateQuery = (nextQuery: Partial<CaptureLibraryQueryState>) => {
    onQueryChange({
      ...queryState,
      ...nextQuery
    });
  };

  const clearQuery = () => {
    onQueryChange(createDefaultCaptureLibraryQuery());
  };
  const searchHelperId = "library-search-helper";
  const normalizedSearchQuery = normalizeCaptureLibrarySearchQuery(queryState.searchQuery);
  const hasActiveFilters = Boolean(queryState.componentType || queryState.tag);

  return (
    <div className="library-query-panel" aria-label="Capture Library search and filters">
      <div className="library-query-grid">
        <label className="library-query-field">
          <span>Search captures</span>
          <input
            type="search"
            aria-describedby={searchHelperId}
            placeholder="Search titles, tags, types, and sources"
            value={queryState.searchQuery}
            onChange={(event) => updateQuery({ searchQuery: event.target.value })}
          />
          <span id={searchHelperId} className="library-query-helper">
            Results update as you type.
          </span>
        </label>

        <label className="library-query-field">
          <span>Component type</span>
          <select value={queryState.componentType} onChange={(event) => updateQuery({ componentType: event.target.value })}>
            <option value="">All component types</option>
            {options.componentTypes.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="library-query-field">
          <span>Tag</span>
          <select value={queryState.tag} onChange={(event) => updateQuery({ tag: event.target.value })}>
            <option value="">All tags</option>
            {options.tags.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button className="secondary-action compact-action" type="button" onClick={clearQuery}>
        Clear search and filters
      </button>

      <p className="library-result-status" role="status" aria-live="polite">
        {formatLibraryResultStatus({
          normalizedSearchQuery,
          hasActiveFilters,
          visibleCount,
          totalCount
        })}
      </p>

      {hasActiveQuery ? (
        <div className="library-active-summary">
          {normalizedSearchQuery ? (
            <p>Search: "{boundCaptureLibraryQuerySummaryText(queryState.searchQuery)}"</p>
          ) : null}
          {queryState.componentType ? (
            <p>Component type: {boundCaptureLibraryQuerySummaryText(queryState.componentType)}</p>
          ) : null}
          {queryState.tag ? <p>Tag: {boundCaptureLibraryQuerySummaryText(queryState.tag)}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function formatLibraryResultStatus({
  normalizedSearchQuery,
  hasActiveFilters,
  visibleCount,
  totalCount
}: {
  normalizedSearchQuery: string;
  hasActiveFilters: boolean;
  visibleCount: number;
  totalCount: number;
}) {
  if (visibleCount === totalCount && !normalizedSearchQuery && !hasActiveFilters) {
    return `Showing all ${totalCount} captures.`;
  }

  if (visibleCount > 0) {
    return `Showing ${visibleCount} of ${totalCount} captures.`;
  }

  if (normalizedSearchQuery && hasActiveFilters) {
    return `0 results for “${boundCaptureLibraryQuerySummaryText(normalizedSearchQuery)}” with the current filters.`;
  }

  if (normalizedSearchQuery) {
    return `0 results for “${boundCaptureLibraryQuerySummaryText(normalizedSearchQuery)}”.`;
  }

  return "0 captures match the current filters.";
}

function CaptureLibraryItem({
  savedCapture,
  onOpenCapture
}: {
  savedCapture: SavedCaptureReadModel;
  onOpenCapture: (recordId: string) => void;
}) {
  const currentBlob = savedCapture.asset.blob;
  const [objectUrlState, setObjectUrlState] = useState<ObjectUrlState>({
    status: "preparing",
    blob: currentBlob
  });

  useEffect(() => {
    let nextObjectUrl: string | null = null;

    try {
      nextObjectUrl = URL.createObjectURL(currentBlob);
      setObjectUrlState({ status: "ready", blob: currentBlob, objectUrl: nextObjectUrl });
    } catch {
      setObjectUrlState({ status: "failed", blob: currentBlob });
    }

    return () => {
      if (nextObjectUrl) {
        URL.revokeObjectURL(nextObjectUrl);
      }
    };
  }, [currentBlob]);

  const displayTitle = getCaptureDisplayTitle(savedCapture.record);
  const componentType = normalizedOptionalText(getUserVisibleComponentType(savedCapture.record));
  const currentObjectUrlState: ObjectUrlRenderState =
    objectUrlState.blob === currentBlob ? objectUrlState : { status: "preparing" };

  return (
    <li className="capture-library-item">
      <button
        className="library-open-button"
        type="button"
        onClick={() => onOpenCapture(savedCapture.record.id)}
        aria-label={`Open saved capture: ${displayTitle}`}
      >
        <span className="library-thumbnail-frame">
          {currentObjectUrlState.status === "ready" ? (
            <img
              className="library-thumbnail"
              src={currentObjectUrlState.objectUrl}
              alt={`Saved screenshot preview for ${displayTitle}`}
            />
          ) : null}
          {currentObjectUrlState.status === "preparing" ? (
            <span className="library-thumbnail-note">Preparing preview...</span>
          ) : null}
          {currentObjectUrlState.status === "failed" ? (
            <span className="library-thumbnail-note">Preview unavailable</span>
          ) : null}
        </span>

        <span className="library-item-body">
          <span className="library-item-title">{displayTitle}</span>
          {componentType ? <span className="library-component-type">{boundText(componentType, 48)}</span> : null}
          <span>{formatSourceLocation(savedCapture.record.source.url)}</span>
          <span>Saved {formatTimestamp(savedCapture.savedAt)}</span>
        </span>
      </button>
    </li>
  );
}

type ObjectUrlState =
  | {
      status: "preparing";
      blob: Blob;
    }
  | {
      status: "ready";
      blob: Blob;
      objectUrl: string;
    }
  | {
      status: "failed";
      blob: Blob;
    };

type ObjectUrlRenderState = ObjectUrlState | { status: "preparing" };
