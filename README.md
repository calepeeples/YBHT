# Your Boss Has Thoughts — v0.1

Select one Figma frame, describe its intent, export it once, and receive one AI-generated boss critique. The API key stays in the included backend and never enters the plugin.

## Run locally

```sh
npm install
npm run build
OPENAI_API_KEY=your_key_here npm run backend
```

In Figma Desktop, import `manifest.json` as a development plugin. The plugin UI calls `http://localhost:8787/critique`.

## Deploy later

Deploy `backend/server.mjs` to a Node host with `OPENAI_API_KEY` set. Replace `API_URL` in `ui.html` and the localhost domain in `manifest.json` with the deployed HTTPS origin.

## Intentionally not in v0.1

- Figma comments
- Payments or accounts
- Analytics or history
- Multiple boss personas
- Visible scoring

Internal placeholders exist for EgoMeter, Bullshit Detector, Design Integrity, Stakeholder Confidence, Decision Quality, and Chaos, but they are not calculated or shown yet.
