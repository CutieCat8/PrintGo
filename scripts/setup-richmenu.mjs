// Puts the PrintGo menu (scripts/assets/richmenu.png) on the LINE account.
//   npm run richmenu
// Needs LINE_CHANNEL_ACCESS_TOKEN and NEXT_PUBLIC_LIFF_ID in .env.local. Safe to run again.
import { readFile } from "node:fs/promises";
import { installRichMenu } from "../src/lib/line/richmenu.ts";

const { LINE_CHANNEL_ACCESS_TOKEN: token, NEXT_PUBLIC_LIFF_ID: liffId } = process.env;

async function main() {
  if (!token || !liffId) {
    throw new Error("Fill LINE_CHANNEL_ACCESS_TOKEN and NEXT_PUBLIC_LIFF_ID in .env.local first");
  }
  const image = await readFile(new URL("./assets/richmenu.png", import.meta.url));
  const id = await installRichMenu({ token, liffId, image });
  console.log(`Rich menu installed: ${id}`);
}

// Set the exit code instead of process.exit(): see make-admin.mjs
main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
