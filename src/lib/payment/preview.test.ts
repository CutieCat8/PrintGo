import { writeFile } from "node:fs/promises";
import { it } from "vitest";
import { getPaymentProvider } from "./provider";

// Manual artifact generation only: normal tests/CI never read real account env
// or create a payment QR. Invoke through npm run payment:preview.
it.skipIf(process.env.PRINTGO_QR_PREVIEW !== "1")(
  "สร้าง QR สำหรับสแกนตรวจสอบ A1 (ไม่โอนเงิน)",
  async () => {
    const { qrDataUrl } = await getPaymentProvider().createCharge({
      orderId: "a1-manual-scan-check",
      amountSatang: 123,
    });
    const output = process.env.PRINTGO_QR_OUTPUT;
    if (!output) throw new Error("กรุณาใช้ npm run payment:preview เพื่อสร้างรูป QR");
    await writeFile(output, Buffer.from(qrDataUrl.split(",")[1], "base64"), {
      flag: "wx",
      mode: 0o600,
    });
  },
);
