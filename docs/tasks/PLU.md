# งานของพลุ (สุวรรณชัย) — Backend (ตรรกะหลัก)

อ่าน `CLAUDE.md`, `docs/CONTRACTS.md`, `DECISIONS.md` ก่อนทุก task · ถามก่อนทำตามโปรโตคอลใน `CLAUDE.md` ข้อ 1
โฟลเดอร์ของพลุ: `src/lib/domain/**`, `src/app/api/liff/**`, `src/app/api/shop/**`, `src/app/api/cron/**`, `docs/API.md`
สิ่งที่พลุเรียกใช้ของคนอื่น: `requireCustomer/requireShop` (ซี, มี stub ตั้งแต่ Z1), `notify()` และ `notifyShop()` (ซี, no-op ก่อน), types จาก `src/lib/db/types.ts` (ซี, Z2), `quoteDelivery()` (ซี, Z7)
**ก่อน Z2 เสร็จ** (10 พ.ย.): ใช้ type ที่ประกาศในไฟล์ของตัวเองให้ตรง CONTRACTS ไปก่อน แล้วเปลี่ยนมา import จาก `db/types` ทันทีที่ Z2 เสร็จ

---

## P1 — Pricing engine (ฟังก์ชันบริสุทธิ์ + test)  ·  9–10 พ.ย.
**เป้าหมาย:** คำนวณราคาถูกต้อง 100% และไม่แตะ DB (เพื่อให้ test ง่ายและอาร์ม/ยูริใช้ซ้ำได้)
**ไฟล์:** `src/lib/domain/pricing/{index.ts,estimate.ts,fee.ts,format.ts,pricing.test.ts}`
**ทำอะไร:**
- `estimate(input)` ตามสูตรใน CONTRACTS ข้อ 5:
  - ต่อไฟล์: `pagesForFile = pageCount × copies`; หาราคาต่อหน้าจาก `rules` ที่ตรง `(color, paper, sides)`; ไม่พบกติกา → โยน `ApiError('VALIDATION_ERROR', 422, 'ร้านนี้ไม่รับงานชุดค่านี้')` ระบุไฟล์ที่ไม่รองรับใน `details`
  - รวม `totalPages` ทุกไฟล์; `requiresManualPrice = tiers.some(t => totalPages >= t.minPages)`
  - คืน `{ requiresManualPrice, estimatedPrintSatang, servicesEstimateSatang, serviceLines, totalPages, perFile:[{filePrice, pages}] }`; ถ้า manual ให้ `estimatedPrintSatang` ยังคำนวณได้เป็น "ค่าเริ่มต้นให้ร้านดู" แต่ **ฟิลด์ที่ส่งให้ลูกค้า** (ใน `/estimate` ของ P5) ต้องเป็น null — แยกเป็นสองฟังก์ชัน/ฟิลด์ชัดเจน (`estimatedPrintSatang` ภายใน vs `customerVisible`)
- **บริการเสริม (D22):** `estimate` รับ `shopServices` + `selectedServices` → สร้าง `serviceLines` (`per_set`: ราคา × `copies` ของแต่ละไฟล์ที่เลือก, `fileIndexes` ไม่ส่ง = ทุกไฟล์; `per_order`: ราคา × 1) · บริการที่ `price=null` → `requiresManualPrice=true` และไม่นับเข้ายอด · ตรวจ `serviceId` ไม่ซ้ำ/ไม่อยู่ในรายการ → `VALIDATION_ERROR` · `fileIndexes` เกินช่วง → error · `servicesEstimate` เป็นจำนวนเต็ม · ฟิลด์ที่ส่งให้ลูกค้า: ถ้า `requiresManual` ให้ `unitPriceSatang`/`lineTotalSatang`/ยอดเป็น null (ตามกฎเดิม)
- `calculateTotals({ printSubtotalSatang, deliveryFeeSatang, feeRate })` → `platformFeeSatang = Math.max(300, Math.ceil(feeRate × printSubtotalSatang))`, `totalSatang = print + fee + delivery` · ระวังเลขทศนิยมลอย (เช่น `0.05 * 12000`): คำนวณด้วยจำนวนเต็ม (เช่น `ceil(printSubtotal × rateBasisPoints / 10000)` โดยแปลง rate เป็น basis points `Math.round(rate × 10000)`)
- `formatBaht(satang)` → `"22.00"`, `"1,250.50"`; ติดลบ/ไม่ใช่จำนวนเต็ม → throw
- ค่าคงที่/ตัวอ่าน env: `getFeeRate()` อ่าน `PLATFORM_FEE_RATE` (default 0.05; validate 0–1)
**test (Vitest) ต้องมี:**
- ตัวอย่างสมมติ: 2200 → fee 300 · 12000 → 600 · 60000 → 3000
- ขอบเขต: ยอดที่ 5% = 299 และ 300 และ 301 สตางค์ (ตรวจขั้นต่ำ 300 และ ceil) เช่น printSubtotal 5981 → ceil(299.05)=300; 6001 → 301
- 1 สตางค์, 0 หน้า (ต้อง error), copies > 1, หลายไฟล์ต่างโหมด, tier ตรง `minPages` พอดี / ต่ำกว่า 1 หน้า, ชุดที่ไม่มีกติกา
- `formatBaht(0)`, `(5)` → "0.05", `(100000000)`
- บริการเสริม: ปริ้น 12000 + เข้าเล่ม 2 ชุด × 3500 = 19000 → fee 950, total 19950 · `per_order` คิดครั้งเดียวแม้หลายไฟล์ · บริการ null → manual · `fileIndexes` เลือกบางไฟล์ · บริการซ้ำ/ไม่มีในร้าน → error · ไม่เลือกบริการ → ผลเท่าเดิมทุกกรณีของ test เดิม
**เกณฑ์ผ่าน:** [ ] test ผ่านทั้งหมด [ ] ไม่มี `number` ทศนิยมในผลลัพธ์เงิน [ ] ไม่ import DB/Next ในโฟลเดอร์ pricing (grep ยืนยัน)
**ห้าม:** เปลี่ยนสูตร/ขั้นต่ำ (ตัดสินแล้วใน DECISIONS D14: 5%, ขั้นต่ำ 300 สตางค์ ถ้าจะเปลี่ยนต้องถามซี)
**ถามก่อนถ้า:** สองไฟล์ในออเดอร์เดียวต้องนับส่วนลดแบบรวมหรือแยก (default: รวมทั้งออเดอร์ตาม CONTRACTS)

