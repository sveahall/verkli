const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const { TtsError, synthesizeTextToWavBytes } = require("./electron-tts-service");

/** @type {BrowserWindow | null} */
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "electron-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const startUrl =
    process.env.VERKLI_WEB_URL ||
    "http://localhost:3000";

  mainWindow.loadURL(startUrl).catch((err) => {
    console.error("[electron] Failed to load renderer URL", { startUrl, error: err });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle("tts:speak", async (_event, payload) => {
  const text = typeof payload === "string" ? payload : payload?.text;
  if (!text || typeof text !== "string") {
    throw new Error("Text måste vara en icke-tom sträng.");
  }

  try {
    const wav = await synthesizeTextToWavBytes(text);
    return { audioBase64: wav.toString("base64") };
  } catch (err) {
    if (err instanceof TtsError) {
      // Propagate a clean, user-friendly error message to the renderer.
      throw new Error(err.message);
    }
    console.error("[electron-tts] Unexpected error during synthesis", err);
    throw new Error("Ett oväntat fel inträffade i TTS-motorn.");
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

