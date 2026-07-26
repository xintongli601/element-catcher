import { parse } from "@babel/parser";
import {
  PREVIEW_LIMITS,
  PreviewPolicyError,
  assertSourceWithinLimit,
  sha256Hex,
  validateComponentName,
  validatePreviewRenderPlan,
  type PreviewRenderNodeV1,
  type PreviewRenderPlanV1
} from "../shared/preview-policy";

type NodeRecord = Record<string, unknown>;

export async function buildPreviewRenderPlanFromSource({
  source,
  expectedComponentName,
  sourceSha256
}: {
  source: string;
  expectedComponentName: string;
  sourceSha256: string;
}): Promise<PreviewRenderPlanV1> {
  assertSourceWithinLimit(source);
  validateComponentName(expectedComponentName);
  if ((await sha256Hex(source)) !== sourceSha256) {
    throw new PreviewPolicyError("policy", "Source hash mismatch.");
  }
  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: ["jsx"],
      errorRecovery: false,
      attachComment: false,
      tokens: false,
      ranges: false
    });
  } catch (error) {
    throw new PreviewPolicyError("syntax", error instanceof Error ? error.message : "Generated source could not be parsed.");
  }
  traverseBoundedAst(ast);
  if ((((ast.program as unknown) as NodeRecord).directives as unknown[])?.length > 0) {
    throw new PreviewPolicyError("policy", "Program directives are not previewable.");
  }
  const declaration = extractSingleComponentDeclaration(ast.program.body, expectedComponentName);
  const jsx = extractReturnedJsx(declaration);
  const candidate = {
    contractVersion: 1 as const,
    componentName: expectedComponentName,
    sourceSha256,
    root: jsxToPlanNode(jsx),
    warnings: []
  };
  return validatePreviewRenderPlan(candidate, expectedComponentName);
}

function traverseBoundedAst(root: unknown) {
  const seen = new WeakSet<object>();
  let nodes = 0;
  const visit = (value: unknown, depth: number) => {
    if (depth > PREVIEW_LIMITS.astDepth) throw new PreviewPolicyError("limit", "AST traversal depth exceeded.");
    if (!value || typeof value !== "object") return;
    if (seen.has(value)) throw new PreviewPolicyError("policy", "Cyclic AST rejected.");
    seen.add(value);
    if (Array.isArray(value)) {
      if (value.length > PREVIEW_LIMITS.astArrayLength) throw new PreviewPolicyError("limit", "AST array too large.");
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const node = value as NodeRecord;
    if (typeof node.type === "string") {
      nodes += 1;
      if (nodes > PREVIEW_LIMITS.astNodes) throw new PreviewPolicyError("limit", "AST node limit exceeded.");
    }
    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "start" || key === "end" || key === "leadingComments" || key === "trailingComments" || key === "innerComments") continue;
      const descriptor = Object.getOwnPropertyDescriptor(node, key);
      if (!descriptor || descriptor.get || descriptor.set) throw new PreviewPolicyError("policy", "AST getters rejected.");
      visit(node[key], depth + 1);
    }
  };
  visit(root, 0);
}

function extractSingleComponentDeclaration(body: unknown[], expectedComponentName: string): NodeRecord {
  if (!Array.isArray(body) || body.length !== 1) {
    throw new PreviewPolicyError("program-envelope", "Preview source must contain exactly one component declaration.");
  }
  const statement = body[0] as NodeRecord;
  if (statement.type === "FunctionDeclaration") return validateFunctionDeclaration(statement, expectedComponentName);
  if (statement.type === "ExportDefaultDeclaration") {
    const declaration = statement.declaration as NodeRecord;
    if (declaration?.type !== "FunctionDeclaration") throw new PreviewPolicyError("program-envelope", "Only named default function components are previewable.");
    return validateFunctionDeclaration(declaration, expectedComponentName);
  }
  if (statement.type === "ExportNamedDeclaration") {
    const declaration = statement.declaration as NodeRecord | null;
    if (!declaration || declaration.type !== "FunctionDeclaration") throw new PreviewPolicyError("program-envelope", "Alias exports are not previewable.");
    return validateFunctionDeclaration(declaration, expectedComponentName);
  }
  if (statement.type === "VariableDeclaration") return validateVariableDeclaration(statement, expectedComponentName);
  throw new PreviewPolicyError("program-envelope", "Preview source must be a single component declaration.");
}

function validateFunctionDeclaration(node: NodeRecord, expectedComponentName: string) {
  const id = node.id as NodeRecord | null;
  if (!id || id.name !== expectedComponentName) throw new PreviewPolicyError("component-name", "Component name does not match the generated version.");
  if ((node.params as unknown[])?.length !== 0 || node.async || node.generator) throw new PreviewPolicyError("policy", "Component parameters, async and generators are not previewable.");
  rejectBodyDirectives(node);
  return node;
}

