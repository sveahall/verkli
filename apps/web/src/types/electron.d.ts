export {};

declare global {
  interface Window {
    electronAPI?: {
      /**
       * Invoke local desktop TTS via Electron.
       * Returns an object with a base64-encoded WAV payload.
       */
      ttsSpeak(text: string): Promise<{ audioBase64: string }>;
    };
  }
}
