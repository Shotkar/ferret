/**
 * Fails when the web app has text people read that isn't wrapped for translation (Lingui), so new features stay
 * translatable without anyone having to remember. Run by `pnpm test` (CI).
 *
 * It checks what's certainly text: words between JSX tags, words in a JSX child like {"…"} or {cond ? "…" : "…"}, and
 * string attributes people read (aria-label, title, placeholder, alt, and components' label-like props). Wrap them with
 * `<Trans>…</Trans>` or `` t`…` `` (README → Translations). Text that mustn't be translated (a command, a product name)
 * can go in {"…"} with a `// not translated` comment on the line above, or inside <code>/<kbd>.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "@babel/parser";

const ROOT = new URL("../src/", import.meta.url).pathname;
const LETTER = /\p{L}/u;
/** Not text: ids, paths, class lists, single lowercase words (units, keys). */
const KEYLIKE = /^[a-z0-9_.:/#?=&@+%-]*$/;
const UNTRANSLATED_ELEMENTS = new Set(["Trans", "Plural", "Select", "code", "kbd", "pre", "samp", "var", "style", "script"]);
const INTRINSIC_ATTRS = new Set(["aria-label", "aria-description", "aria-valuetext", "aria-roledescription", "title", "placeholder", "alt"]);
const COMPONENT_ATTRS = new Set(["label", "title", "placeholder", "alt", "aria-label", "description", "hint", "heading", "noneLabel", "submit", "text", "what", "subtitle", "help", "message", "detail", "confirmLabel"]);

const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (e.name === "locales" ? [] : files(join(dir, e.name))) : e.name.endsWith(".tsx") ? [join(dir, e.name)] : [],
  );

const isText = (s) => LETTER.test(s) && !KEYLIKE.test(s.trim());
const nameOf = (el) => {
  const n = el.openingElement?.name;
  return n?.type === "JSXIdentifier" ? n.name : n?.type === "JSXMemberExpression" ? n.property.name : "";
};

const problems = [];
for (const file of files(ROOT)) {
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  const ast = parse(src, { sourceType: "module", plugins: ["jsx", "typescript"] });
  const report = (node, what) => {
    const line = src.slice(0, node.start).split("\n").length;
    if (/not translated/.test(lines[line - 2] ?? "") || /not translated/.test(lines[line - 1] ?? "")) return;
    problems.push(`${relative(process.cwd(), file)}:${line}  ${what}`);
  };
  // String leaves of an expression shown as text: "…", `…`, a ? "…" : "…", a || "…".
  const leaves = (e, out = []) => {
    if (!e) return out;
    if (e.type === "StringLiteral") out.push(e);
    else if (e.type === "TemplateLiteral") out.push(e);
    else if (e.type === "ConditionalExpression") leaves(e.consequent, out), leaves(e.alternate, out);
    else if (e.type === "LogicalExpression") (e.operator !== "&&" && leaves(e.left, out), leaves(e.right, out));
    else if (e.type === "ParenthesizedExpression") leaves(e.expression, out);
    return out;
  };
  const textOf = (leaf) => (leaf.type === "StringLiteral" ? leaf.value : leaf.quasis.map((q) => q.value.cooked).join(" "));
  const leafIsText = (leaf) => {
    const s = textOf(leaf);
    if (leaf.type === "TemplateLiteral" && leaf.expressions.length) return /\p{L}{2,}\s|\s\p{L}{2,}/u.test(s);
    return isText(s);
  };

  const walk = (node, inside) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((n) => walk(n, inside));
    if (node.type === "TaggedTemplateExpression" || (node.type === "CallExpression" && ["t", "msg", "plural", "select", "ph"].includes(node.callee?.name))) return;
    if (node.type === "JSXElement") {
      const name = nameOf(node);
      const skip = inside || UNTRANSLATED_ELEMENTS.has(name);
      const lower = name && name[0] === name[0].toLowerCase();
      for (const a of node.openingElement.attributes) {
        if (a.type !== "JSXAttribute" || a.name.type !== "JSXIdentifier" || !a.value) continue;
        if (!(lower ? INTRINSIC_ATTRS : COMPONENT_ATTRS).has(a.name.name)) continue;
        const values = a.value.type === "StringLiteral" ? [a.value] : a.value.type === "JSXExpressionContainer" ? leaves(a.value.expression) : [];
        for (const v of values) if (leafIsText(v)) report(v, `${a.name.name}="${textOf(v).slice(0, 60)}"`);
        if (a.value.type === "JSXExpressionContainer") walk(a.value.expression, false);
      }
      for (const c of node.children) {
        if (c.type === "JSXText") {
          if (!skip && LETTER.test(c.value)) report(c, `text: ${c.value.trim().replace(/\s+/g, " ").slice(0, 60)}`);
        } else if (c.type === "JSXExpressionContainer") {
          if (!skip) for (const v of leaves(c.expression)) if (leafIsText(v)) report(v, `text: ${textOf(v).slice(0, 60)}`);
          walk(c.expression, false);
        } else walk(c, skip);
      }
      return;
    }
    for (const key in node) if (key !== "loc" && key !== "leadingComments" && key !== "trailingComments" && node[key] && typeof node[key] === "object") walk(node[key], inside);
  };
  walk(ast.program, false);
}

if (problems.length) {
  console.error(`Text that isn't wrapped for translation (README → Translations: <Trans>…</Trans> or t\`…\`):\n\n${problems.join("\n")}\n`);
  process.exit(1);
}
console.log("check-text: all text is wrapped for translation");
