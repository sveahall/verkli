class TtsError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "TtsError";
    if (details) {
      this.details = details;
    }
  }
}

async function synthesizeTextToWavBytes(text) {
  const normalized = text?.toString() ?? "";
  const trimmed = normalized.trim();
  if (!trimmed) {
    throw new TtsError("Texten får inte vara tom.");
  }

  throw new TtsError(
    "LEGACY_TTS_REMOVED: Lokal TTS-motor har tagits bort. Använd Qwen3 TTS istället.",
  );
}

module.exports = {
  TtsError,
  synthesizeTextToWavBytes,
};
