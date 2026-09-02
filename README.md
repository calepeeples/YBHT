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
- Optional telemetry stores daily aggregate counters only. It never creates individual event, user, device, file, or session records.
- Telemetry never includes frames, frame names, design intent, dialogue, reports, access codes, or IP addresses.

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
METRICS_ADMIN_KEY=a separate private key used only to view totals
```

Heroku uses the root `package.json`, its `start` command, and the supplied `PORT` automatically.

### Enable anonymous metrics

1. Add Heroku Postgres to the app. Heroku supplies `DATABASE_URL` automatically.
2. Set `METRICS_ADMIN_KEY` to a separate strong secret. Do not share it with testers.
3. Deploy the latest `main` branch. The backend creates its aggregate table automatically.

Metrics are stored as one counter per UTC day and event type and deleted after 90 days. There are no individual event rows and no persistent identifiers, so a person's activity cannot be reconstructed. If `DATABASE_URL` is absent or temporarily unavailable, the meeting still works and metrics are skipped.

To read the latest 30 days without putting the key in a URL:

```sh
curl -H "X-Metrics-Key: your-private-metrics-key" https://your-app.herokuapp.com/metrics
```

`meeting_completed.value_sum / meeting_completed.event_count` gives the average number of boss turns for completed meetings.

## Create a tester build

After Heroku gives you an HTTPS origin:

```sh
npm run package:test -- https://your-app.herokuapp.com
```

This creates `test-build/` containing the compiled plugin, a production manifest restricted to that origin, and tester instructions. Zip that folder and share it along with the tester access code through a separate message.

Do not share `.env`, your OpenAI key, the backend source folder, or `node_modules`.

See `TESTING.md` for the suggested private-beta protocol.

## Future features

- Explicitly save a text-only meeting transcript for later review.
- Save or share the SURVIVED table as a standalone artifact without the frame or full conversation.
- Explore live boss-thinking cues and subtle EgoMeter movement during the meeting without exposing private model reasoning or turning the simulation into a score game.

See `ROADMAP.md` for the privacy and product constraints around these features.

## Intentionally absent

- Accounts and payments
- Figma comments
- Server-side conversation history
- Saved design images
- Team analytics
- Multiple boss personas

The hidden simulation state includes EgoMeter, Bullshit Detector, Design Integrity, Stakeholder Confidence, Decision Quality, and Chaos. It is not shown to testers yet.