---

## P2 — State machine `transition()`  ·  10–11 พ.ย. (**คอขวด: เสร็จ 11 พ.ย.**)
**เป้าหมาย:** จุดเดียวที่เปลี่ยนสถานะออเดอร์ ปลอดภัยต่อการกดซ้ำ/แข่งกัน
**ไฟล์:** `src/lib/domain/orders/{transition.ts,rules.ts,transition.test.ts}`
**ทำอะไร:**
- `rules.ts`: ตาราง transition ตาม CONTRACTS ข้อ 4 (จาก, ไป, actor ที่ทำได้, ผลข้างเคียง) เป็นข้อมูล ไม่ใช่ if ซ้อน
- `transition({ orderId, from, to, actor, patch })`:
  1. ตรวจว่า `(from→to, actor)` อยู่ในตาราง ไม่งั้น `ApiError('ORDER_INVALID_TRANSITION',409)` · `→awaiting_payment` ต้องมี `ready_in_minutes` หรือ `estimated_ready_at` (อย่างใดอย่างหนึ่ง) ใน `patch` ไม่งั้น `VALIDATION_ERROR` (D19) · `→paid` ทำได้โดย actor `system` หรือ `admin`
  2. อัปเดตแบบเงื่อนไขอะตอมมิก `update orders set status=to, updated_at=now(), …patch where id=$id and status = ANY($from) returning *` ไม่มีแถว → 409 (อ่านออเดอร์เพื่อบอกสถานะปัจจุบันใน `details`)
  3. ผลข้างเคียงตามขั้น: `→awaiting_payment` ตั้ง `payment_deadline = now + PAYMENT_WINDOW_MINUTES`; `→paid` ตั้ง `paid_at` (ถ้า `ready_in_minutes` มีค่า ตั้ง `estimated_ready_at = paid_at + ready_in_minutes`), สร้าง `pickup_code` ตัวเลข 4 หลัก 1000–9999 (D25; สุ่มปลอดภัย `crypto.randomInt`; ไม่ซ้ำกับออเดอร์ที่ยังไม่จบของร้านเดียวกัน ลองใหม่ได้สูงสุด 20 ครั้ง ถ้ายังชนให้ขยายเป็น 5 หลัก; จำนวนหลักเป็นค่าคงที่ตัวเดียว), สร้างแถว `settlements`(pending, `amount = print_subtotal_satang`); `→completed` ตั้ง `completed_at`; `→rejected` (ร้าน จาก `paid`/`printing`) และ `→cancelled` (แอดมิน จาก `paid`/`printing`/`ready`/`courier_requested`/`in_transit`) สร้าง `refunds`(pending, `amount = refundSatang ?? total_satang`, ตรวจ `0 < amount ≤ total_satang`); `→courier_requested` เรียก `createDeliveryForOrder` (ของซี)
  4. หลังอัปเดตสำเร็จ เรียก `notify(orderId, event)` ตามตาราง (try/catch: notify พังต้องไม่ทำให้ transition พัง)
  - ผลข้างเคียงที่เขียน DB หลายอย่าง (settlements/refunds) ต้องไม่ทิ้งสถานะครึ่งทาง: ใช้ฟังก์ชัน SQL (RPC) หรือทรานแซกชัน ถ้าทำไม่ได้ ให้ทำให้ idempotent (insert … on conflict do nothing) และบอกซี
