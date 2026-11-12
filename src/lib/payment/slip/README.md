# A2: ตรวจสลิป

ใช้ interface `PaymentProvider` ตาม CONTRACTS เดิม ไม่เปลี่ยน endpoint หรือ schema
ก่อนเรียกตรวจสลิป ฝั่งเซิร์ฟเวอร์สร้าง provider ด้วยข้อมูลออเดอร์จาก DB:

```ts
const provider = getPaymentProvider({
  orderCreatedAt: order.created_at,
  branchReceiverConfirmed: true,
});
const result = await provider.verifySlip({ slipBytes, expectedAmountSatang });
```

`branchReceiverConfirmed` เป็นการยืนยัน configuration ฝั่งเซิร์ฟเวอร์หลังซีตรวจแล้วว่า
บัญชีที่ผูกกับสาขา SlipOK ตรงกับบัญชีพร้อมเพย์ PrintGo ต้องไม่อ่านค่านี้จาก request
ของลูกค้า และไม่ตั้ง `true` เพียงเพราะมี API key
`orderCreatedAt` ต้องเป็นเวลาจาก DB ที่มี timezone ส่วนยอดต้องมาจากออเดอร์ฝั่งเซิร์ฟเวอร์
A3 เป็นผู้เชื่อมข้อมูลนี้กับ API/DB จริง

## การเลือกโหมด

- ไม่มี `SLIPOK_API_KEY`/`SLIPOK_BRANCH_ID` หรือข้อมูลออเดอร์/บัญชียังไม่พร้อม:
  คืน `review` โดยไม่เรียกบริการ ตาม default O9
- มี configuration ครบและซีตรวจบัญชีสาขาแล้ว: ส่ง multipart `files` และ `log=true`
  ไป SlipOK ด้วย header `x-authorization` จำกัดเวลารอ 10 วินาที ไม่ตาม redirect
- ผู้ใช้อนุมัติ `log=true` ในงาน A2 โดยมีเงื่อนไขว่าซีตั้งบัญชีสาขาตรง PrintGo ก่อนใช้จริง
  โหมดนี้ให้ SlipOK เก็บข้อมูลสลิป ตรวจผู้รับตามบัญชีสาขา และตรวจสลิปซ้ำ
  ไม่ใช้การเทียบเลขบัญชีที่ถูกปิดบางหลักเป็นหลักฐานอนุมัติ
- ไม่ส่งยอดบาทแบบ float ไป API: อ่านยอดจากผลตอบกลับแล้วแปลงเป็นสตางค์ด้วย BigInt
  ไม่ปัดยอดที่มีทศนิยมเกินสองตำแหน่ง
- ต้องได้ผลสำเร็จชัดเจน มีเลขอ้างอิง ยอดตรง และเวลาที่โอนไม่ก่อนสร้างออเดอร์
  จึงคืน `verified` พร้อม `slipRef` ไม่มีการแก้สถานะออเดอร์หรือบันทึก payment ใน A2
- เวลาโอนในอนาคต/ข้อมูลขาด/timeout/เครือข่ายล่ม/โควตาหมด/API key ผิด/ธนาคารล่าช้า:
  คืน `review` ไม่มีทางอนุมัติจากข้อผิดพลาด ไม่ retry อัตโนมัติเพราะอาจใช้โควตาซ้ำ
- รูปที่ยอมรับ: JPEG/PNG ไม่เกิน 5 MB (ตรวจ signature เบื้องต้น ก่อนส่งให้ SlipOK)

## ผลผิดพลาดและการบันทึกใน A3

- SlipOK `1012`: โยน `PAYMENT_DUPLICATE_SLIP` (409)
- `1013`: ปฏิเสธยอดไม่ตรง; `1014`: ปฏิเสธบัญชีผู้รับไม่ตรง
- `1005`–`1008`, `1011`: ปฏิเสธรูป/สลิปที่ตรวจยืนยันไม่ได้
- รหัสอื่นหรือผลผิดรูปแบบ: ส่งให้คนตรวจ ไม่ส่ง raw message ของผู้ให้บริการไปหน้าจอ

ฐานข้อมูลมี `payments.slip_ref` unique อยู่แล้ว A3 ต้องบันทึก `slipRef` จริง และ
ใช้ constraint นี้กันการส่งพร้อมกัน ไม่อาศัย query เช็คก่อน insert เพียงอย่างเดียว
เมื่อเขียน DB ไม่สำเร็จ ใช้ `mapSlipPersistenceError(error)` เพื่อแปลง unique violation
ของ `payments_slip_ref_key` เป็น 409 ส่วน error อื่นคืน INTERNAL ไม่เหมารวมเป็นสลิปซ้ำ
โค้ด A2 ยังไม่เขียน DB จึงยังไม่มีการทดสอบ unique constraint ด้วยฐานข้อมูลจริงในงานนี้

`log=true` อาจบันทึกเลขอ้างอิงกับ SlipOK แล้ว แม้โค้ดเราจะปฏิเสธยอด/เวลาในภายหลัง
หรือ timeout ก่อนรับผล การส่งสลิปเดิมซ้ำอาจได้ 1012 จึงต้องให้แอดมินตรวจกรณีนี้
ห้ามใช้ข้อมูล `data.success` ที่แนบมากับ error 1012 เพื่ออนุมัติอัตโนมัติ

## สิ่งที่ทดสอบจริง / mock

ทดสอบการเลือกโหมด การแปลงเงิน เวลา รูปแบบ request/response รหัสผิดพลาดและ error mapping
ด้วย Vitest โดย mock HTTP ทุกครั้งและจำลอง PostgreSQL errors ใช้ข้อมูลสมมติทั้งหมด
ยังไม่ได้เรียก SlipOK จริง ไม่ใช้ key จริง ไม่สมัครแพ็กเกจ และไม่มีการเก็บรูปหรือเลขบัญชีใน log
ก่อนเปิดใช้จริง ซีต้องเตรียม credentials ยืนยันบัญชีสาขา แล้วทดสอบกับสลิปจริงที่ได้รับอนุญาต

## เอกสารอ้างอิง (ตรวจ 11 พฤศจิกายน 2026)

- [Check Slip v1.8](https://slipok.com/check-slip/)
- [Error Status Code](https://slipok.com/api-documentation/error-status-code/)
- [Request / Response Example](https://slipok.com/api-documentation/request-response-example/)
- [Check Slip Quota](https://slipok.com/api-documentation/check-slip-quota/)

ตามเอกสาร โหมด log=true เก็บข้อมูลสลิปและคิดโควตาเมื่อสลิปถูกต้องและผู้รับตรง
สลิปซ้ำไม่คิดโควตาซ้ำ แต่ผู้รับผิดยังอาจใช้โควตา ให้ซีตรวจแพ็กเกจ/ค่าใช้จ่ายในบัญชีจริง
ก่อนเปิดใช้งาน ไม่อ้างราคาหรือจำนวนโควตาของบัญชีที่ยังไม่ได้ตรวจ
