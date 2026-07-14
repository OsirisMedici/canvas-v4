import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export async function createFilePreview(filePath: string, mimeType: string, fileName: string) {
  const directory = path.dirname(filePath);
  const previewPath = path.join(directory, "preview.jpg");
  const lower = fileName.toLowerCase();

  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    await run(process.env.PDFTOPPM_BIN || "pdftoppm", ["-f", "1", "-singlefile", "-jpeg", "-scale-to-x", "1400", "-scale-to-y", "-1", filePath, path.join(directory, "preview")], { timeout: 120_000 });
    return previewPath;
  }

  if (mimeType.startsWith("video/")) {
    await run(process.env.FFMPEG_BIN || "ffmpeg", ["-y", "-ss", "1", "-i", filePath, "-frames:v", "1", "-vf", "scale='min(1400,iw)':-2", previewPath], { timeout: 120_000 });
    return previewPath;
  }

  return null;
}