- test ที่ใช้ DB จริงของโปรเจกต์ dev หรือ fake client ที่จำลอง condition: ต้องมี **ทดสอบแข่งกัน** (เรียกสองครั้งพร้อมกัน ผ่านครั้งเดียว), ข้ามขั้น, actor ผิด (ลูกค้าพยายาม `printing→ready`), จาก terminal state, `→paid` สร้าง pickup_code/settlement ครั้งเดียว
**เกณฑ์ผ่าน:** [ ] ทุกแถวในตาราง CONTRACTS ข้อ 4 มี test อย่างน้อย 1 case [ ] เรียกซ้ำสองครั้ง → ครั้งที่ 2 ได้ 409 และไม่มีผลข้างเคียงซ้ำ [ ] ไม่มีโค้ดอื่นนอก `transition.ts` เขียน `status` (grep) [ ] `pickup_code` ไม่ถูกส่งออกจาก log
**ห้าม:** ให้ route อื่นอัปเดต `orders.status` เอง · เปลี่ยนตารางสถานะ (ถามซี)
**ถามก่อนถ้า:** ผลข้างเคียงใดไม่มีในตาราง · ต้องการสถานะ/transition เพิ่ม

---

## P3 — ค้นหาร้าน (ระยะ + เปิด/ปิด)  ·  11 พ.ย.
**ไฟล์:** `src/lib/domain/shops/{distance.ts,hours.ts,search.ts,*.test.ts}` · route `GET /api/liff/shops`
**ทำอะไร:**
- `haversineKm(a,b)` (ปัดแสดง 1 ตำแหน่งที่ชั้น API เท่านั้น) · test กับพิกัดที่รู้ระยะ
- `isShopOpen(shop, hours, now)`: ใช้เวลา `Asia/Bangkok` เสมอ (อย่าใช้เวลาของเซิร์ฟเวอร์), วันของสัปดาห์ 0=อาทิตย์, `is_closed` วันนั้น = ปิด, `is_paused` = ไม่รับงาน, **ตัดเวลาก่อนปิด**: เปิดไม่ถึง `cutoff_minutes` ก่อน `close_time` ถือว่า "ใกล้ปิด ไม่รับงานใหม่" (`isOpen=false`) · คืน `{ isOpen, opensAt, closesAt }` (สตริง "HH:mm" ของวันนี้ หรือเวลาเปิดครั้งถัดไป)
- `searchShops({lat,lng,now})`: ร้าน `status='active'` **และมี `shop_pricing_rules` อย่างน้อย 1 แถว** เท่านั้น (D23), คำนวณระยะ, `startingPriceSatang` = ราคาต่อหน้าต่ำสุดของร้าน, เรียงใกล้→ไกล (เสมอกันเรียงตามชื่อ), ร้านปิด/พักยังแสดง แต่ `isOpen=false` (ลูกค้าเห็นว่าปิดอยู่) 
- ผลลัพธ์แต่ละร้านมี `services` (เฉพาะ `is_active` เรียงตาม `sort_order`) ตาม CONTRACTS 6.1 · **ไม่ทำฟิลเตอร์ร้านตามบริการ** (ฟีเจอร์อนาคต D22)
- route ตาม CONTRACTS 6.1 · validate `lat/lng` ด้วย Zod (ส่งทั้งคู่หรือไม่ส่งเลย; ไม่ส่ง → `distanceKm=null` เรียงตามชื่อ) · ต้องเรียก `requireCustomer`
- test: ก่อน/หลังเวลาเปิด, ตรง cutoff พอดี, ร้านพัก, วันหยุด, ร้านไม่มี `shop_hours` วันนั้น (ถือว่าปิด), คนละ timezone (ใช้ `now` ที่ฉีดเข้ามา)
**เกณฑ์ผ่าน:** [ ] ผลตรง CONTRACTS 6.1 ทุก field [ ] ร้าน `pending/suspended` ไม่โผล่ [ ] ร้านที่ยังไม่ตั้งราคาไม่โผล่ [ ] test เวลา/เส้นขอบผ่าน
**ถามก่อนถ้า:** ร้านที่ไกลเกินระยะหนึ่งควรซ่อนไหม (default: ไม่ซ่อน แสดงระยะ)

---

