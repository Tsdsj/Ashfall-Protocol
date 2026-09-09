import { readFile, writeFile, mkdir, rename, readdir } from "node:fs/promises";
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
await writeFile(
  "dist/server/wrangler.json",
  JSON.stringify(
    {
      name: "ashfall-protocol",
      main: "index.js",
      compatibility_date: "2026-09-09",
      assets: {
        directory: "../client",
        binding: "ASSETS",
        run_worker_first: true,
      },
    },
    null,
    2,
  ),
);
await mkdir("dist/.openai", { recursive: true });
await writeFile(
  "dist/.openai/hosting.json",
  await readFile(".openai/hosting.json"),
);
console.log("Sites Worker and protected client assets prepared.");
