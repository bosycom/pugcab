import { format } from "date-fns";
import kebabCase from "lodash.kebabcase";

export function toTaskSlug(backupName) {
  return kebabCase(String(backupName || "").trim());
}

export function buildArchiveFileName({ backupName, date = new Date() }) {
  const slug = toTaskSlug(backupName);
  // Windows filenames cannot contain ":".
  const ts = format(date, "yyyy-MM-dd_HH-mm-ss");
  return `${ts}_${slug}.zip`;
}