## P4 — ไฟล์: อัปโหลด/ดาวน์โหลด/ลบ  ·  11–12 พ.ย.
**ไฟล์:** `src/lib/domain/files/*` · routes `POST /api/liff/uploads/sign`, `GET /api/shop/orders/:id/files/:fileId/url`, `POST /api/cron/cleanup-files`
**ทำอะไร:**
- `sign`: ตรวจจำนวนไฟล์ ≤ 10, ขนาด ≤ 20 MB, mime ∈ `application/pdf|image/jpeg|image/png` · สร้างพาธ `order-files/{tempFolder}/{uuid}-{sanitizedName}` — เนื่องจากยังไม่มี orderId ให้ใช้โฟลเดอร์ชั่วคราวของลูกค้า `pending/{customerId}/{uuid}-…` แล้ว **ตอนสร้างออเดอร์ (P5) ย้ายไฟล์เข้า `{orderId}/`** · คืน signed upload URL ของ Supabase Storage (`createSignedUploadUrl`)
- sanitize ชื่อ: ตัด path, อักขระควบคุม, จำกัดความยาว, เก็บนามสกุล; `originalName` เก็บใน DB แยก
- ร้านเปิด/โหลดไฟล์ (D20): ตรวจว่า order เป็นของร้านผู้เรียก (`requireShop`) → signed URL อายุ 300 วินาที · `?mode=view` (default) = เปิดในเบราว์เซอร์ (inline), `?mode=download` = ดาวน์โหลด (ตรวจเอกสาร Supabase `createSignedUrl` ปัจจุบันว่าตั้ง `download` อย่างไร อย่าเดา); ไฟล์ที่ `deleted_at` ไม่ใช่ null → 404
- cleanup: หาออเดอร์ terminal (`completed|rejected|cancelled|expired`) ที่ `updated_at` เกิน 7 วัน (O7) + ไฟล์ `pending/…` ที่เก่ากว่า 24 ชม. → ลบออกจาก Storage แล้วตั้ง `deleted_at` · ป้องกัน route ด้วย `CRON_SECRET` · รันซ้ำได้ปลอดภัย
- test: sanitize (`../../etc/passwd`, ชื่อไทย, ยาวมาก), ชนิดไฟล์ผิด, ขนาดเกิน, ร้านอื่นขอไฟล์ → 404/403
**เกณฑ์ผ่าน:** [ ] ลูกค้าอัปโหลดผ่าน signed URL ได้จริงบน Supabase dev [ ] ไม่มี public URL ที่ไหนเลย [ ] ร้านอื่นดึงไฟล์ไม่ได้ [ ] cleanup ลบจริงและไม่แตะไฟล์ออเดอร์ที่ยังไม่จบ
**ห้าม:** ตั้ง bucket เป็น public · ส่งไฟล์ผ่าน body ของ API (ใช้ signed URL ตรงเข้า Storage เสมอ)
**ถามก่อนถ้า:** ต้องสแกนไวรัส/ตรวจเนื้อหาไฟล์ (default: ไม่ทำ)

---

