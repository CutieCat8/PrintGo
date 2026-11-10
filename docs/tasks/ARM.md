# งานของอาร์ม (ภูริวัชร) — Fullstack: ชำระเงิน + Settlement + Admin

อ่าน `CLAUDE.md`, `docs/CONTRACTS.md`, `DECISIONS.md` ก่อนทุก task · ถามก่อนทำตามโปรโตคอลใน `CLAUDE.md` ข้อ 1
โฟลเดอร์ของอาร์ม: `src/lib/payment/**`, `src/components/payment/**`, `src/app/api/payments/**`, `src/app/api/admin/**`, `src/app/admin/**` (รวม `src/app/admin/_lib/api.ts` ตัวเรียก API แอดมิน), `src/app/shop/settings/**`
ใช้ของคนอื่น: คอมโพเนนต์ `src/components/ui/*` (ยูริ, Y1 เสร็จ 10 พ.ย.), `calculateTotals` + `formatBaht` (พลุ, P1), `transition()` (พลุ, P2), `requireCustomer/requireAdmin/requireShop` (ซี), `notify()` (ซี)
**เรื่องเงินคือความเสี่ยงสูงสุดของโปรเจกต์** — ทุก task ต้องมี test และห้ามใช้ทศนิยม

## ข้อตกลงเรื่องเงิน (ต้นแบบ — D7/O9)
- ลูกค้าโอนเข้า **บัญชีพร้อมเพย์ของ PrintGo** (`PLATFORM_PROMPTPAY_ID`) ยอด = `total_satang` ของออเดอร์
- ตรวจสลิปด้วย SlipOK ถ้ามี `SLIPOK_API_KEY`; ถ้าไม่มี → สถานะ `pending_review` ให้แอดมินอนุมัติด้วยตา (`verified_by='admin'`)
- เมื่อ `verified` → เรียก `transition(awaiting_payment→paid, actor system)` (ของพลุ) ซึ่งสร้าง settlement + pickup code ให้เอง
- โอนเงินให้ร้านและคืนเงินลูกค้าเป็นขั้นตอนมือของแอดมิน (บันทึกในระบบ)
- ยังไม่ยืนยันเรื่องกฎหมายรับชำระแทนร้าน → อย่าเขียนข้อความบนหน้าจอหรือเอกสารที่อ้างว่าถูกต้องตามกฎหมาย

---

## A1 — `PaymentProvider` + PromptPay QR  ·  9–10 พ.ย.
**เป้าหมาย:** สร้าง QR พร้อมเพย์ที่ยอดถูกต้องและเป็นจุดเดียวที่คุยกับระบบจ่ายเงิน
**ไฟล์:** `src/lib/payment/{types.ts,promptpay.ts,provider.ts,index.ts,*.test.ts}`
**ทำอะไร:**
- `types.ts`: interface `PaymentProvider` ตาม CONTRACTS ข้อ 7
- `promptpay.ts`: สร้าง payload EMVCo ของ PromptPay (ใช้แพ็กเกจ `promptpay-qr` + `qrcode` — ถามซีก่อนเพิ่ม 2 แพ็กเกจนี้; หรือเขียนเอง ถ้าเขียนเอง **ต้องมี CRC16 และ test เทียบตัวอย่างที่รู้ผล**) · รับ `PLATFORM_PROMPTPAY_ID` (เบอร์โทร 10 หลักหรือเลขบัตร/เลขนิติบุคคล 13 หลัก) และยอด (แปลงสตางค์เป็นบาท 2 ตำแหน่ง **ด้วยการหารจำนวนเต็ม** ไม่ใช้ float) → payload + `qrDataUrl` (PNG data URL)
- `createCharge({ orderId, amountSatang })`: ตรวจ `amountSatang` เป็นจำนวนเต็ม > 0 → คืน `{ promptpayPayload, qrDataUrl }`
- `getPaymentProvider()` สร้างตัวจริง (ตอนนี้มีตัวเดียว) · ตัว `verifySlip` ใส่ใน A2
**test:** payload ตัวอย่าง ID/ยอดที่ทราบผลลัพธ์ (ตรวจ CRC), ยอด 1 สตางค์/99999999, ยอดไม่ใช่จำนวนเต็ม → error, ID ผิดรูปแบบ → error
**เกณฑ์ผ่าน:** [ ] payload สแกนด้วยแอปธนาคารจริงแล้วแสดงยอดตรงและบัญชีถูกต้อง (**อาร์มลองสแกนเองด้วยมือถือและรายงานผล**; ถ้าไม่ทำได้ให้บอกตรง ๆ) [ ] test ผ่าน [ ] ไม่มี float ในการคำนวณเงิน (grep `toFixed`/`parseFloat`/`* 0.`)
**ห้าม:** ฮาร์ดโค้ดเลขพร้อมเพย์จริงลงโค้ด/seed/test (ใช้ env และค่าทดสอบสมมติใน test)
**ถามก่อนถ้า:** ซียังไม่ได้ให้เลขพร้อมเพย์ของ PrintGo (ใช้ค่าสมมติใน `.env.local` ของตัวเองไปก่อน)

