import {
  createInteractionPairV1,
  normalizeInteractionPairTitle,
  validateInteractionPairCreateInput,
  validateInteractionPairV1,
  type InteractionPairCreateInput,
  type InteractionPairV1
} from "../shared/interaction-pair-contract";
import {
  addInteractionPairEntry,
  deleteInteractionPairEntry,
  readInteractionPairEntries,
  readInteractionPairEntry
} from "./indexed-db";
import { loadSavedCaptureById, type SavedCaptureReadModel } from "./capture-save";
import { PersistenceError, toPersistenceError } from "./persistence-errors";

export type InteractionPairReadModel = {
  pair: InteractionPairV1;
  baseCapture?: SavedCaptureReadModel;
  alternateCapture?: SavedCaptureReadModel;
  missingCaptureIds: string[];
};

export async function saveInteractionPair(input: InteractionPairCreateInput): Promise<InteractionPairReadModel> {
  try {
    const normalizedTitle = normalizeInteractionPairTitle(input.title);
    const normalizedInput: InteractionPairCreateInput = {
      baseCaptureId: input.baseCaptureId,
      alternateCaptureId: input.alternateCaptureId,
      trigger: input.trigger,
      ...(normalizedTitle ? { title: normalizedTitle } : {})
    };
    validateInteractionPairCreateInput(normalizedInput);

    const [baseCapture, alternateCapture] = await Promise.all([
      loadSavedCaptureById(normalizedInput.baseCaptureId),
      loadSavedCaptureById(normalizedInput.alternateCaptureId)
    ]);

    const pair = createInteractionPairV1(normalizedInput);
    await addInteractionPairEntry(pair);

    return {
      pair,
      baseCapture,
      alternateCapture,
      missingCaptureIds: []
    };
  } catch (error) {
    throw toPersistenceError(error);
  }
}

export async function loadInteractionPairLibrary(): Promise<InteractionPairReadModel[]> {
  try {
    const pairs = await readInteractionPairEntries();
    const readModels = await Promise.all(pairs.map(resolveInteractionPair));
    return readModels.sort(compareInteractionPairsNewestFirst);
  } catch (error) {
    throw toPersistenceError(error);
  }
}

export async function loadInteractionPairById(id: string): Promise<InteractionPairReadModel> {
  try {
    const pair = await readInteractionPairEntry(id);
    if (!pair) {
      throw new PersistenceError("not-found", "Interaction Pair was not found.");
    }
    validateInteractionPairV1(pair);
    return await resolveInteractionPair(pair);
  } catch (error) {
    throw toPersistenceError(error);
  }
}

export async function deleteInteractionPair(id: string): Promise<void> {
  try {
    const pair = await readInteractionPairEntry(id);
    if (!pair) {
      throw new PersistenceError("not-found", "Interaction Pair was not found.");
    }
    validateInteractionPairV1(pair);
    await deleteInteractionPairEntry(id);
  } catch (error) {
    throw toPersistenceError(error);
  }
}

async function resolveInteractionPair(pair: InteractionPairV1): Promise<InteractionPairReadModel> {
  validateInteractionPairV1(pair);
  const [baseResult, alternateResult] = await Promise.allSettled([
    loadSavedCaptureById(pair.baseCaptureId),
    loadSavedCaptureById(pair.alternateCaptureId)
  ]);
  const baseCapture = baseResult.status === "fulfilled" ? baseResult.value : undefined;
  const alternateCapture = alternateResult.status === "fulfilled" ? alternateResult.value : undefined;
  const missingCaptureIds = [
    ...(baseCapture ? [] : [pair.baseCaptureId]),
    ...(alternateCapture ? [] : [pair.alternateCaptureId])
  ];

  return {
    pair,
    baseCapture,
    alternateCapture,
    missingCaptureIds
  };
}

function compareInteractionPairsNewestFirst(left: InteractionPairReadModel, right: InteractionPairReadModel) {
  if (left.pair.createdAt !== right.pair.createdAt) {
    return right.pair.createdAt.localeCompare(left.pair.createdAt);
  }

  return left.pair.id.localeCompare(right.pair.id);
}