## P5 — API ลูกค้า (estimate, สร้างออเดอร์, ดู, ยกเลิก)  ·  12 พ.ย.
**ไฟล์:** `src/app/api/liff/{estimate,orders,orders/[id]/...}/route.ts` + `src/lib/domain/orders/create.ts`
**ทำอะไร:**
- `POST /estimate`: ดึง rules/tiers ของร้าน → `estimate()` (P1) → ถ้า delivery เรียก `quoteDelivery` โดยใช้ `deliveryLat/Lng` จาก request (ไม่มี → 422) (ซี, ถ้ายังไม่พร้อมใช้ค่า `DELIVERY_BASE_SATANG` ตรง ๆ แล้วแจ้ง) → คืนตาม CONTRACTS 6.1 (ถ้า `requiresManualPrice` ฟิลด์ราคาที่ขึ้นกับร้านเป็น null)
- `POST /orders`: Zod validate → ตรวจร้าน `active`, ไม่พัก, `isShopOpen` (ไม่งั้น `SHOP_CLOSED`/`SHOP_PAUSED`), ร้านรับ delivery ถ้าเลือก delivery (ต้องมีที่อยู่/พิกัด) → ตรวจพาธไฟล์ว่าเป็นของลูกค้านี้ (`pending/{customerId}/…`) → ย้ายไฟล์เข้า `{orderId}/` → สร้าง `orders` + `order_files` (ในทรานแซกชัน/RPC เดียว) ด้วย `status='submitted'`, `response_deadline = now + SHOP_RESPONSE_MINUTES`, `estimated_print_satang`, `requires_manual_price`, `delivery_fee_satang` (จาก `quoteDelivery`), `delivery_recipient_*`
- **บริการเสริม (D22):** `estimate` และ `POST /orders` รับ `services` · โหลด `shop_services` ของร้านจาก DB เอง (ต้องเป็นของร้านที่เลือกและ `is_active`; **ห้ามเชื่อชื่อ/ราคาจาก request**) → สร้าง `order_services` เป็น snapshot ในทรานแซกชัน/RPC เดียวกับออเดอร์ (`per_set` หนึ่งแถวต่อไฟล์, `quantity=copies`; `per_order` หนึ่งแถว) → ตั้ง `estimated_services_satang` และ `requires_manual_price` (ถ้ามีบริการราคา null) · test: บริการของร้านอื่น → 422, ปิดใช้งานแล้ว → 422, ส่งราคามาเองไม่มีผล, ร้านแก้ราคาบริการทีหลังไม่กระทบออเดอร์เก่า
- หลังสร้างออเดอร์สำเร็จ เรียก `notifyShop(shopId,'order_new',{orderId,orderNo})` (ของซี, Z12; ก่อนซีทำเสร็จเป็น no-op) · try/catch: พังต้องไม่ทำให้สร้างออเดอร์ล้ม
- ฟิลด์ใหม่ตาม CONTRACTS: รับ/ตรวจ `deliveryRecipientName/Phone` (บังคับเมื่อ delivery, เบอร์ไทยรูปแบบพื้นฐาน) · `unreadMessageCount` ใน `Order` ให้คืน 0 ไปก่อนจน P8 เสร็จ แล้วใช้ฟังก์ชันของ P8 · `OrderDetail` ที่คืนให้ **ร้าน** ต้องไม่มี `deliveryRecipient*`
- ผลที่ส่งให้ลูกค้า: ถ้า `requires_manual_price` และสถานะ `submitted` → `estimatedPrintSatang`/`estimatedServicesSatang` เป็น null (CLAUDE.md ข้อ 3.7 · หมายเหตุใน CONTRACTS 6.6)
- `GET /orders` (ของฉัน), `GET /orders/:id` (`OrderDetail`; `pickupCode` ส่งเฉพาะเจ้าของออเดอร์ เมื่อ `fulfillment=pickup` และสถานะ `paid|printing|ready`), `POST /orders/:id/cancel` (ใช้ `transition`, actor customer)
- **lazy-expiry**: ก่อนคืนออเดอร์ทุกครั้ง เรียก `expireIfDue(order)` (P9) 
- ค่าที่ client ส่งมา **ห้ามเชื่อ**: ราคา/ยอด/สถานะ คำนวณเองฝั่งเซิร์ฟเวอร์เสมอ
- test: สั่งสำเร็จ, ร้านปิด, ไฟล์ของคนอื่น, ส่วนลดทำให้ manual, ลูกค้า A ดูออเดอร์ลูกค้า B → 404
**เกณฑ์ผ่าน:** [ ] ทุก endpoint ตรง CONTRACTS 6.1/6.6 [ ] สิทธิ์ผ่านการทดสอบ [ ] ไม่เชื่อค่าเงินจาก request [ ] สร้างออเดอร์พังกลางทางไม่ทิ้งแถวครึ่งเดียว
**ถามก่อนถ้า:** ลูกค้าควรสั่งซ้ำที่ร้านเดียวกันได้กี่ออเดอร์พร้อมกัน (default: ไม่จำกัด)

---