---

## A2 — ตรวจสลิป (SlipOK + โหมดตรวจด้วยคน)  ·  10–11 พ.ย.
**เป้าหมาย:** เมื่อลูกค้าส่งสลิป ระบบตัดสินได้ว่า ผ่าน / ไม่ผ่าน / ต้องคนตรวจ และกันสลิปซ้ำ
**ไฟล์:** `src/lib/payment/slip/{slipok.ts,manual.ts,index.ts,*.test.ts}`
**ทำอะไร:**
- `verifySlip({ slipBytes, expectedAmountSatang })` คืน `{ result: 'verified'|'rejected'|'review', slipRef?, reason? }`
- `slipok.ts`: อ่านเอกสาร SlipOK **ฉบับปัจจุบัน** (รูปแบบเรียก API, header, ฟิลด์ผลลัพธ์, โค้ดข้อผิดพลาด, โควตา) ก่อนเขียน อย่าเดา · ตรวจ: สลิปถูกต้องจริง, ยอด = `expectedAmountSatang` (เปรียบเทียบเป็นสตางค์จำนวนเต็ม), บัญชีปลายทางตรงกับ PrintGo, วันเวลาโอนไม่เก่าก่อนสร้างออเดอร์ · เก็บเลขอ้างอิงสลิป (`slipRef`)
- `manual.ts`: ใช้เมื่อไม่มี `SLIPOK_API_KEY` หรือ SlipOK ล่ม/โควตาหมด → คืน `review` (ไม่ตัดสินเอง)
- ตัวเลือกใน `index.ts`: มี key → SlipOK (ถ้า error เครือข่าย → fallback `review`, ไม่ใช่ `verified`) ไม่มี key → manual **ห้ามตั้งค่าให้ผ่านอัตโนมัติเมื่อไม่มีตัวตรวจ**
- กันสลิปซ้ำ: `payments.slip_ref` unique · ซ้ำ → `PAYMENT_DUPLICATE_SLIP` (409)
- test: mock การตอบกลับของ SlipOK (สำเร็จ, ยอดไม่ตรง, บัญชีผิด, สลิปซ้ำ, timeout → review) และกรณีไม่มี key → review · ยอดเทียบเป็นสตางค์ (เช่น 12345 vs 12345.0)
**เกณฑ์ผ่าน:** [ ] ทุกกรณีใน test ผ่าน [ ] ไม่มีทางที่ `verified` เกิดจากข้อผิดพลาด/ไม่มี key [ ] รายงานตรงว่า **SlipOK ทดสอบกับของจริงหรือ mock** (ถ้าไม่มี key ก็บอกว่ายังเป็น mock)
**ห้าม:** log รูปสลิปหรือเลขบัญชี · เก็บ API key ใน repo
**ถามก่อนถ้า:** SlipOK คิดเงิน/จำกัดโควตาเท่าไร (ตรวจเอกสาร/แดชบอร์ดของ SlipOK แล้วถามซีก่อนสมัครแพ็กเกจที่เสียเงิน)

