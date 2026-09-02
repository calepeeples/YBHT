import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const rawOrigin = process.argv.slice(2).find((argument) => argument !== "--");
if (!rawOrigin) {
  console.error("Usage: npm run package:test -- https://your-app.herokuapp.com");
  process.exit(1);
}

let origin;
try {
  const url = new URL(rawOrigin);
  if (url.protocol !== "https:") throw new Error("HTTPS is required");
  origin = url.origin;
} catch (error) {
  console.error(`Invalid production origin: ${error.message}`);
  process.exit(1);
}

const root = process.cwd();
const target = path.join(root, "test-build");
execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
manifest.networkAccess = { allowedDomains: [origin] };
await writeFile(path.join(target, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const sourceUi = await readFile(path.join(root, "ui.html"), "utf8");
const productionUi = sourceUi.replace(
  'const API_URL="http://localhost:8787/meeting";',
  `const API_URL=${JSON.stringify(`${origin}/meeting`)};`,
);
if (productionUi === sourceUi) throw new Error("Could not replace the local API URL in ui.html");
await writeFile(path.join(target, "ui.html"), productionUi);
await cp(path.join(root, "code.js"), path.join(target, "code.js"));
await writeFile(path.join(target, "INSTALL.txt"), `YOUR BOSS HAS THOUGHTS — PRIVATE TEST BUILD\n\n1. Unzip this folder.\n2. In Figma Desktop, open Plugins > Development > Import plugin from manifest.\n3. Choose manifest.json from this folder.\n4. Select exactly one frame and run the plugin.\n5. Enter the private tester access code provided by Cale.\n\nPrivacy: the selected frame is sent once for this meeting. The test backend does not save the frame, conversation, report, or hidden session state. Anonymous daily usage counters never include design content, conversation text, reports, or identifying information. Closing the plugin clears the session.\n`);
await writeFile(path.join(target, "FEEDBACK.txt"), `AFTER YOUR TEST\n\nPlease send Cale:\n- The moment the boss felt most recognizable\n- Anything it said that was legitimately useful\n- When it felt too smart, too stupid, too agreeable, or repetitive\n- Whether you would voluntarily try a second frame\n- Any technical problem that interrupted the meeting\n\nIf company policy restricts sending designs to third-party AI services, do not use that work in this test.\n`);

console.log(`Tester build created at ${target}`);
