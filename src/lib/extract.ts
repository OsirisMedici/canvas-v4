import { readFile } from "node:fs/promises";
import mammoth from "mammoth";
import { runCommand } from "@/lib/process";
import { JSDOM } from "jsdom";

export async function extractFileText(filePath: string, mimeType: string, fileName: string) {
  if (mimeType.startsWith("text/") || /\.(md|txt|csv|json)$/i.test(fileName)) {
    const text = await readFile(filePath, "utf8");
    if (mimeType === "text/html" || /\.html?$/i.test(fileName)) return (new JSDOM(text).window.document.body.textContent || "").trim().slice(0, 2_000_000);
    return text.slice(0, 2_000_000);
  }
  if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
    const { stdout } = await runCommand(process.env.PDFTOTEXT_BIN || "pdftotext", [filePath, "-"], 60_000);
    return stdout.trim().slice(0, 2_000_000);
  }
  if (/\.docx$/i.test(fileName)) {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value.trim().slice(0, 2_000_000);
  }
  return null;
}