---

## A3 — Payment API + `<PaymentPanel />`  ·  11–12 พ.ย.
**ไฟล์:** `src/app/api/payments/orders/[orderId]/{charge,slip,slip/sign}/route.ts`, `src/lib/payment/service.ts`, `src/components/payment/PaymentPanel.tsx`
**ทำอะไร (API):**
- ทุก route: `requireCustomer` + ตรวจว่าออเดอร์เป็นของลูกค้า (ไม่ใช่ → 404)
- `POST …/charge`: ออเดอร์ต้องเป็น `awaiting_payment` และยังไม่เลย `payment_deadline` (ไม่งั้น `ORDER_INVALID_TRANSITION`/`expired`) · **ยอดมาจาก `orders.total_satang` เสมอ ไม่ใช่จาก request** · สร้าง/คืนแถว `payments` (ถ้ามี `pending` อยู่แล้วคืนอันเดิม ไม่สร้างซ้ำ) → คืนตาม CONTRACTS 6.3 พร้อม `expiresAt = payment_deadline`
- `POST …/slip/sign`: ออก signed upload URL ไป bucket `payment-slips` พาธ `{orderId}/{uuid}.{ext}` (jpeg/png เท่านั้น ≤ 5 MB)
- `POST …/slip { slipPath }`: ตรวจพาธต้องอยู่ใน `{orderId}/` → โหลดไฟล์ → `verifySlip` → อัปเดต `payments` (`status`, `slip_ref`, `verified_by`, `verified_at`, `reject_reason`) → ถ้า `verified`: `transition(awaiting_payment→paid, actor system)` → คืน `{ status, reason? }` · `review` → `payments.status='pending_review'` (ลูกค้าเห็น "กำลังตรวจสอบสลิป") · `rejected` → `payments.status='rejected'` + notify `payment_rejected` และให้ส่งสลิปใหม่ได้ (จำกัด 5 ครั้ง/ออเดอร์)
- ทำเป็นการทำงานเดียวที่ **ไม่ทำให้ออเดอร์เป็น `paid` สองครั้ง** (ใช้ `transition` ซึ่งกันซ้ำอยู่แล้ว + ตรวจ payments สถานะ verified)
**ทำอะไร (UI — `PaymentPanel`):**
- props: `{ orderId, amountSatang, deadline, onVerified }` (ใช้ `Money`, `Button`, `Card` จาก Y1) · แสดงยอดที่ต้องจ่าย, QR (+ปุ่ม "บันทึกรูป QR" ถ้าทำได้), นับถอยหลัง, ขั้นตอน 1-2-3 สั้น ๆ ("สแกนจ่าย → แคปสลิป → อัปโหลดที่นี่")
- อัปโหลดสลิป (progress, พรีวิว, ลบแล้วเลือกใหม่) → เรียก API → แสดงผล: ผ่าน (✓ แล้วเรียก `onVerified`), กำลังตรวจสอบ, ไม่ผ่าน + เหตุผลไทย (ยอดไม่ตรง/สลิปซ้ำ/บัญชีไม่ตรง) + ลองใหม่
- poll `GET /api/liff/orders/:id` เมื่อสถานะ `pending_review` เพื่อรู้เมื่อแอดมินอนุมัติ
**เกณฑ์ผ่าน:** [ ] ยอดมาจากฝั่งเซิร์ฟเวอร์เท่านั้น (test: ส่งยอดปลอมมาก็ไม่มีผล) [ ] ลูกค้าอื่นเรียกออเดอร์ไม่ใช่ของตัวเอง → 404 [ ] สลิปซ้ำ → 409 [ ] verified → ออเดอร์เป็น `paid` ครั้งเดียว มี `settlements` 1 แถว [ ] `PaymentPanel` ใช้ได้บนจอ 360px และมี story ใน `/dev/ui` หรือหน้าทดสอบ
**ห้าม:** ให้ client ส่งยอด · ให้ client เปลี่ยนสถานะเป็น paid เอง

