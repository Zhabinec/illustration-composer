import { build, context } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./", import.meta.url));
await mkdir(root + "dist", { recursive: true });
await copyFile(root + "index.html", root + "dist/index.html");
const options = {
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  outdir: "dist",
  format: "esm",
  target: "es2022",
  sourcemap: true,
  minify: !process.argv.includes("--serve"),
  loader: { ".css": "css" }
};
if (process.argv.includes("--serve")) {
  const server = await context(options);
  await server.watch();
  const address = await server.serve({ servedir: root + "dist", host: "127.0.0.1", port: 4173 });
  console.log("Illustration Composer http://" + address.hosts[0] + ":" + address.port);
} else {
  await build(options);
}
