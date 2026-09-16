import fs from "node:fs";
import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";

const DEFAULT = traverse.default ?? traverse;
const GEN = generate.default ?? generate;

const region = fs.readFileSync("/tmp/print-forms.region.js", "utf8")
  .replace(/^\/\/#region.*\n/, "");

const wrapped = `
${region}
`;

const ast = parser.parse(wrapped, {
  sourceType: "module",
  plugins: ["jsx"],
});

function isJsxCall(node) {
  return (
    t.isCallExpression(node) &&
    t.isIdentifier(node.callee) &&
    (node.callee.name === "jsx" || node.callee.name === "jsxs" || node.callee.name === "jsxDEV")
  );
}

function toJsx(node) {
  if (!isJsxCall(node)) return node;
  const [typeArg, propsArg] = node.arguments;
  if (!typeArg || !propsArg || !t.isObjectExpression(propsArg)) return node;

  let childrenNode = null;
  const attrs = [];
  for (const prop of propsArg.properties) {
    if (!t.isObjectProperty(prop) || prop.computed) {
      if (t.isSpreadElement(prop)) {
        attrs.push(t.jsxSpreadAttribute(prop.argument));
      }
      continue;
    }
    const key = prop.key;
    const keyName = t.isIdentifier(key) ? key.name : t.isStringLiteral(key) ? key.value : null;
    if (!keyName) continue;
    if (keyName === "children") {
      childrenNode = prop.value;
      continue;
    }
    const name = t.jsxIdentifier(keyName);
    let val = prop.value;
    if (t.isStringLiteral(val) && !val.value.includes('"') && keyName !== "dangerouslySetInnerHTML") {
      attrs.push(t.jsxAttribute(name, val));
    } else if (t.isBooleanLiteral(val) && val.value === true) {
      attrs.push(t.jsxAttribute(name, null));
    } else {
      attrs.push(t.jsxAttribute(name, t.jsxExpressionContainer(val)));
    }
  }

  const opening = t.jsxOpeningElement(
    t.isStringLiteral(typeArg)
      ? t.jsxIdentifier(typeArg.value)
      : t.isIdentifier(typeArg)
        ? t.jsxIdentifier(typeArg.name)
        : t.jsxIdentifier("Unknown"),
    attrs,
    childrenNode == null,
  );
  if (childrenNode == null) {
    return t.jsxElement(opening, null, [], true);
  }
  const kids = [];
  const pushChild = (c) => {
    if (!c || t.isNullLiteral(c)) return;
    if (t.isStringLiteral(c)) {
      kids.push(t.jsxText(c.value));
      return;
    }
    if (t.isJSXElement(c) || t.isJSXFragment(c)) {
      kids.push(c);
      return;
    }
    if (isJsxCall(c)) {
      kids.push(toJsx(c));
      return;
    }
    if (t.isArrayExpression(c)) {
      for (const el of c.elements) pushChild(el);
      return;
    }
    kids.push(t.jsxExpressionContainer(c));
  };
  if (t.isArrayExpression(childrenNode)) {
    for (const el of childrenNode.elements) pushChild(el);
  } else {
    pushChild(childrenNode);
  }
  const closing = t.jsxClosingElement(opening.name);
  opening.selfClosing = false;
  return t.jsxElement(opening, closing, kids, false);
}

DEFAULT(ast, {
  CallExpression(path) {
    if (isJsxCall(path.node)) {
      path.replaceWith(toJsx(path.node));
    }
  },
});

let out = GEN(ast, { jsescOption: { minimal: true }, compact: false, comments: false }).code;

out = out.replace(/\/\* @__PURE__ \*\//g, "");
out = out.replace(/\nvar FORM_ORDER/, "\nexport const FORM_ORDER");
out = out.replace(/\nvar FORM_META/, "\nexport const FORM_META");
out = out.replace(/\nfunction notesToPrintable/, "\nexport function notesToPrintable");
out = out.replace(/\nfunction PrintFormsButton/, "\nexport function PrintFormsButton");
out = out.replace(/\nfunction OfficialForm/, "\nexport function OfficialForm");
out = out.replace(/\nfunction OfficialLetterhead/, "\nexport function OfficialLetterhead");
out = out.replace(/\nfunction FormHeader/, "\nfunction FormHeader");

const header = `import { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getStudentNotes } from "@/lib/school/api";
import {
  counselorTitle,
  degreeLabel,
  formatDay,
  formatStamp,
  formatTime,
  hijriDate,
  occurrenceLabel,
  periodShort,
  principalTitle,
  procedureLadder,
  procedureStageLabel,
  proceduresFor,
  schoolLogoSrc,
  stageIndexFor,
  studentNoun,
  weekdayName,
} from "@/lib/school/constants";
import { printElement } from "@/lib/school/print";
import type { School } from "@/lib/school/types";
import { useWorkspace } from "@/lib/school/workspace";

export type FormKind = (typeof FORM_ORDER)[number];
export type FormOverrides = Partial<{
  name: string;
  classLine: string;
  violation: string;
  degree: string;
  day: string;
  weekday: string;
  period: string;
  subject: string;
  extra: string;
  actionText: string;
}>;
export type PrintableNote = {
  type: string;
  details: string;
  behaviorTypeName?: string | null;
  behaviorDegree?: number | null;
  periodKey?: string;
  actionTaken?: string | null;
  createdAt: string;
  occurredAt?: string;
  teacherName?: string;
  teacherSubject?: string;
  occurrence?: number;
  suggestedAction?: string;
  compensation?: string;
};

`;

fs.writeFileSync("/tmp/print-forms.raw.tsx", header + out);
console.log("wrote", header.length + out.length);
PY