---

## A4 — Settlement (โอนให้ร้าน) + Refund (บันทึก)  ·  13 พ.ย.
**ไฟล์:** `src/lib/payment/{settlement.ts,refund.ts}`, `src/app/api/admin/{settlements,refunds}/**`
**ทำอะไร:**
- ตรวจว่า `transition(→paid)` ของพลุสร้าง `settlements`(pending) ถูกต้อง (`amount = print_subtotal_satang`) — ถ้าไม่ตรง แจ้งพลุ/ซี อย่าแก้ในโฟลเดอร์เขา
- `GET /api/admin/settlements?status=` (รวมกลุ่มตามร้านเป็นยอดค้างจ่าย + รายการออเดอร์), `POST …/:id/mark-paid { proofPath? }` (`pending→paid`, ตั้ง `paid_at`; เฉพาะออเดอร์ `completed` เท่านั้นที่โอนได้ ตามสัญญา CONTRACTS ข้อ 3) 
- `GET /api/admin/refunds`, `POST …/:id/mark-paid` (บันทึกว่าแอดมินโอนคืนแล้ว)
- ตัวเลขยอดสรุปคำนวณเป็นสตางค์จำนวนเต็ม
- รายการ settlement ที่แสดง/โอนได้ ต้อง join กับออเดอร์ที่ `status='completed'` เท่านั้น (ตาม CONTRACTS ข้อ 3: แถวของออเดอร์ `rejected`/`cancelled` ให้ข้าม ไม่ต้องสร้างสถานะใหม่)
- test: ยอดรวมต่อร้านถูก, mark-paid ซ้ำไม่ทำอะไรเพิ่ม, ออเดอร์ที่ถูกปฏิเสธ/ยกเลิกหลังจ่ายไม่เข้า settlement (เข้า refund แทน)
**เกณฑ์ผ่าน:** [ ] ออเดอร์ที่จ่ายแล้วถูกยกเลิก/ปฏิเสธ → เกิด refund และ settlement ของออเดอร์นั้นไม่ถูกโอน [ ] mark-paid ย้อนกลับไม่ได้ [ ] เฉพาะ admin เรียกได้
**ถามก่อนถ้า:** รอบการโอน (รายวัน/รายสัปดาห์) — default: แอดมินกดโอนทีละรายการ/ทีละร้านเอง

---

