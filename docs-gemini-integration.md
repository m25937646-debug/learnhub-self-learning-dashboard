# Gemini integration notes

Official sources consulted:
- https://ai.google.dev/api/generate-content
- https://ai.google.dev/gemini-api/docs/api-key

Relevant verified facts:
- Gemini REST endpoint uses `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=...`.
- Request uses `contents` with `parts[].text`; optional `systemInstruction` and `generationConfig`.
- This project uses a server-only `GEMINI_API_KEY`; the browser never receives it.
- The current API key listed `gemini-flash-latest`, `gemini-3.7-flash`, and other models as generation-capable. `gemini-2.5-flash` returned 404 for this new key, while `gemini-3.8-flash` was temporarily 503; the default was set to `gemini-flash-latest`.
- Free-tier rate limits can return 429/503 when five concurrent requests are sent. The app therefore asks one Gemini request to internally evaluate five roles and synthesize the final JSON response, with fallback to the built-in LLM if Gemini is unavailable.
