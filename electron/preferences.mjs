// Non-secret app preferences in <userData>/preferences.json (secrets live in secrets.json).
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

const DEFAULTS = { checkForUpdates: true, skippedVersion: null };

const file = () => path.join(app.getPath("userData"), "preferences.json");

export const prefs = {
  get() {
    try {
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), "utf8")) };
    } catch {
      return { ...DEFAULTS };
    }
  },
  set(changes) {
    const next = { ...this.get(), ...changes };
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(next, null, 2), { mode: 0o600 });
    return next;
  },
};
