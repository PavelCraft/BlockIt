import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { startServer } from "./server.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const chrome = process.env.CHROME_BIN || "google-chrome";
const server = await startServer();
const cards = ["remove", "mode", "build", "preview", "manage"];
const sets = [
  { locale: "ru", page: "index-v2.html" },
  { locale: "en", page: "index-v2-en.html" }
];

try {
  for (const set of sets) {
    const output = join(here, "output", `cards-${set.locale}`);
    mkdirSync(output, { recursive: true });
    for (const [index, card] of cards.entries()) {
      const file = join(output, `${index + 1}-${card}.png`);
      const status = await new Promise((resolve, reject) => {
        const child = spawn(chrome, [
          "--headless=new", "--no-sandbox", "--hide-scrollbars", "--force-device-scale-factor=1",
          "--window-size=1280,800", `--screenshot=${file}`, `http://127.0.0.1:8788/${set.page}?card=${card}`
        ], { stdio: "inherit" });
        child.once("error", reject);
        child.once("exit", resolve);
      });
      if (status !== 0) throw new Error(`Chrome export failed: ${file}`);
    }
  }
  const promoOutput = join(here, "output", "store-promo");
  mkdirSync(promoOutput, { recursive: true });
  const promos = [
    { size: "small", width: 440, height: 280, file: "promo-small.png" },
    { size: "marquee", width: 1400, height: 560, file: "promo-marquee.png" }
  ];
  for (const promo of promos) {
    const file = join(promoOutput, promo.file);
    const status = await new Promise((resolve, reject) => {
      const child = spawn(chrome, [
        "--headless=new", "--no-sandbox", "--hide-scrollbars", "--force-device-scale-factor=1",
        `--window-size=${promo.width},${promo.height}`, `--screenshot=${file}`, `http://127.0.0.1:8788/promo-v2.html?size=${promo.size}`
      ], { stdio: "inherit" });
      child.once("error", reject);
      child.once("exit", resolve);
    });
    if (status !== 0) throw new Error(`Chrome export failed: ${file}`);
  }
  console.log(`Exported ${cards.length} cards for ${sets.length} locales and ${promos.length} store promo images`);
} finally {
  server.close();
}
