import {
  readFile,
  writeFile,
  mkdir,
  rename,
  readdir,
  rm,
} from "node:fs/promises";
import ts from "typescript";

await mkdir("dist/client", { recursive: true });
for (const entry of await readdir("dist", { withFileTypes: true })) {
  if (["client", "server", ".openai"].includes(entry.name)) continue;
  await rename("dist/" + entry.name, "dist/client/" + entry.name);
}
await mkdir("dist/server", { recursive: true });
const source = await readFile("src/hosting/password-gate.ts", "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
});
await writeFile("dist/server/index.js", output.outputText);
const manifest = JSON.parse(
  await readFile("dist/client/precache.json", "utf8"),
);
const privateAssets = "output/sites-assets/" + manifest.version;
await mkdir("output/sites-assets", { recursive: true });
await rm(privateAssets, { recursive: true, force: true });
await rename("dist/client", privateAssets);
await mkdir("dist/.openai", { recursive: true });
await writeFile(
  "dist/.openai/hosting.json",
  await readFile(".openai/hosting.json"),
);
console.log(
  "Sites Worker prepared; upload private assets from " + privateAssets,
);
