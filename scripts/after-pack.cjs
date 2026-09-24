// electron-builder afterPack hook: copy the Next.js standalone server (including its trimmed
// node_modules, which extraResources always drops) into the app's resources/server folder.
// Runs before code signing, so the server is covered by the signature.
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
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
  console.log(`  • copied desktop server  to=${path.relative(context.packager.projectDir, target)}`);
};
