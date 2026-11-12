import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Use the existing TS test runner so the preview exercises the actual provider,
// including the project's alias and server-only test shim, without a public route.
const root = new URL("../../../", import.meta.url);
if (!process.env.PLATFORM_PROMPTPAY_ID) {
  console.error("กรุณาตั้ง PLATFORM_PROMPTPAY_ID ใน .env.local ก่อนสร้าง QR");
  process.exit(1);
}
const directory = mkdtempSync(join(tmpdir(), "printgo-a1-"));
chmodSync(directory, 0o700);
const output = join(directory, "promptpay-1.23.png");
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL("node_modules/vitest/vitest.mjs", root)),
    "run",
    "src/lib/payment/preview.test.ts",
  ],
  {
    cwd: fileURLToPath(root),
    env: { ...process.env, PRINTGO_QR_PREVIEW: "1", PRINTGO_QR_OUTPUT: output },
    stdio: "inherit",
  },
);
if (result.error) {
  console.error("ไม่สามารถเริ่มตัวสร้าง QR ได้ กรุณาตรวจ Node.js และ npm install");
}
if (result.status === 0) {
  console.info(`สร้าง QR ยอด 1.23 บาท: ${output}`);
  console.info("ตรวจชื่อบัญชีและยอดในแอปธนาคาร โดยไม่ยืนยันโอน แล้วลบรูปหลังตรวจเสร็จ");
} else {
  rmSync(directory, { recursive: true, force: true });
}
process.exitCode = result.status ?? 1;
