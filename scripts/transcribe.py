import json
import os
import sys

try:
    from faster_whisper import WhisperModel
except ImportError as exc:
    raise SystemExit("Local Whisper is not installed. Run: npm run setup:transcription") from exc

if len(sys.argv) != 3:
    raise SystemExit("Usage: transcribe.py <media-file> <output-json>")

media_path, output_path = sys.argv[1:]
model_name = os.environ.get("WHISPER_MODEL", "base")
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
data_root = os.environ.get("VAULT_DATA_DIR", os.path.join(project_root, "data"))
model_root = os.path.join(data_root, "models", "faster-whisper")
os.makedirs(model_root, exist_ok=True)
model = WhisperModel(model_name, device="cpu", compute_type="int8", download_root=model_root)
segments, info = model.transcribe(media_path, vad_filter=True, beam_size=5)
rows = []
text_parts = []
for segment in segments:
    text = segment.text.strip()
    if not text:
        continue
    rows.append({"start": segment.start, "end": segment.end, "text": text})
    text_parts.append(text)

with open(output_path, "w", encoding="utf-8") as handle:
    json.dump({"text": " ".join(text_parts), "language": info.language, "segments": rows, "model": model_name}, handle, ensure_ascii=False, indent=2)
