import solidTransformPlugin from "@opentui/solid/bun-plugin";
import { solidClientPlugin } from "./src/lib/solid-client-plugin";

// Our plugin goes first: it swaps Solid's SSR build for the client build on
// every OS (opentui's own path filter only matches POSIX separators, so
// Windows used to bundle the SSR build). See src/lib/solid-client-plugin.ts.
const result = await Bun.build({
  entrypoints: ["./src/index.tsx"],
  outdir: "./dist",
  target: "bun",
  plugins: [solidClientPlugin, solidTransformPlugin],
});

if (!result.success) {
  console.error("Build failed");
  for (const message of result.logs) {
    console.error(message);
  }
  process.exit(1);
}

console.log("Build successful");