function validateVariableDeclaration(node: NodeRecord, expectedComponentName: string) {
  if (node.kind !== "const") throw new PreviewPolicyError("program-envelope", "Only const component declarations are previewable.");
  const declarations = node.declarations as NodeRecord[];
  if (!Array.isArray(declarations) || declarations.length !== 1) throw new PreviewPolicyError("program-envelope", "Only one component declaration is previewable.");
  const declaration = declarations[0];
  const id = declaration.id as NodeRecord;
  const init = declaration.init as NodeRecord;
  if (id?.type !== "Identifier" || id.name !== expectedComponentName || init?.type !== "ArrowFunctionExpression") throw new PreviewPolicyError("component-name", "Component name does not match the generated version.");
  if ((init.params as unknown[])?.length !== 0 || init.async) throw new PreviewPolicyError("policy", "Component parameters and async are not previewable.");
  rejectBodyDirectives(init);
  return init;
}

function extractReturnedJsx(node: NodeRecord): NodeRecord {
  if (node.type === "ArrowFunctionExpression") {
    if (isJsx(node.body)) return node.body as NodeRecord;
    if ((node.body as NodeRecord)?.type !== "BlockStatement") throw new PreviewPolicyError("program-envelope", "Arrow component must return JSX.");
    return extractReturnedJsxFromBody((node.body as NodeRecord).body);
  }
  return extractReturnedJsxFromBody((node.body as NodeRecord).body);
}

function extractReturnedJsxFromBody(body: unknown): NodeRecord {
  const statements = body as NodeRecord[];
  if (!Array.isArray(statements) || statements.length !== 1 || statements[0].type !== "ReturnStatement" || !isJsx(statements[0].argument)) {
    throw new PreviewPolicyError("program-envelope", "Component must contain exactly one JSX return.");
  }
  return statements[0].argument as NodeRecord;
}

function jsxToPlanNode(node: NodeRecord): PreviewRenderNodeV1 {
  if (node.type === "JSXFragment") {
    return { kind: "fragment", children: jsxChildrenToPlan(node.children as NodeRecord[]) };
  }
  if (node.type !== "JSXElement") throw new PreviewPolicyError("policy", "Only JSX elements and fragments are previewable.");
  const opening = node.openingElement as NodeRecord;
  const name = opening.name as NodeRecord;
  if (name?.type !== "JSXIdentifier" || /^[A-Z]/.test(String(name.name))) throw new PreviewPolicyError("policy", "Component/member JSX tags are not previewable.");
  const tag = String(name.name);
  const props: Record<string, string | boolean> = {};
  const seenProps = new Set<string>();
  for (const attr of (opening.attributes as NodeRecord[]) ?? []) {
    if (attr.type !== "JSXAttribute") throw new PreviewPolicyError("policy", "Spread props are not previewable.");
    const attrName = attr.name as NodeRecord;
    if (attrName?.type !== "JSXIdentifier") throw new PreviewPolicyError("policy", "Only simple JSX attributes are previewable.");
    const propName = String(attrName.name);
    if (seenProps.has(propName)) throw new PreviewPolicyError("policy", `Duplicate JSX attribute ${propName} is not previewable.`);
    seenProps.add(propName);
    props[propName] = jsxAttributeValue(attr.value);
  }
  return { kind: "element", tag: tag as never, props, children: jsxChildrenToPlan(node.children as NodeRecord[]) };
}

function jsxChildrenToPlan(children: NodeRecord[]) {
  const result: PreviewRenderNodeV1[] = [];
  for (const child of children ?? []) {
    if (child.type === "JSXText") {
      const value = String(child.value ?? "").replace(/\s+/g, " ").trim();
      if (value) result.push({ kind: "text", value });
      continue;
    }
    if (child.type === "JSXElement" || child.type === "JSXFragment") {
      result.push(jsxToPlanNode(child));
      continue;
    }
    if (child.type === "JSXExpressionContainer") {
      const expression = child.expression as NodeRecord;
      if (expression?.type === "StringLiteral" || expression?.type === "NumericLiteral") {
        result.push({ kind: "text", value: String(expression.value) });
        continue;
      }
      if (expression?.type === "JSXEmptyExpression") continue;
    }
    throw new PreviewPolicyError("policy", "Executable JSX expressions are not previewable.");
  }
  return result;
}

function jsxAttributeValue(value: unknown) {
  if (!value) return "true";
  const node = value as NodeRecord;
  if (node.type === "StringLiteral") return String(node.value);
  if (node.type === "JSXExpressionContainer") {
    const expression = node.expression as NodeRecord;
    if (expression.type === "StringLiteral" || expression.type === "BooleanLiteral") return expression.value as string | boolean;
  }
  throw new PreviewPolicyError("policy", "Attribute expressions are not previewable.");
}

function isJsx(value: unknown) {
  const type = (value as NodeRecord | null)?.type;
  return type === "JSXElement" || type === "JSXFragment";
}

function rejectBodyDirectives(node: NodeRecord) {
  const body = node.body as NodeRecord | undefined;
  if (body?.type === "BlockStatement" && ((body.directives as unknown[])?.length ?? 0) > 0) {
    throw new PreviewPolicyError("policy", "Function body directives are not previewable.");
  }
}