## A5 — Admin shell + อนุมัติร้าน  ·  12–13 พ.ย.
**เส้นทาง:** `/admin`, `/admin/shops` · **API:** `GET /api/admin/shops`, `POST …/:id/approve|suspend`
**ทำอะไร:**
- เลย์เอาต์แอดมิน (ใช้ `DashboardShell` ของยูริหรือสร้างชั้นง่าย ๆ ใหม่ใต้ `src/app/admin` ถ้า shell ยังไม่พร้อม), เมนู: ภาพรวม / ร้าน / การชำระเงินรอตรวจ / ออเดอร์ / โอนให้ร้าน / คืนเงิน
- หน้าร้าน: รายการทุกร้านพร้อมสถานะ `pending/active/suspended`, ปุ่มอนุมัติ/ระงับ (ยืนยันก่อน), ดูข้อมูลร้าน (ชื่อ ที่อยู่ เบอร์)
- ร้านสมัครเอง (D23): ร้านเข้า `/login` → กรอกข้อมูลที่ `/shop/onboarding` (ยูริ Y6 + `POST /api/shop/register` ของพลุ P7) → สถานะ `pending` → ปรากฏในหน้านี้ · **ไฮไลต์ร้าน `pending` ไว้บนสุด** พร้อมคำใบ้ "ยังไม่ตั้งราคา"/"ยังไม่ตั้งเวลาเปิด" ถ้ายังไม่ตั้ง (เพื่อไม่อนุมัติร้านที่ลูกค้าจะยังไม่เห็น) → แอดมินกด **อนุมัติ** (`pending→active`) หรือ **ระงับ** · ชื่อแท็บเบราว์เซอร์แสดงจำนวนรายการรอจัดการ (ร้านรออนุมัติ + สลิปรอตรวจ) เช่น "(3) PrintGo Admin" · สคริปต์สำหรับ dev/demo เท่านั้น (สร้างร้านตัวอย่างที่มีล็อกอิน): `npm run create-shop -- --email x --name "…"` (สร้าง `shops`+`profiles`) แล้วถามซีก่อนเพิ่มไฟล์นอกโฟลเดอร์
- ทุก route ใช้ `requireAdmin` · ตัวเรียก API ฝั่งหน้าจอแอดมินเขียนเองใน `src/app/admin/_lib/api.ts` (ไม่ต้องรอยูริ)
**เกณฑ์ผ่าน:** [ ] ร้านที่ถูกระงับไม่โผล่ในการค้นหาของลูกค้า (ตรวจกับ `searchShops` ของพลุ) [ ] ผู้ใช้ไม่ใช่แอดมินเข้า `/admin` ไม่ได้ (ทั้งหน้าและ API) [ ] มี test สิทธิ์

---

## A6 — Admin: ตรวจสลิป + ออเดอร์ที่มีปัญหา  ·  13–14 พ.ย.
**เส้นทาง:** `/admin/payments`, `/admin/orders`, `/admin/orders/[id]` · **API:** `GET /api/admin/payments?status=pending_review`, `POST /api/admin/payments/:id/approve|reject`, `POST /api/admin/payments/:id/refund`, `GET /api/admin/orders?status=&q=`, `GET /api/admin/orders/:id`, `POST /api/admin/orders/:id/cancel`, `POST /api/admin/orders/:id/complete`
**ทำอะไร:**
- คิวสลิปที่รอตรวจ: แสดงรูปสลิป (signed URL สั้น ๆ), ยอดที่ต้องจ่าย, เลขออเดอร์, เวลา · ปุ่ม **อนุมัติ** (→ `payments.verified_by='admin'` + `transition(→paid, actor admin)`), **ปฏิเสธ** (ต้องมีเหตุผล → notify `payment_rejected`) · กัน race: อนุมัติซ้ำไม่ทำสองครั้ง
- ก่อนอนุมัติ ตรวจซ้ำว่าออเดอร์ยัง `awaiting_payment` (ถ้า `expired` แล้ว → ต้องเตือนแอดมินและให้เลือก "คืนเงิน" แทน: `POST /api/admin/payments/:id/refund` สร้าง `refunds`)
- หน้าออเดอร์: ค้นหา (เลขออเดอร์/ชื่อร้าน), กรองสถานะ, ดูรายละเอียดทุกอย่าง, ไฮไลต์ออเดอร์ที่มีปัญหา (สลิปรอตรวจ, `courier_requested` ค้างนาน, ร้านไม่ตอบ)
- แอดมินยกเลิกออเดอร์ที่จ่ายแล้ว (จาก `paid|printing|ready|courier_requested|in_transit` ผ่าน `POST /api/admin/orders/:id/cancel { reason, refundSatang? }` → `transition` สร้าง refund คืนเต็มเป็นค่าเริ่มต้น แอดมินระบุน้อยกว่าได้ ห้ามเกินยอดที่ลูกค้าจ่าย) พร้อมเหตุผล · ปุ่ม **"ปิดงานเป็นเสร็จสิ้น"** (`POST /api/admin/orders/:id/complete { reason }`) สำหรับออเดอร์รับเองที่ค้าง `ready` (D26) · ไฮไลต์ออเดอร์ `ready` ค้างเกิน 24 ชม. และ `courier_requested`/`in_transit` ที่ค้างนาน
**เกณฑ์ผ่าน:** [ ] สลิปที่ `pending_review` อนุมัติแล้วออเดอร์เป็น `paid` และลูกค้าได้ข้อความ [ ] ปฏิเสธต้องมีเหตุผล [ ] ทุกการกระทำเรื่องเงินผ่าน `transition`/service เดียวกับ A3 (ไม่เขียน DB ซ้ำซ้อน) [ ] ยกเลิกแล้วระบุ refund น้อยกว่ายอดได้ แต่เกินไม่ได้ (test) [ ] ปิดงาน `ready` ได้เฉพาะออเดอร์รับเอง และ settlement ของออเดอร์นั้นโอนได้หลังปิด

