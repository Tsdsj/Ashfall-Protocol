import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
const root = "dist";
async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (
      !path.endsWith(".md") &&
      !path.endsWith("precache.json") &&
      !path.endsWith("sw.js")
    )
      files.push(path);
  }
  return files;
}
const paths = await walk(root);
const hash = createHash("sha256");
for (const path of paths.sort()) hash.update(await readFile(path));
const manifest = {
  version: hash.digest("hex").slice(0, 16),
  files: paths.map((path) => "/" + relative(root, path).replaceAll("\\", "/")),
};
await writeFile(join(root, "precache.json"), JSON.stringify(manifest));
console.log(
  `Offline cache: ${manifest.files.length} files, version ${manifest.version}`,
);

const swPath = join(root, "sw.js");
await writeFile(
  swPath,
  (await readFile(swPath, "utf8")).replace(
    "__ASHFALL_BUILD_HASH__",
    manifest.version,
  ),
);
