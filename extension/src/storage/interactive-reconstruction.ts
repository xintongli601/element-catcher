import type { InteractionReconstructionEntryV1 } from "../shared/interactive-reconstruction-contract";
import {
  addInteractionReconstructionEntry,
  listInteractionReconstructionEntriesByPairId,
  readInteractionReconstructionEntry,
  deleteInteractionReconstructionEntry
} from "./indexed-db";
import { PersistenceError, toPersistenceError } from "./persistence-errors";

export async function saveInteractionReconstruction(entry: InteractionReconstructionEntryV1) {
  try {
    return await addInteractionReconstructionEntry(entry);
  } catch (error) {
    throw toPersistenceError(error);
  }
}

export async function loadInteractionReconstructionsForPair(sourceInteractionPairId: string) {
  try {
    return await listInteractionReconstructionEntriesByPairId(sourceInteractionPairId);
  } catch (error) {
    throw toPersistenceError(error);
  }
}

export async function loadInteractionReconstructionById(id: string) {
  try {
    const entry = await readInteractionReconstructionEntry(id);
    if (!entry) {
      throw new PersistenceError("not-found", "Interactive reconstruction was not found.");
    }
    return entry;
  } catch (error) {
    throw toPersistenceError(error);
  }
}

export async function deleteInteractionReconstruction(id: string) {
  try {
    await deleteInteractionReconstructionEntry(id);
  } catch (error) {
    throw toPersistenceError(error);
  }
}
