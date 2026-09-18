#!/usr/bin/env node
/**
 * Renders the scripted walkthrough (session.mjs) to an asciicast, then to GIF/MP4.
 *
 *   node scripts/demo/replay/render.mjs            # .demo/replay.cast + .gif (+ .mp4 if ffmpeg)
 *
 * Writes the cast itself rather than driving a real terminal: timings are exact,
 * the render is reproducible, and it needs no ttyd/asciinema. Figures in the
 * session are real output from a live sandbox run.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { SCRIPT, COLS, ROWS } from "./session.mjs";

const OUT_DIR = ".demo";
const CAST = `${OUT_DIR}/replay.cast`;
const GIF = `${OUT_DIR}/replay.gif`;
const MP4 = `${OUT_DIR}/replay.mp4`;

/** asciicast v2: a header line, then [elapsed seconds, "o", bytes] events. */
function buildCast() {
  const events = [];
  let t = 0;
  const emit = (text) => events.push([Number(t.toFixed(3)), "o", text]);
  const wait = (ms) => (t += ms / 1000);

  for (const beat of SCRIPT) {
    if (beat.type === "print") {
      for (const line of beat.lines) {
        emit(line + "\r\n");
        wait(beat.gap ?? 70);
      }
    } else if (beat.type === "prompt") {
      emit("> ");
      wait(500);
      for (const ch of beat.text) {
        emit(ch);
        wait(beat.speed ?? 45);
      }
      wait(450);
      emit("\r\n");
      wait(250);
    } else if (beat.type === "wait") {
      wait(beat.ms);
    }
  }
  const header = { version: 2, width: COLS, height: ROWS, timestamp: Math.floor(Date.now() / 1000), env: { TERM: "xterm-256color", SHELL: "/bin/zsh" }, title: "Steward — month-end close" };
  return [JSON.stringify(header), ...events.map((e) => JSON.stringify(e))].join("\n") + "\n";
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(CAST, buildCast());
console.log(`✓ ${CAST}`);

const run = (cmd, args) => {
  try {
    execFileSync(cmd, args, { stdio: "inherit" });
    return true;
  } catch (e) {
    console.log(`! ${cmd} failed (${String(e).split("\n")[0]})`);
    return false;
  }
};

// agg renders the cast to GIF. `brew install agg` if missing.
if (run("agg", ["--theme", "1e1e2e,cdd6f4,45475a,f38ba8,a6e3a1,f9e2af,89b4fa,f5c2e7,94e2d5,bac2de,585b70,f38ba8,a6e3a1,f9e2af,89b4fa,f5c2e7,94e2d5,a6adc8", "--font-size", "20", "--line-height", "1.4", "--speed", "1", CAST, GIF])) {
  console.log(`✓ ${GIF}`);
  // GIF → MP4 for slides and the page (smaller, seekable).
  if (run("ffmpeg", ["-y", "-loglevel", "error", "-i", GIF, "-movflags", "faststart", "-pix_fmt", "yuv420p", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", MP4])) console.log(`✓ ${MP4}`);
}