## P6 — API ร้าน (คิว, ยืนยัน, ปฏิเสธ, ปริ้น, เสร็จ)  ·  12–13 พ.ย.
**ไฟล์:** `src/app/api/shop/orders/**`
**ทำอะไร:**
- `GET /orders?status=`: เฉพาะ `shop_id` ของผู้เรียก, เรียงใหม่→เก่า (งานรอยืนยันขึ้นก่อน), `expireIfDue` ก่อนคืน
- `GET /orders/:id` (`OrderDetail`, ไม่มี `pickupCode`, ไม่มี `deliveryRecipient*`, **มี `services`**)
- `confirm` (ราคา): ถ้า `requires_manual_price` ต้องมี `printSubtotalSatang` > 0 ไม่งั้น `MANUAL_PRICE_REQUIRED` · ถ้าร้านส่งราคามาเองกรณีไม่ manual = แก้ราคา (อนุญาต) · คำนวณ fee/total ด้วย `calculateTotals` + ค่าส่ง (จาก `delivery_fee_satang` ที่ลูกค้าเห็นตอนสั่ง; ถ้ายังไม่เคยมีให้ quote ใหม่) → `transition(submitted→awaiting_payment, actor shop, patch)` · `printSubtotal` = ราคาที่ร้านส่งมา (รวมบริการเสริม) หรือถ้าไม่ส่งและไม่ manual = `estimated_print_satang + estimated_services_satang` · `requires_manual_price` รวมกรณีมีบริการเสริมราคา null (D22)
- `confirm` (เวลาเสร็จ, D19): **ต้องมี `readyInMinutes` (5–2880) หรือ `estimatedReadyAt` (อนาคต) อย่างใดอย่างหนึ่งเท่านั้น** ไม่งั้น `VALIDATION_ERROR` พร้อมข้อความไทย · `readyNote` ≤ 200 · ส่งเป็น `patch` ของ `transition` (ห้ามเขียนเอง) · เวลานอกเวลาเปิดร้านแค่ปล่อยผ่าน (ไม่บล็อก)
- `POST /api/shop/orders/:id/eta` (D19): เฉพาะ `paid`/`printing` ของร้านตัวเอง · `estimatedReadyAt` ต้องอยู่ในอนาคต · อัปเดต `estimated_ready_at`/`ready_note` (ไม่ใช่การเปลี่ยนสถานะจึงไม่ผ่าน `transition` แต่ต้อง update แบบมีเงื่อนไข `status in (paid,printing)`) → `notify(orderId,'eta_changed')` + สร้างข้อความ `system` ในแชท (try/catch) · ลูกค้า**ไม่มี**สิทธิ์ยกเลิกจากการเลื่อน
  - test: ไม่ส่งเวลา → 422, ส่งสองแบบพร้อมกัน → 422, ย้อนอดีต → 422, ร้านอื่นแก้ไม่ได้, สถานะ `ready`/`completed` แก้ไม่ได้, `ready_in_minutes` แปลงเป็นเวลาจริงตอน paid ถูกต้อง
- `reject {reason}` (ความยาว 3–300): `submitted→rejected` หรือ `paid|printing→rejected` (กรณีไฟล์เปิดไม่ได้หลังจ่าย; ผลข้างเคียงตาม P2)
- `start-printing` (`paid→printing`), `mark-ready` (`printing→ready`; ถ้าเป็น delivery ต่อด้วยการเรียก `transition(ready→courier_requested)` อัตโนมัติทันที โดย actor system เพื่อให้แอดมินเห็นงานเรียกไรเดอร์), `complete {pickupCode}` (normalize: ตัดช่องว่าง; ตรงกับ `pickup_code` และ fulfillment=pickup → `ready→completed`; รหัสผิด → 422 + จำกัดจำนวนครั้ง 5 ครั้ง/ออเดอร์/10 นาที → เกินคืน `RATE_LIMITED`) · ห้ามส่งรหัสกลับในผลตอบกลับหรือ log
- ทุก route: `requireShop` และตรวจว่า order.shop_id = shopId (ไม่งั้น 404 — ไม่บอกว่ามีอยู่)
- test: ร้านอื่นแตะออเดอร์ → 404, ยืนยันซ้ำ → 409, manual price ไม่ส่งราคา → `MANUAL_PRICE_REQUIRED`, รหัสรับงานผิด/ถูก, ปฏิเสธไม่มีเหตุผล → 422
**เกณฑ์ผ่าน:** [ ] ทุก endpoint ตรง CONTRACTS 6.2 [ ] ทุก transition ผ่าน `transition()` เท่านั้น [ ] ข้ามร้านไม่ได้ [ ] manual price บังคับได้จริง
**ถามก่อนถ้า:** ร้านควรยืนยันราคาต่ำกว่า/สูงกว่าประเมินได้ไม่จำกัดหรือมีเพดาน (default: ไม่จำกัด ตั้งแต่ 1 สตางค์ถึง 100,000 บาท)

---

