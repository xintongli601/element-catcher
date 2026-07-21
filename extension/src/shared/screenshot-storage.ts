export function createScreenshotStorageKey(id: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) {
    throw new Error("Invalid screenshot storage id.");
  }

  return `screenshots/${id}.png`;
}
