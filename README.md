Main app lives in `apps/web`. You can run it from repo root with `npm run dev` or directly from `apps/web`.

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Local TTS (Piper) – desktop (Electron)

Detta repo har stöd för **100% lokal TTS** med [Piper](https://github.com/rhasspy/piper) utan externa API‑anrop.
I stället för en HTTP‑route (`/api/tts`) körs Piper som en subprocess i en **Electron‑main‑process** och nås
från UI:t via IPC (ingen `fetch`, ingen localhost‑endpoint).

- **Röstmodell**: Svensk röst finns i `vendor/tts/voices`:
  - `sv_SE-nst-medium.onnx`
  - `sv_SE-nst-medium.onnx.json`
- **Piper‑binär**: Ligger i `vendor/tts/piper/piper` (macOS x64‑binary).

### 1. Installera Python‑miljö för Piper

- **Python**: Använd **Python 3.11** (andra versioner är inte testade här).
- Skapa venv (från repo‑root):

```bash
cd vendor/tts/piper
python3.11 -m venv .venv-tts
source .venv-tts/bin/activate
pip install --upgrade pip
pip install -r requirements-tts.txt
```

`requirements-tts.txt` innehåller:

- `piper-tts==1.3.0` (OBS: **inte** 1.4.0, pga espeakbridge‑bugg)
- `piper-phonemize==1.1.0`
- `pathvalidate`

### 2. Voice-filer

- Om `vendor/tts/voices/sv_SE-nst-medium.onnx` och `.json` redan finns i repo:t behöver du inte göra något.
- Om de saknas:
  - Ladda ner en svensk modell från Piper‑voicearkivet (se Piper‑repo:t för länk), och placera:
    - modellen som `vendor/tts/voices/sv_SE-nst-medium.onnx`
    - konfigurationen som `vendor/tts/voices/sv_SE-nst-medium.onnx.json`

Inga större binärer eller secrets ska checkas in utöver det som redan ligger i `vendor/tts`.

### 3. Smoke test för TTS (CLI)

Från repo‑root:

```bash
npm run tts:smoke
```

Detta script (`scripts/tts_smoke_test.sh`) gör följande:

- Skickar en kort svensk fras till Piper.
- Skapar en temporär WAV‑fil i `/tmp`.
- Verifierar att filen har en giltig `RIFF`‑header (WAV).
- På macOS, om `afplay` finns, spelas ljudet upp.

Du kan styra scriptet med env vars (alla har vettiga default):

- `TTS_BIN` – binär att köra (default `piper`).
- `TTS_MODEL_PATH` – sökväg till `.onnx` (default `vendor/tts/voices/sv_SE-nst-medium.onnx`).
- `TTS_CONFIG_PATH` – sökväg till `.json` (default `vendor/tts/voices/sv_SE-nst-medium.onnx.json`).
- `TTS_DATA_DIR` – katalog med Piper‑data/voices (default `vendor/tts/voices`).

Exempel (macOS, kör direkt mot incheckad binär):

```bash
export PATH="$(pwd)/vendor/tts/piper/piper:$PATH"
npm run tts:smoke
```

### 4. Backend‑API: POST /api/tts

Det finns ett enkelt web‑API i Next.js‑backend: `POST /api/tts`.

- **Request** – `Content-Type: application/json`:

  ```json
  { "text": "Hej, detta är en svensk talsyntes." }
  ```

- **Validering**:
  - `text` måste vara en icke‑tom sträng.
  - Maxlängd: **1000 tecken** – längre texter ger `400 Bad Request`.

- **Svar**:
  - `200 OK` med `Content-Type: audio/wav` och binär WAV‑payload.
  - `400 Bad Request` vid ogiltig input (t.ex. för lång/ingen text).
  - `503 Service Unavailable` om TTS är avstängt.
  - `500 Internal Server Error` vid fel i själva syntesen.

Exempel med `curl`:

```bash
curl -X POST http://localhost:3000/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hej, detta är en svensk talsyntes."}' \
  --output tts-output.wav
```

### 5. Konfiguration via env vars (backend)

Backend‑modulen använder följande env vars. Vissa har rimliga default‑värden;
andra (som `TTS_BIN`) är obligatoriska:

- `TTS_ENABLED` – `"true"`/`"false"` (default: **true om ej satt**).
- `TTS_MODEL_PATH` – default `vendor/tts/voices/sv_SE-nst-medium.onnx` (tolkas relativt repo‑root).
- `TTS_CONFIG_PATH` – default `vendor/tts/voices/sv_SE-nst-medium.onnx.json` (repo‑root).
- `TTS_DATA_DIR` – default `vendor/tts/voices` (repo‑root).
- `TTS_BIN` – **obligatorisk** och måste vara en **absolut** sökväg till Piper‑binären
  (t.ex. `/usr/local/anaconda3/envs/verkli-py311/bin/piper`). Ingen PATH‑fallback används.
- `TTS_TIMEOUT_MS` – valfri override av timeout i millisekunder (default 15000 ms).
- `TTS_MAX_CHARS` – max antal tecken per request (default 1000, övre hårdgräns 20000).
- `TTS_MAX_CONCURRENCY` – max samtidiga TTS‑processer per Node‑process (default 1, max 16).
- `TTS_RATE_LIMIT_PER_MINUTE` – antal requests per minut och IP (default 30, max 600).
- `TTS_API_TOKEN` – om satt krävs headern `x-tts-token` med samma värde.

I produktion rekommenderas **absoluta sökvägar** för modell/config/data-dir (t.ex. `/opt/verkli/vendor/tts/...`) för att undvika problem om `cwd` skiljer sig mellan processer.

Sätt dessa t.ex. i `apps/web/.env.local` när du kör lokalt.

## Runway text→video

Kör från **`apps/web`** (eller `cd apps/web` om du är i repo-root).

**API** – `POST /api/ai/text-to-video` (Content-Type: application/json):

- `promptText` – **obligatorisk** text som beskriver videon (1–1000 tecken)
- `duration` – 4, 6 eller 8 sekunder (default 6)
- `ratio` – t.ex. `"1280:720"`, `"720:1280"`, `"1080:1920"`, `"1920:1080"`
- `audio` – `true`/`false` om videon ska ha ljud (påverkar pris)

Exempel:

```bash
curl -X POST http://localhost:3000/api/ai/text-to-video \
  -H "Content-Type: application/json" \
  -d '{"promptText":"Lugn timelapse med moln som glider över himlen."}'
```

**CLI** – `npm run runway:text-to-video`. Använd env (t.ex. i `.env.local`):

- `RUNWAY_PROMPT_TEXT` – egen prompt (default: cinematic 5‑sec shot)
- `RUNWAY_DURATION` – 4, 6 eller 8
- `RUNWAY_RATIO` – t.ex. `1280:720`
- `RUNWAY_AUDIO` – `1` eller `true` för ljud

**Var hittar jag videorna?** De sparas inte i en mapp. Runway returnerar **länkar** (URL:er) i svaret. CLI skriver ut dem i terminalen efter körning – öppna länken i webbläsaren eller ladda ner filen. API:et returnerar samma URL:er i `output` (array). Länkarna går ut efter en tid.

## Production considerations för TTS

- **Auth**:
  - Sätt `TTS_API_TOKEN` i produktion och kräv motsvarande header `x-tts-token` i alla anrop till `/api/tts`.
  - Kombinera gärna med befintlig auth (t.ex. Supabase‑baserad) om ni exponerar TTS till inloggade användare.
- **Concurrency**:
  - Begränsa antalet samtidiga subprocessar med `TTS_MAX_CONCURRENCY` (default 1, max 16) för att skydda CPU och minne.
  - Vid överskriden gräns returnerar API:t `503` med `{ "error": "TTS is busy" }`.
- **Rate limiting**:
  - `TTS_RATE_LIMIT_PER_MINUTE` styr en enkel in-memory token bucket per IP (default 30/min).
  - Vid överskriden gräns returneras `429` + `Retry-After`‑header i sekunder.
- **Paths**:
  - I prod bör `TTS_MODEL_PATH`, `TTS_CONFIG_PATH` och `TTS_DATA_DIR` sättas till **absoluta** sökvägar (t.ex. volymer under `/opt/verkli`).
  - Backend validerar att filer/kataloger existerar och ger tydliga felmeddelanden om de saknas.
- **Caching**:
  - För återkommande texter kan du lägga ett tunt cache‑lager ovanpå `/api/tts` (t.ex. keyed på textens hash) om du vill undvika upprepade synteser.
  - Denna repo‑implementation gör inget caching själv, utan fokuserar på säker körning av Piper.

Exempel `.env.local` (dev):

```env
TTS_ENABLED=true
TTS_MODEL_PATH=vendor/tts/voices/sv_SE-nst-medium.onnx
TTS_CONFIG_PATH=vendor/tts/voices/sv_SE-nst-medium.onnx.json
TTS_DATA_DIR=vendor/tts/voices
TTS_BIN=/usr/local/anaconda3/envs/verkli-py311/bin/piper
TTS_TIMEOUT_MS=15000
TTS_MAX_CHARS=1000
TTS_MAX_CONCURRENCY=1
TTS_RATE_LIMIT_PER_MINUTE=30
# TTS_API_TOKEN=dev-secret-token
```

Exempel production‑env (t.ex. Docker/Kubernetes):

```env
TTS_ENABLED=true
TTS_MODEL_PATH=/opt/verkli/vendor/tts/voices/sv_SE-nst-medium.onnx
TTS_CONFIG_PATH=/opt/verkli/vendor/tts/voices/sv_SE-nst-medium.onnx.json
TTS_DATA_DIR=/opt/verkli/vendor/tts/voices
TTS_BIN=/opt/verkli/vendor/tts/piper/piper
TTS_TIMEOUT_MS=20000
TTS_MAX_CHARS=1000
TTS_MAX_CONCURRENCY=2
TTS_RATE_LIMIT_PER_MINUTE=60
TTS_API_TOKEN=change-me-strong-secret
```

