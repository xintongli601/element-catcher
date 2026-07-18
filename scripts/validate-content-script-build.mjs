import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const contentScriptPath = resolve(projectRoot, "dist/content/content-script.js");

if (!existsSync(contentScriptPath)) {
  fail("dist/content/content-script.js is missing.");
}

const source = readFileSync(contentScriptPath, "utf8");

if (source.length === 0) {
  fail("dist/content/content-script.js is empty.");
}

const code = stripCommentsAndStrings(source);

if (/(^|[;\n])\s*import\s*(?:[\w*{"]|'|`)/.test(code)) {
  fail("dist/content/content-script.js contains an ES import declaration.");
}

if (/(^|[^\w$])import\s*\(/.test(code)) {
  fail("dist/content/content-script.js contains a dynamic import.");
}

if (/(^|[;\n{}])\s*export\s+(?:\{|default|class|function|const|let|var|\*)/.test(code)) {
  fail("dist/content/content-script.js contains an ES export declaration.");
}

if (/(?:\.\.\/)?assets\/[^"'`\s)]+\.js/.test(source)) {
  fail("dist/content/content-script.js references a generated JavaScript chunk.");
}

console.log("Content script build validation passed.");

function stripCommentsAndStrings(value) {
  let result = "";
  let index = 0;

  while (index < value.length) {
    const current = value[index];
    const next = value[index + 1];

    if (current === "/" && next === "/") {
      result += "  ";
      index += 2;

      while (index < value.length && value[index] !== "\n") {
        result += " ";
        index += 1;
      }

      continue;
    }

    if (current === "/" && next === "*") {
      result += "  ";
      index += 2;

      while (index < value.length) {
        if (value[index] === "*" && value[index + 1] === "/") {
          result += "  ";
          index += 2;
          break;
        }

        result += value[index] === "\n" ? "\n" : " ";
        index += 1;
      }

      continue;
    }

    if (current === '"' || current === "'" || current === "`") {
      const quote = current;
      result += quote === "`" ? "`" : " ";
      index += 1;

      while (index < value.length) {
        const character = value[index];

        if (character === "\\") {
          result += "  ";
          index += 2;
          continue;
        }

        if (character === quote) {
          result += quote === "`" ? "`" : " ";
          index += 1;
          break;
        }

        result += character === "\n" ? "\n" : " ";
        index += 1;
      }

      continue;
    }

    result += current;
    index += 1;
  }

  return result;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