---

## A7 — Admin: เรียกไรเดอร์ด้วยมือ + ภาพรวมตัวเลข  ·  14 พ.ย.
**เส้นทาง:** `/admin/deliveries` (หรือแท็บในหน้าออเดอร์) · **API:** `POST /api/admin/orders/:id/delivery`
**ทำอะไร:**
- คิว "รอเรียกไรเดอร์" (ออเดอร์ `courier_requested` ที่ `deliveries.status='pending_admin'`): แสดงที่อยู่ร้าน/ที่อยู่ปลายทาง/ชื่อ/เบอร์ผู้รับ (`deliveryRecipientName`/`deliveryRecipientPhone` คัดลอกง่าย) + **พิกัดปลายทาง** (`delivery_lat/lng`) เป็นปุ่ม "เปิดแผนที่" และ "คัดลอกพิกัด" (สร้างลิงก์แผนที่จากพิกัด — ตรวจรูปแบบลิงก์ปัจจุบันของบริการแผนที่ก่อน อย่าเดา) + ค่าส่งประมาณ → แอดมินไปเรียก Grab ในแอป/เว็บเอง แล้วกลับมากรอก: สถานะ (`booked` → `in_transit` → `delivered`/`failed`), ค่าส่งจริง (บาท→สตางค์), ลิงก์ติดตาม, หมายเหตุ
- API เรียก `applyDeliveryUpdate()` ของซี (Z7) ซึ่งอัปเดต `deliveries` และ `transition` ไป `in_transit`/`completed` + notify · ถ้า `failed` → แสดงให้แอดมินตัดสินใจ (เรียกใหม่ หรือคืนเงินด้วยปุ่มยกเลิกของ A6 — D26)
- ภาพรวม (ถ้ามีเวลา; `GET /api/admin/overview`): ออเดอร์วันนี้, อัตราสำเร็จ, รายได้ค่าบริการวันนี้/ทั้งหมด (รวมจาก `platform_fee_satang` ของออเดอร์ `completed`) — ตัวเลขเป็นสตางค์เสมอแล้วแปลงตอนแสดง
**เกณฑ์ผ่าน:** [ ] วงจร "ร้านกดพร้อม → ปรากฏในคิวแอดมิน → กรอกผล → ลูกค้าเห็นสถานะใน LINE → completed" ทำได้ [ ] ค่าส่งจริงที่แอดมินกรอกเก็บเป็นสตางค์ [ ] ตัวเลขภาพรวมตรงกับข้อมูลใน DB (ตรวจด้วย seed)
**ห้าม:** เขียนว่าเป็นการเชื่อม Grab API (ตอนนี้เป็นการกรอกมือ)

---