## P7 — API สมัครร้าน/โปรไฟล์/เวลาเปิด/ราคา/บริการเสริม ของร้าน  ·  13 พ.ย.
**ไฟล์:** `src/app/api/shop/{me,register,profile,hours,pricing,services}/route.ts`
**ทำอะไร:** `GET/PUT` ตาม CONTRACTS 6.2 · validate ด้วย Zod: `lat -90..90`, `lng -180..180`, `closeTime > openTime`, `weekday 0..6` ครบ 7 รายการ ไม่ซ้ำ, ราคา/หน้า > 0 และไม่เกินเหตุผล (≤ 10,000 สตางค์/หน้า), `minPages ≥ 1` ไม่ซ้ำ · PUT pricing/hours แทนที่ทั้งชุดแบบอะตอมมิก · ร้านแก้ได้เฉพาะของตัวเอง (`shopId` มาจาก session ไม่ใช่ body) · ร้านแก้ `status` ไม่ได้
**สมัครร้าน (D23):** `GET /api/shop/me` → `ShopMe` (`no_profile` ถ้ายังไม่มี profile) · `POST /api/shop/register` ใช้ `requireAuthUser`: Zod `name` 1–80, `phone` เบอร์ไทย 9–10 หลัก, `address` 1–300, `lat/lng` ช่วงถูกต้อง, `acceptsDelivery` bool → สร้าง `shops` (`status='pending'`) + `profiles` (`role='shop'`, `shop_id`) ในทรานแซกชัน/RPC เดียว · หนึ่ง `auth_user_id` หนึ่งร้าน ซ้ำ → `ALREADY_REGISTERED` (409) · **ไม่สร้างราคา/เวลาเปิดให้อัตโนมัติ** · `profile`/`hours`/`pricing`/`services`/`push/*` ใช้ `requireShop(req,{allowPending:true})` ส่วน orders/chats ใช้ `requireShop(req)` ปกติ
**บริการเสริม (D22):** `GET/POST /api/shop/services`, `PUT/DELETE /api/shop/services/:id` ตาม CONTRACTS 6.2 · Zod: `name` trim 1–60, `priceSatang` null หรือจำนวนเต็ม 1..1,000,000, `unit` ∈ `per_set|per_order` · **ไม่เกิน 20 รายการต่อร้าน** → 422 ข้อความไทย · `shopId` มาจาก session เท่านั้น · แก้/ลบของร้านอื่น → 404 · ลบจริงได้ (ออเดอร์เก่าเก็บ snapshot)
**เกณฑ์ผ่าน:** [ ] ข้อมูลผิดโดน 422 พร้อมข้อความไทย [ ] ใช้ผลใน `searchShops`/`estimate` ได้ทันที [ ] test สิทธิ์ [ ] ร้านสร้าง 21 รายการไม่ได้ (test) [ ] สมัครซ้ำด้วยบัญชีเดิม → 409 (test) [ ] ร้าน `pending` ตั้งราคาได้แต่ไม่โผล่ในรายการลูกค้า และเรียก API ออเดอร์ไม่ได้ (test) [ ] ผู้ใช้ที่ไม่ใช่ร้านเรียก `register` ได้ แต่เรียก `profile` ไม่ได้ (test) [ ] บริการที่ปิดใช้งานไม่โผล่ในรายการของลูกค้า

---

## P8 — แชทผูกออเดอร์  ·  14 พ.ย.
**ไฟล์:** `src/lib/domain/chat/*`, `src/app/api/{liff,shop}/orders/[id]/messages/route.ts`
**ทำอะไร (ตาม D15/D16 และ CONTRACTS ข้อ 6–7):**
- `GET ?after=` (ใหม่กว่าเวลา, สูงสุด 100) / `POST {body}` · ลูกค้าส่ง → `sender='customer'`, ร้านส่ง → `'shop'` · จำกัด 1,000 ตัวอักษร, trim, ไม่ว่าง, rate limit (เช่น 20 ข้อความ/นาที/ออเดอร์ → `RATE_LIMITED`)
- **ห้องปิดเมื่อออเดอร์อยู่สถานะปลายทาง** (`completed|rejected|cancelled|expired`) → `POST` คืน `CHAT_CLOSED` ทันที (ไม่มีช่วงผ่อนผัน 24 ชม. แล้ว) · `GET` ยังอ่านย้อนหลังได้ · ตรวจสิทธิ์ว่าเป็นลูกค้า/ร้านของออเดอร์นั้นก่อนทุกครั้ง
- `POST …/messages/read`: ตั้ง `read_at` ให้ข้อความของ **อีกฝ่าย** ที่ยังไม่อ่านในออเดอร์นั้น (ฝั่งลูกค้า → ข้อความจากร้าน, ฝั่งร้าน → ข้อความจากลูกค้า) คืน `{ unreadMessageCount: 0 }` · ข้อความ `system` ไม่นับ unread
- `GET /api/liff/chats` และ `GET /api/shop/chats`: รายการห้อง + `unreadMessageCount` ต่อห้อง + `totalUnread` (query เดียว ไม่ใช่ N+1)
- เพิ่ม `unreadMessageCount` ใน `Order` ที่คืนจาก `GET /orders` ทุกตัว
- เมื่อร้านส่ง: เรียก `notify(orderId,'chat_message')` **เฉพาะเมื่อไม่มีข้อความร้านก่อนหน้าที่ยังไม่อ่านค้างอยู่** (ไม่ push ซ้ำทุกข้อความ) · ฝั่งร้านไม่ต้อง push (หน้า dashboard poll)
- เมื่อ **ลูกค้า** ส่ง: เรียก `notifyShop(shopId,'chat_message',…)` ด้วยกติกาเดียวกัน (ไม่แจ้งซ้ำเมื่อยังมีข้อความลูกค้าที่ร้านยังไม่อ่านค้าง)
- `POST /api/shop/push/subscribe|unsubscribe` (upsert/ลบ `push_subscriptions` ตาม `endpoint`, ผูกกับ `shopId` ของผู้เรียก, ตรวจรูปแบบด้วย Zod)
- ข้อความระบบ (`system`) สร้างได้จาก `transition` (เช่น "ร้านยืนยันราคาแล้ว") เป็นตัวเลือก
- test เพิ่มเติม: ข้อความยาวเกิน, rate limit, `after` ถูกต้อง
**เกณฑ์ผ่าน:** [ ] ห้องออเดอร์ terminal ส่งไม่ได้ (test) [ ] คนนอกออเดอร์อ่าน/ส่งไม่ได้ (test) [ ] unread นับถูกทั้งสองฝั่ง และ `read` ล้างเฉพาะของอีกฝ่าย (test) [ ] ร้านส่ง 3 ข้อความติดกัน → `notify` ถูกเรียกครั้งเดียว (test) [ ] ข้อความ HTML/สคริปต์ถูกเก็บเป็นข้อความดิบ [ ] subscribe ของร้าน A ไม่ผูกกับร้าน B (test) [ ] สองฝั่งเห็นข้อความของกันและกัน [ ] ลูกค้าได้ LINE เมื่อร้านตอบ (ทดสอบกับบัญชีจริง บอกผล) [ ] ไม่รั่วข้ามออเดอร์
**ถามก่อนถ้า:** อยากเพิ่มรูป/ไฟล์ในแชท (default: ไม่ทำ) หรือเปลี่ยนไปใช้ Realtime/WebSocket (D15 ตัดสินแล้วว่า polling)

