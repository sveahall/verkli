const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  /**
   * Synthesize speech from text via the main-process TTS service.
   * Returns an object { audioBase64: string } where the payload is a WAV file.
   */
  ttsSpeak: (text) => {
    return ipcRenderer.invoke("tts:speak", { text });
  },
});

