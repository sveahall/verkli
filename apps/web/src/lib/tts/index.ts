/**
 * TTS module re-exports.
 * Usage: import { synthesizeTextToWavBytes, getTtsStorageBucket } from "@/lib/tts";
 */

export {
  synthesizeTextToWavBytes,
  TtsBusyError,
  TtsDisabledError,
  TtsValidationError,
  TtsSynthesisError,
} from "./piper";

export { getTtsStorageBucket } from "./storage";