---

## P9 — หมดเวลา (lazy-expiry + cron)  ·  14 พ.ย.
**ไฟล์:** `src/lib/domain/orders/expire.ts`, `src/app/api/cron/expire-orders/route.ts`
**ทำอะไร:**
- `expireIfDue(order)`: `submitted` และ `now > response_deadline` → `transition(→expired, system)`; `awaiting_payment` และ `now > payment_deadline` → `expired` · คืนออเดอร์ล่าสุด
- `POST /api/cron/expire-orders` กวาดทุกออเดอร์ที่เลยกำหนด (ป้องกันด้วย `CRON_SECRET`) · วิธีเรียกตามเวลา: ตรวจแล้ว (10 พ.ย.) Vercel Hobby รัน cron ได้วันละครั้งเท่านั้น → ใช้ **lazy-expiry เป็นหลัก** (ทุก endpoint อ่านออเดอร์เรียก `expireIfDue`; dashboard ร้านโพลทุก 5–8 วิจึงเรียกให้เอง) + cron รายวันเป็นตัวกวาดสำรอง · ข้อจำกัดที่ต้องรู้: ถ้าไม่มีใครเปิดดูออเดอร์เลย ลูกค้าจะได้ข้อความ `order_expired` ช้าจนกว่า cron รอบถัดไป (ยอมรับ ไม่ต้องหาตัวตั้งเวลาถี่)
- test: เลยกำหนดพอดี/ก่อนกำหนด, เรียกซ้ำ, ออเดอร์ที่ร้านเพิ่งยืนยันในจังหวะเดียวกัน (แข่งกัน: ผ่านฝั่งเดียว)
**เกณฑ์ผ่าน:** [ ] ออเดอร์ที่ร้านไม่ตอบใน 15 นาทีกลายเป็น `expired` เมื่อมีการอ่านออเดอร์หรือ cron รัน (test ด้วยเวลาที่ฉีดเข้ามา) และลูกค้าได้ข้อความตอนเปลี่ยนสถานะ [ ] ไม่ทับออเดอร์ที่ยืนยันทัน

---

## P10 — แก้บั๊กหลังรวมระบบ + เอกสาร API  ·  14–16 พ.ย.
- เขียน `docs/API.md` สั้น ๆ (ตัวอย่าง request/response จริงของแต่ละ endpoint ที่ใช้กับยูริ/อาร์ม) — **ต้องตรง CONTRACTS** ถ้าพบว่า CONTRACTS ผิด ให้ถามซี
- แก้ bug ที่ซีส่งมา (ขั้นตอนทำซ้ำ/ผลจริง/ผลที่ควรเป็น)
- ตรวจ `grep -R "status" src | ` หาจุดที่เปลี่ยนสถานะนอก `transition` อีกรอบ
**เกณฑ์ผ่าน:** [ ] `docs/API.md` ครบทุก endpoint ของพลุ [ ] ไม่มี bug ระดับ "ข้ามร้านได้/เงินผิด/สถานะข้ามขั้น" ค้างอยู่
