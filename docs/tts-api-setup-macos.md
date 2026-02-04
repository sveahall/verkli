# TTS API Setup for macOS

This guide helps you set up the Piper TTS model for the Next.js API route at `/api/books/[id]/audiobook/generate`.

## Prerequisites

- Piper binary installed and available in your PATH (or via conda/venv)
- Next.js app running from `apps/web` directory

## Setup Steps

### 1. Create the model directory

From the repo root:

```bash
mkdir -p apps/web/models/piper
```

### 2. Download the Swedish model

Download the `sv_SE-nst-medium` model from the [Piper voice archive](https://huggingface.co/rhasspy/piper-voices/tree/main/sv/sv_SE/nst-medium) or use curl:

```bash
cd apps/web/models/piper

# Download the model file (ONNX)
curl -L -o sv_SE-nst-medium.onnx \
  "https://huggingface.co/rhasspy/piper-voices/resolve/main/sv/sv_SE/nst-medium/sv_SE-nst-medium.onnx"

# Download the config file (JSON)
curl -L -o sv_SE-nst-medium.onnx.json \
  "https://huggingface.co/rhasspy/piper-voices/resolve/main/sv/sv_SE/nst-medium/sv_SE-nst-medium.onnx.json"
```

**Alternative**: If you already have the model in `vendor/tts/voices/`, you can create a symlink:

```bash
cd apps/web/models/piper
ln -s ../../../vendor/tts/voices/sv_SE-nst-medium.onnx .
ln -s ../../../vendor/tts/voices/sv_SE-nst-medium.onnx.json .
```

### 3. (Optional) Set PIPER_MODEL_PATH environment variable

For explicit control, you can set the environment variable in `apps/web/.env.local`:

```bash
# In apps/web/.env.local
PIPER_MODEL_PATH=/absolute/path/to/apps/web/models/piper/sv_SE-nst-medium.onnx
```

Or export it in your shell:

```bash
export PIPER_MODEL_PATH="$(pwd)/apps/web/models/piper/sv_SE-nst-medium.onnx"
```

### 4. Verify Piper works locally

Test that Piper can generate audio with the model:

```bash
echo "Hej, detta är en test." | piper \
  --model apps/web/models/piper/sv_SE-nst-medium.onnx \
  --output_file /tmp/test.wav

# Play the file (macOS)
afplay /tmp/test.wav
```

If `piper` is not found, you may need to:
- Activate your conda/venv environment where Piper is installed
- Or use the full path to the piper binary

### 5. Restart Next.js

Clear the Next.js cache and restart:

```bash
cd apps/web
rm -rf .next
npm run dev
```

## Troubleshooting

The API route now logs detailed debugging information. Check your Next.js console output for:

- `process.cwd()` - Shows the working directory
- `Resolved modelPath` - Shows which model file was found
- `Attempted paths` - Shows all paths that were checked
- `Piper binary` - Shows which `piper` command will be used

If the model is still not found, the error response will include all attempted paths to help you diagnose the issue.
