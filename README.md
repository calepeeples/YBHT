# Your Boss Has Thoughts

A private Figma rehearsal room for difficult design reviews.

Select one frame, explain its intent, and defend it against one irritatingly plausible boss. The frame is analyzed once. Follow-up turns use a compact text state rather than resending the design.

> The boss is sometimes right. The designer is sometimes full of shit. Neither knows which at the beginning.

## Local development

```sh
npm install
npm run build
OPENAI_API_KEY=your_key_here npm start
```

Import `manifest.json` as a development plugin in Figma Desktop. The source build calls `http://localhost:8787`.

## Private beta safeguards

- The OpenAI key remains on the backend.
- `store: false` is sent with OpenAI requests.
- The backend does not save frames, dialogue, or hidden session state.
- Closing the plugin clears the session.
- A shared `TESTER_CODE` protects the beta endpoint.
- Requests are limited per tester/IP each hour.
- Oversized frames and excessively long text are rejected.

These are practical prototype safeguards, not a substitute for production authentication or a formal security review.

## Deploy to Heroku

1. Connect Heroku to `calepeeples/YBHT` or push this repository with the Heroku CLI.
2. Use a Basic dyno for an always-on test experience.
3. Set these Config Vars in Heroku Settings:

```text
OPENAI_API_KEY=your private OpenAI project key
TESTER_CODE=a private code you give testers
RATE_LIMIT_PER_HOUR=30
OPENAI_MODEL=gpt-4.1-mini
```

Heroku uses the root `package.json`, its `start` command, and the supplied `PORT` automatically.

## Create a tester build

After Heroku gives you an HTTPS origin:

```sh
npm run package:test -- https://your-app.herokuapp.com
```

This creates `test-build/` containing the compiled plugin, a production manifest restricted to that origin, and tester instructions. Zip that folder and share it along with the tester access code through a separate message.

Do not share `.env`, your OpenAI key, the backend source folder, or `node_modules`.

See `TESTING.md` for the suggested private-beta protocol.

## Intentionally absent

- Accounts and payments
- Figma comments
- Server-side conversation history
- Saved design images
- Team analytics
- Multiple boss personas

The hidden simulation state includes EgoMeter, Bullshit Detector, Design Integrity, Stakeholder Confidence, Decision Quality, and Chaos. It is not shown to testers yet.
