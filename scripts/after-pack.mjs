// electron-builder afterPack hook: copy the Next.js standalone server (including its trimmed
// node_modules, which extraResources always drops) into the app's resources/server folder.
// Runs before code signing, so the server is covered by the signature.
import fs from "node:fs";
import path from "node:path";

export default async function afterPack(context) {
  const resources =
    context.electronPlatformName === "darwin"
      ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
      : path.join(context.appOutDir, "resources");
  const source = path.join(context.packager.projectDir, ".next", "standalone");
  if (!fs.existsSync(path.join(source, "server.js"))) {
    throw new Error("Desktop server not built. Run scripts/build-desktop.mjs first.");
  }
  const target = path.join(resources, "server");
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true, verbatimSymlinks: true });

  // better-sqlite3 ships prebuilt binaries for every platform; keep only this build's, and
  // refuse to package if it's missing (the app would crash at startup on that machine).
  const arch = { 0: "ia32", 1: "x64", 2: "armv7l", 3: "arm64", 4: "universal" }[context.arch];
  const prebuilds = path.join(target, "node_modules", "better-sqlite3", "prebuilds");
  const needed =
    arch === "universal"
      ? ["arm64", "x64"].map((a) => `${context.electronPlatformName}-${a}.node`)
      : [`${context.electronPlatformName}-${arch}.node`];
  const missing = needed.filter((file) => !fs.existsSync(path.join(prebuilds, file)));
  if (missing.length) throw new Error(`SQLite binary missing for this build: ${missing.join(", ")}`);
  for (const file of fs.readdirSync(prebuilds)) if (!needed.includes(file)) fs.rmSync(path.join(prebuilds, file));
  console.log(`  • copied desktop server  to=${path.relative(context.packager.projectDir, target)}`);
}
