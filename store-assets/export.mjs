import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { startServer } from "./server.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const output = join(here, "output", "store");
mkdirSync(output, { recursive: true });
const chrome = process.env.CHROME_BIN || "google-chrome";
const server = await startServer();
const cards = ["remove", "own", "syntax", "check", "manage"];

try {
  for (const [index, card] of cards.entries()) {
    const file = join(output, `ru-${index + 1}-${card}.png`);
    const status = await new Promise((resolve, reject) => {
      const child = spawn(chrome, [
        "--headless=new", "--no-sandbox", "--hide-scrollbars", "--force-device-scale-factor=1",
        "--window-size=1280,800", `--screenshot=${file}`, `http://127.0.0.1:8788/?card=${card}`
      ], { stdio: "inherit" });
      child.once("error", reject);
      child.once("exit", resolve);
    });
    if (status !== 0) throw new Error(`Chrome export failed: ${file}`);
  }
  const promos = [
    { card: "promo", width: 440, height: 280, file: "promo-small-ru.png" },
    { card: "marquee", width: 1400, height: 560, file: "promo-marquee-ru.png" }
  ];
  for (const job of promos) {
    const file = join(output, job.file);
    const status = await new Promise((resolve, reject) => {
      const child = spawn(chrome, [
        "--headless=new", "--no-sandbox", "--hide-scrollbars", "--force-device-scale-factor=1",
        `--window-size=${job.width},${job.height}`, `--screenshot=${file}`, `http://127.0.0.1:8788/?card=${job.card}`
      ], { stdio: "inherit" });
      child.once("error", reject);
      child.once("exit", resolve);
    });
    if (status !== 0) throw new Error(`Chrome export failed: ${file}`);
  }
  console.log(`Exported ${cards.length} cards and ${promos.length} promo images to ${output}`);
} finally {
  server.close();
}