## A8 — หน้าตั้งค่าร้าน (`/shop/settings`)  ·  14–15 พ.ย.
**เส้นทาง:** `/shop/settings`, `/shop/settings/hours`, `/shop/settings/pricing`, `/shop/settings/services` (อยู่ใต้ `src/app/shop/settings/**` ของอาร์ม; ใช้ `DashboardShell`/คอมโพเนนต์ของยูริ)
**API ที่ใช้ (ของพลุ P7):** `GET/PUT /api/shop/{profile,hours,pricing}` และ `GET/POST /api/shop/services`, `PUT/DELETE /api/shop/services/:id`
**ทำอะไร:**
- **โปรไฟล์:** ชื่อร้าน, เบอร์, ที่อยู่, พิกัด (กรอก lat/lng + ปุ่ม "ใช้ตำแหน่งปัจจุบัน"), รับจัดส่งหรือไม่, `cutoffMinutes` (ตัดเวลาก่อนปิดกี่นาที), สวิตช์พักรับงาน
- **เวลาเปิด-ปิด:** 7 แถว (อา–ส) เวลาเปิด/ปิด + "ปิดทั้งวัน" + ปุ่ม "คัดลอกไปทุกวัน"; ตรวจ `ปิด > เปิด`
- **ราคา:** ตารางกติการาคาต่อหน้า (สี/ขาวดำ × A4/A3 × ด้านเดียว/สองด้าน = 8 ช่อง; ผู้ใช้กรอกเป็นบาท → สตางค์ที่ฟังก์ชันเดียว; ช่องว่าง = ไม่รับชุดนี้) + รายการ "ส่วนลดปริมาณ": เมื่อจำนวนหน้ารวม ≥ N ร้านจะกำหนดราคาเอง (เพิ่ม/ลบ tier) พร้อมคำอธิบายสั้น ๆ ว่าหมายความว่าอะไร
- **บริการเสริม (D22) `/shop/settings/services`:** ปุ่ม "+ เพิ่มบริการ" เปิดฟอร์ม: ชื่อบริการ (≤ 60), ปุ่มเติมชื่อตัวอย่าง (เย็บมุม, สันเกลียว, สันกาว, ปกใส, เคลือบ, เจาะรู — แค่เติมช่องชื่อ แก้ได้), ราคา (บาท → สตางค์ที่ฟังก์ชันเดียว), คิดแบบ "ต่อชุด"/"ต่อออเดอร์" (มีคำอธิบายสั้น ๆ), ช่องติ๊ก "ราคาตามตกลง (ร้านกรอกให้ตอนยืนยันราคา)" ซึ่งปิดช่องราคา · รายการของร้าน: สลับ เปิด/ปิดใช้งาน, แก้, ลบ (ยืนยันก่อน), จัดลำดับ (`sortOrder` ง่าย ๆ ปุ่มขึ้น/ลง) · เกิน 20 รายการแสดงข้อความไทยและซ่อนปุ่มเพิ่ม · มีตัวอย่างข้อความ "ลูกค้าจะเห็น: เข้าเล่มสันเกลียว ฿35/ชุด"
- บันทึกแล้วแสดง toast + ข้อผิดพลาด 422 รายช่อง
**เกณฑ์ผ่าน:** [ ] ร้านแก้ราคาแล้วลูกค้าเห็นผลใน estimate/shop list [ ] ร้านเพิ่ม/แก้/ปิด/ลบบริการได้ และลูกค้าเห็นการเปลี่ยนแปลงในการ์ดร้าน [ ] "ราคาตามตกลง" ไม่ส่งราคาไปให้ลูกค้า [ ] ข้อมูลผิดรูปแบบถูกปฏิเสธพร้อมข้อความไทย [ ] ไม่มี float ในการแปลงบาท↔สตางค์ (ใช้ `Math.round(baht*100)` ตรวจรูปแบบอินพุตก่อน หรือแยกส่วนจำนวนเต็ม/ทศนิยมแล้วประกอบ + test) [ ] ใช้ได้ที่จอ 1024px+
**ถามก่อนถ้า:** อยากให้ร้านอัปโหลดโลโก้/รูปร้าน (default: ไม่ทำ)
