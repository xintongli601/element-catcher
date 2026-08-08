import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const root = join(import.meta.dirname, "../..");

test.describe("Side Panel production build output", () => {
  test("does not emit modulepreload links in extension Side Panel HTML", () => {
    const html = readFileSync(join(root, "dist/src/sidepanel/index.html"), "utf8");

    expect(html).not.toContain('rel="modulepreload"');
    expect(html).toContain('<script type="module" crossorigin src="/assets/sidepanel.js"></script>');
    expect(html).toContain('<link rel="stylesheet" crossorigin href="/assets/sidepanel.css">');
    expect(html).not.toMatch(/https?:\/\//);
  });
});
