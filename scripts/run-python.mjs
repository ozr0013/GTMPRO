// Picks the right Python and runs a script with it.
//
// `python` on PATH is not reliably the interpreter you installed into — on this
// project's Windows box it resolved to an unrelated project's virtualenv, so
// `npm run images:server` died with "No module named torch" while pip had
// installed torch perfectly well somewhere else.
//
// Order: $PYTHON, then the project venv, then python3/python.

import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const isWindows = process.platform === "win32";
const venvPython = resolve(
  process.cwd(),
  ".venv-images",
  isWindows ? "Scripts/python.exe" : "bin/python",
);

function pickPython() {
  if (process.env.PYTHON) return { cmd: process.env.PYTHON, why: "$PYTHON" };
  if (existsSync(venvPython)) return { cmd: venvPython, why: ".venv-images" };
  return { cmd: isWindows ? "python" : "python3", why: "PATH" };
}

const script = process.argv[2];
if (!script) {
  console.error("usage: node scripts/run-python.mjs <script.py> [args...]");
  process.exit(2);
}

const { cmd, why } = pickPython();
console.log(`[flywheel] python: ${cmd}  (${why})`);

if (why === "PATH") {
  console.log(
    "[flywheel] tip: create an isolated env so a stray venv on PATH cannot shadow it:\n" +
      `           python -m venv .venv-images && ${
        isWindows ? ".venv-images\\Scripts\\python" : ".venv-images/bin/python"
      } -m pip install -r requirements-images.txt`,
  );
}

const child = spawn(cmd, [script, ...process.argv.slice(3)], { stdio: "inherit", shell: false });
child.on("error", (err) => {
  console.error(`[flywheel] could not start ${cmd}: ${err.message}`);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 0));
