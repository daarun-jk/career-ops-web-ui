#!/usr/bin/env node
/**
 * generate-cover-letter.mjs — Renders a cover letter payload to PDF.
 *
 * Usage:
 *   node generate-cover-letter.mjs --payload payload.json
 *   node generate-cover-letter.mjs --payload payload.json --out output/slug-cover.pdf
 *
 * Fills templates/cover-letter-template.html with the payload, then renders
 * it to PDF via the same Playwright pipeline used for CVs (generate-pdf.mjs).
 *
 * `buildHtml` is exported as a pure function so the template can be tested
 * without loading Playwright (renderHtmlToPdf is imported lazily inside main).
 */

import { readFileSync, existsSync, mkdirSync } from "fs";
import { dirname, resolve, basename, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { parseArgs } from "util";

const OUTPUT_ROOT = resolve("output");

function safeOutputPath(raw) {
  // Derive a sanitized filename from raw string (strip path separators and dots)
  const filename = basename(raw).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/\.{2,}/g, "-");
  return join(OUTPUT_ROOT, filename);
}

function _require(obj, keys, context) {
  for (const key of keys) {
    if (!obj || typeof obj !== "object" || !(key in obj)) {
      throw new Error(`Missing required field: ${context}.${key}`);
    }
  }
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildHtml(payload) {
  _require(payload, ["candidate", "recipient", "letter"], "payload");
  const candidate = payload.candidate;
  const recipient = payload.recipient;
  const letter = payload.letter;

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const templatePath = resolve(scriptDir, "templates", "cover-letter-template.html");
  let html = readFileSync(templatePath, "utf-8");

  const paragraphsBlock = (letter.paragraphs || [])
    .map(p => `<p>${escapeHtml(p)}</p>`)
    .join("\n");

  const replacements = {
    "{{NAME}}": escapeHtml(candidate.name),
    "{{LOCATION}}": escapeHtml(candidate.location),
    "{{EMAIL}}": escapeHtml(candidate.email),
    "{{PHONE}}": escapeHtml(candidate.phone),
    "{{RECIPIENT_TITLE}}": escapeHtml(recipient.title || "Hiring Manager"),
    "{{COMPANY}}": escapeHtml(recipient.company || "Company Name"),
    "{{COMPANY_LOCATION}}": escapeHtml(recipient.location || ""),
    "{{GREETING}}": escapeHtml(letter.greeting),
    "{{PARAGRAPHS_BLOCK}}": paragraphsBlock,
    "{{CLOSING}}": escapeHtml(letter.closing)
  };

  return html.replace(/\{\{[A-Z_]+\}\}/g, (token) => replacements[token] ?? "");
}

async function main() {
  const { values: args } = parseArgs({
    options: {
      payload: { type: "string" },
      out:     { type: "string" },
      help:    { type: "boolean", short: "h" },
    },
    strict: false,
  });

  if (args.help || !args.payload) {
    console.log(`
Usage:
  node generate-cover-letter.mjs --payload payload.json [--out output/path.pdf]

  --payload   Path to the JSON payload file (required)
  --out       Override output path from payload (optional)
`);
    process.exit(args.help ? 0 : 1);
  }

  const payloadPath = resolve(args.payload);
  if (!existsSync(payloadPath)) {
    console.error(`ERROR: payload file not found: ${payloadPath}`);
    process.exit(1);
  }

  const payload = JSON.parse(readFileSync(payloadPath, "utf-8"));

  if (args.out) {
    payload.output_path = args.out;
  }

  if (!payload.output_path) {
    const company = (payload.letter?.company || "company").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const role    = (payload.letter?.role_title || "role").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
    payload.output_path = join(OUTPUT_ROOT, `${company}-${role}-cover.pdf`);
  } else {
    payload.output_path = safeOutputPath(payload.output_path);
  }

  if (!existsSync(OUTPUT_ROOT)) mkdirSync(OUTPUT_ROOT, { recursive: true });

  // Imported lazily so buildHtml can be used (and tested) without Playwright.
  const { renderHtmlToPdf } = await import("./generate-pdf.mjs");

  try {
    const html = buildHtml(payload);
    const outputPath = resolve(payload.output_path);
    await renderHtmlToPdf(html, outputPath, { format: "a4" });
    console.log(`\nCover letter PDF: ${payload.output_path}`);
  } catch (err) {
    console.error("ERROR generating cover letter PDF:");
    console.error(err.message);
    process.exit(1);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
