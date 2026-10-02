import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";

// Preserve the official artwork; only omit the wordmark and fit the symbol.
// Source: https://youthschool.co.kr/
const source = new URL("./assets/branding/youthschool-logo.png", import.meta.url);
const background = "#FFFFFF";
const symbol = await sharp(await readFile(source))
  .extract({ left: 0, top: 0, width: 330, height: 186 })
  .trim()
  .png()
  .toBuffer();

async function centeredSymbol(size, symbolWidth, fill) {
  const resized = await sharp(symbol)
    .resize({ width: symbolWidth })
    .png()
    .toBuffer();
  const { height } = await sharp(resized).metadata();
  return sharp({
    create: { width: size, height: size, channels: 4, background: fill },
  })
    .composite([{
      input: resized,
      left: Math.floor((size - symbolWidth) / 2),
      top: Math.floor((size - height) / 2),
    }]);
}

const icon = await (await centeredSymbol(1024, 820, background))
  .removeAlpha().png().toBuffer();
const foreground = await (await centeredSymbol(432, 260, "#FFFFFF00"))
  .png().toBuffer();
const alpha = await sharp(foreground).extractChannel("alpha").toBuffer();
const monochrome = await sharp({
  create: { width: 432, height: 432, channels: 3, background: "#000000" },
}).joinChannel(alpha).png().toBuffer();
const adaptiveBackground = await sharp({
  create: { width: 432, height: 432, channels: 3, background },
}).png().toBuffer();

const outputs = [
  ["icon.png", icon],
  ["splash-icon.png", await (await centeredSymbol(1024, 820, "#FFFFFF00")).png().toBuffer()],
  ["favicon.png", await sharp(icon).resize(48, 48).png().toBuffer()],
  ["android-icon-foreground.png", foreground],
  ["android-icon-monochrome.png", monochrome],
  ["android-icon-background.png", adaptiveBackground],
];

for (const [name, data] of outputs) {
  await writeFile(new URL(`./assets/${name}`, import.meta.url), data);
}
