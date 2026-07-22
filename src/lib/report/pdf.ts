// PDF-Export des Monatsberichts (Etappe 5, Konzept 4.2).
// pdf-lib ist reines JS ohne Dateisystemzugriff und läuft damit zuverlässig
// in Serverless-Functions. Typografie angelehnt an die Design-Tokens
// (Schwarz/Weiß, Gelb als Akzent); Standardschrift Helvetica.
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { ReportBody } from "./input.ts";

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 56;
const INK = rgb(0.04, 0.04, 0.04);
const GRAY = rgb(0.43, 0.43, 0.43);
const ACCENT = rgb(0.945, 0.733, 0.118); // #F1BB1E

/**
 * Bricht Text auf Zeilen um, die in maxWidth passen (rein, getestet).
 * Überlange Einzelwörter werden hart getrennt.
 */
export function wrapText(
  text: string,
  font: Pick<PDFFont, "widthOfTextAtSize">,
  size: number,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // Überlanges Wort hart umbrechen
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > maxWidth) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  // trailing Leerzeile eines Absatz-Splits entfernen
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** WinAnsi-inkompatible Zeichen ersetzen (Helvetica kann kein „…“-Unicode-Exotik). */
export function sanitizeForPdf(text: string): string {
  return text
    .replace(/[‐-―]/g, "-")
    .replace(/…/g, "...")
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/→/g, "->")
    .replace(/[▲▼]/g, "")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "");
}

export type ReportPdfInput = {
  customerName: string;
  monthLabel: string; // "Juli 2026"
  status: string; // draft | approved
  approvedAt: Date | null;
  execSummary: string;
  body: ReportBody | null;
};

export async function renderReportPdf(input: ReportPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const width = A4.width - 2 * MARGIN;

  let page = doc.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN + 24) {
      page = doc.addPage([A4.width, A4.height]);
      y = A4.height - MARGIN;
    }
  };

  const drawLines = (
    text: string,
    opts: { font: PDFFont; size: number; color?: ReturnType<typeof rgb>; lineHeight?: number }
  ) => {
    const lh = opts.lineHeight ?? opts.size * 1.45;
    for (const line of wrapText(sanitizeForPdf(text), opts.font, opts.size, width)) {
      ensureSpace(lh);
      page.drawText(line, { x: MARGIN, y, size: opts.size, font: opts.font, color: opts.color ?? INK });
      y -= lh;
    }
  };

  // Kopf
  page.drawText("NETURAL MARKTRADAR - MONATSBERICHT", {
    x: MARGIN, y, size: 8, font: bold, color: GRAY,
  });
  y -= 22;
  drawLines(`${input.customerName} · ${input.monthLabel}`, { font: bold, size: 20 });
  y -= 2;
  const statusLine =
    input.status === "approved"
      ? `Freigegeben${input.approvedAt ? ` am ${input.approvedAt.toLocaleDateString("de-AT")}` : ""}`
      : "Entwurf - Freigabe ausstehend";
  drawLines(statusLine, { font, size: 9, color: GRAY });
  y -= 6;
  page.drawRectangle({ x: MARGIN, y, width, height: 2, color: INK });
  y -= 24;

  // Executive Summary
  drawLines("Executive Summary", { font: bold, size: 12 });
  y -= 2;
  drawLines(input.execSummary, { font, size: 10.5 });
  y -= 12;

  // Abschnitte
  for (const section of input.body?.sections ?? []) {
    ensureSpace(40);
    drawLines(section.title, { font: bold, size: 12 });
    y -= 2;
    drawLines(section.text, { font, size: 10.5 });
    y -= 12;
  }

  // Empfohlene Maßnahmen
  const tasks = input.body?.suggestedTasks ?? [];
  if (tasks.length > 0) {
    ensureSpace(40);
    page.drawRectangle({ x: MARGIN, y: y - 2, width: 3, height: 14, color: ACCENT });
    page.drawText(sanitizeForPdf("Empfohlene Massnahmen"), {
      x: MARGIN + 10, y, size: 12, font: bold, color: INK,
    });
    y -= 20;
    for (const t of tasks) {
      drawLines(`- ${t.title} (faellig in ${t.dueInDays} Tagen)`, { font: bold, size: 10.5 });
      drawLines(`  ${t.reason}`, { font, size: 9.5, color: GRAY });
      y -= 6;
    }
  }

  // Fußzeile auf jeder Seite
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(
      sanitizeForPdf(`Netural Marktradar · vertraulich · Seite ${i + 1}/${pages.length}`),
      { x: MARGIN, y: MARGIN - 24, size: 8, font, color: GRAY }
    );
  });

  return doc.save();
}
