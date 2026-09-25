// Renders resources/icon.svg to a transparent 1024×1024 resources/icon.png (the app icon source
// electron-builder uses). Run with: npx electron scripts/render-icon.mjs
import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow } from "electron";

const dir = path.join(import.meta.dirname, "..", "resources");
const svg = fs.readFileSync(path.join(dir, "icon.svg"), "utf8");

app.dock?.hide();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    transparent: true,
    frame: false,
    useContentSize: true,
    webPreferences: { offscreen: true, deviceScaleFactor: 1 },
  });
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`;
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  const image = (await win.webContents.capturePage()).resize({ width: 1024, height: 1024 });
  fs.writeFileSync(path.join(dir, "icon.png"), image.toPNG());
  console.log("wrote resources/icon.png", image.getSize());
  app.quit();
});
