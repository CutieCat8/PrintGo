# งานของซี (วีรชิต) — Tech Lead + Fullstack

อ่าน `CLAUDE.md`, `docs/CONTRACTS.md`, `DECISIONS.md` ก่อนทุก task · ถามก่อนทำตามโปรโตคอลใน `CLAUDE.md` ข้อ 1
โฟลเดอร์ของซี (ตรงกับ `CLAUDE.md` ข้อ 4): `src/lib/db/**`, `src/lib/auth/**`, `src/lib/line/**`, `src/lib/delivery/**`, `src/lib/push/**`, `src/lib/errors.ts`, `src/proxy.ts`, `src/app/api/line/**`, `src/app/api/delivery/**`, `src/app/login/**`, `src/app/auth/**`, `public/**`, `scripts/**`, `supabase/**`, `.github/**`, `docs/**` (ยกเว้น `docs/API.md` ของพลุ), ไฟล์ config ราก

---

## Z1 — Scaffold โปรเจกต์ + ธรรมเนียมทีม  ·  9 พ.ย.
**เป้าหมาย:** ทุกคน clone แล้วรันได้ภายในไม่กี่นาที และมีโครงโฟลเดอร์ตรงกับ `CLAUDE.md` ข้อ 4
**ทำอะไร:**
- สร้าง Next.js (App Router, TypeScript, Tailwind, ESLint) ใน repo นี้ (ราก repo = โปรเจกต์ ไม่ซ้อนโฟลเดอร์), ใช้ `src/` directory
- ติดตั้งเฉพาะที่จำเป็น: `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `swr`, `vitest`, `@vitest/coverage-v8` (ถ้าจะใช้), `prettier`
- สร้างโครงโฟลเดอร์ว่าง (ใส่ `.gitkeep`) ตามเจ้าของใน `CLAUDE.md` ข้อ 4
- สคริปต์ใน `package.json`: `dev`, `build`, `lint`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `db:reset` (ใส่ placeholder ไว้ก่อน เติมใน Z2)
- `.gitignore` (รวม `.env*` ยกเว้น `.env.example`, `.next`, `node_modules`), `.env.example` ครบตามหัวข้อ 8 ของ CONTRACTS (ค่าว่าง)
- `README.md` สั้น ๆ: วิธีรัน, ลิงก์ไป CLAUDE.md
- **stub ของ auth** ที่ `src/lib/auth/index.ts`: ฟังก์ชัน `requireCustomer/requireShop/requireAdmin/requireAuthUser` ที่ตอนนี้คืนค่าปลอมจาก header `x-dev-user` เมื่อ `NODE_ENV !== 'production'` (ให้คนอื่นเขียน API ได้ก่อน Z4 เสร็จ) ต้องใส่ comment ชัดเจนว่าเป็น stub และจะถูกแทนใน Z4
- stub `notify()` ที่ `src/lib/line/notify.ts` และ `notifyShop()` ที่ `src/lib/push/notifyShop.ts` เป็น no-op ที่ `console.log` (คนอื่นเรียกได้เลยตั้งแต่ P5)
- ตัวช่วยกลาง `src/lib/errors.ts`: คลาส `ApiError(code, status, message)` + ตัวห่อ route handler `handle(fn)` ที่แปลงเป็นรูปแบบ error ตาม CONTRACTS ข้อ 1
**เกณฑ์ผ่าน:**
- [ ] `npm run dev` ขึ้นหน้าเริ่มต้น · `npm run lint`, `typecheck`, `test` รันผ่าน (test อาจมีแค่ 1 ตัวง่าย ๆ)
- [ ] `.env.example` มีตัวแปรครบทุกตัวใน CONTRACTS ข้อ 8
- [ ] ไม่มี `.env` ใน git
- [ ] push ขึ้น `main` แล้ว ทุกคน clone ได้ (ซีเป็นคนเดียวที่ push ตรง `main` ได้เฉพาะ commit แรก; หลังจากนั้นใช้ PR)
**ห้าม:** เพิ่ม ORM, UI library หนัก ๆ (MUI/Chakra), state manager อื่น ๆ
**ถามก่อนถ้า:** เวอร์ชัน Node/Next ที่เครื่องซีไม่ตรงกับที่แนะนำ, ต้องการแพ็กเกจเพิ่ม

---

## Z2 — ฐานข้อมูล + type กลาง + seed  ·  9–10 พ.ย. (**คอขวด: ต้องเสร็จ 10 พ.ย.**)
> ตาม D19: ตาราง `orders` ต้องมี `ready_in_minutes`, `estimated_ready_at`, `ready_note` และ type/Zod ของ `confirm` กับ `eta` ตรง CONTRACTS ข้อ 3, 6.2, 6.6 ทุกตัวอักษร
> ตาม D22 (**ทำใน Z2 วันนี้**): enum `ServiceUnit`, ตาราง `shop_services` + `order_services`, คอลัมน์ `orders.estimated_services_satang`, `delivery_recipient_*`, type/Zod `ShopService`/`OrderService` และ seed บริการตัวอย่างร้านละ 2–3 รายการ (ชื่อ/ราคาสมมติ, 1 รายการเป็น "ราคาตามตกลง")
**เป้าหมาย:** ตารางทั้งหมดใน CONTRACTS ข้อ 3 พร้อมใช้ และมี type/Zod กลางให้ทุกคน import
**ทำอะไร:**
- สร้าง Supabase project (dev) ด้วยมือ แล้วเก็บ URL/keys ใน `.env.local` (ไม่ commit) · ถ้าใช้ Supabase CLI เขียน migration ใน `supabase/migrations/`
- migration แรก: enum ทุกตัวตามข้อ 2, ตารางทุกตัวตามข้อ 3 พร้อม FK/unique/index, `alter table … enable row level security` ทุกตาราง **ไม่สร้าง policy**
- ฟังก์ชัน SQL/ลำดับ `order_no`: sequence `order_no_seq` + ฟังก์ชันสร้าง `PG-0001` (เติม 0 ซ้ายให้ครบ 4 หลัก; เกิน 9999 ให้ขยายหลักอัตโนมัติ)
- Storage buckets ตามข้อ 3 (private ทั้งหมด) และข้อจำกัดชนิดไฟล์/ขนาดตาม O6 ถ้าตั้งได้
- `src/lib/db/types.ts`: Zod schema + `z.infer` type ของทุกตารางและ enum, **ชื่อ field ใน TS เป็น camelCase** พร้อมฟังก์ชัน `fromDb(row)` / `toDb(obj)` (แปลง snake↔camel) และ export type `Order`, `OrderDetail`, `OrderFile`, `OrderService`, `ShopService`, `Message`, `Shop`, `ShopMe`, `Payment`, `Delivery` ตามข้อ 6.6
- `src/lib/db/server.ts`: ฟังก์ชัน `getServiceClient()` (service role, ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น มี `import 'server-only'`) และ `getBrowserClient()` (anon key)
- `supabase/seed.sql`: ร้านตัวอย่าง 3 ร้านสถานะ `active` (ชื่อสมมติ + พิกัดสมมติในเชียงใหม่ ติดคอมเมนต์ว่า "ตัวอย่างสมมติ"), เวลาเปิดทุกวัน, ราคาต่อหน้าครบทุกชุดค่า (A4 ขาวดำ 1 บาท/หน้า ฯลฯ ตัวเลขสมมติ), `shop_discount_tiers` ร้านละ 1 tier (เช่น 50 หน้า) 1 ร้านปิดบางวัน, ลูกค้าทดสอบ 1 คน, ออเดอร์ตัวอย่างสถานะต่าง ๆ 5–6 ใบ (บางใบมี `ready_in_minutes`/`estimated_ready_at`, ออเดอร์ delivery 1 ใบมี `delivery_recipient_*` — ข้อมูลสมมติ)
- สคริปต์ `db:reset` รัน migration + seed บนโปรเจกต์ dev (เขียนวิธีใน README)
- test: `src/lib/db/types.test.ts` ตรวจว่า enum ใน Zod ตรงกับ enum ใน migration (อ่านไฟล์ SQL แล้วเทียบ)
**เกณฑ์ผ่าน:**
- [ ] `db:reset` รันซ้ำได้โดยไม่ error (idempotent)
- [ ] ทุกตารางเปิด RLS (ตรวจจาก `pg_tables.rowsecurity`) และไม่มี policy
- [ ] ชื่อ enum/ตาราง/คอลัมน์ตรง CONTRACTS ทุกตัว (ให้ reviewer เทียบ)
- [ ] `import { Order } from '@/lib/db/types'` ใช้ได้ในโค้ดคนอื่น
- [ ] ไม่มีคีย์/ความลับใน seed หรือ migration
**ห้าม:** เปลี่ยนชื่อ field ตามความชอบ · ใช้ ORM · ใส่ข้อมูลร้านจริง
**ถามก่อนถ้า:** CONTRACTS ขาดคอลัมน์ที่ต้องใช้จริง (ห้ามเพิ่มเอง ให้ซีตัดสินแล้วแก้ CONTRACTS ก่อน)
**เมื่อเสร็จ:** แจ้งทุกคนในกลุ่มทันทีว่า types พร้อม

---

## Z3 — CI + Deploy  ·  10 พ.ย.
**เป้าหมาย:** PR ทุกใบถูกตรวจอัตโนมัติ และมี URL บน Vercel ให้ LIFF/LINE ใช้ (LIFF ต้อง HTTPS)
**ทำอะไร:**
- `.github/workflows/ci.yml`: ติดตั้ง, `lint`, `typecheck`, `test` บน PR และ push main
- เชื่อมโปรเจกต์กับ Vercel, ใส่ env ใน Vercel (ไม่ใส่ใน repo), ตั้ง preview deploy สำหรับ PR
- เขียนใน README: URL production/preview และวิธีตั้ง env
- เปิด branch protection บน `main`: ต้องผ่าน CI + 1 รีวิว (ถ้าแผน GitHub รองรับ; ถ้าไม่ได้ ให้ใช้ข้อตกลงด้วยปากเปล่า)
**เกณฑ์ผ่าน:** [ ] PR ทดสอบรัน CI ได้ · [ ] เปิดเว็บบน Vercel ได้ · [ ] env ลับไม่อยู่ใน repo
**ถามก่อนถ้า:** แผน Vercel/GitHub มีข้อจำกัดอื่น (จำนวนโปรเจกต์ ฯลฯ) — ตรวจเอกสารปัจจุบัน อย่าเดา · (ตรวจแล้ว 10 พ.ย.: Vercel Hobby รัน cron ได้วันละครั้ง จึงใช้ lazy-expiry เป็นหลัก ดู D12/P9)

---

## Z4 — Auth จริง  ·  10–11 พ.ย. (**คอขวด: เสร็จ 11 พ.ย.**)
**เป้าหมาย:** แทน stub ใน Z1 ด้วยตัวจริง โดย signature ฟังก์ชันไม่เปลี่ยน (CONTRACTS ข้อ 7)
**ทำอะไร:**
- `requireCustomer(req)`: อ่าน `Authorization: Bearer <LIFF ID token>` → ตรวจกับ LINE (verify ID token endpoint ของ LINE ด้วย `LINE_CHANNEL_ID` — อ่านเอกสาร LINE Login ปัจจุบันก่อน) → upsert `customers` ด้วย `line_user_id` → คืน `{ customerId, lineUserId }` · token ผิด/หมดอายุ → `ApiError('UNAUTHENTICATED',401)`
- `requireAuthUser(req)`: อ่าน session ของ Supabase (cookie ผ่าน `@supabase/ssr`) → คืน `{ authUserId, email }` ไม่ต้องมี profile (ใช้กับ `/api/shop/me`, `/api/shop/register`) · ไม่มี session → `UNAUTHENTICATED`
- `requireShop(req, opts?)`: เรียก `requireAuthUser` → หา `profiles` ที่ `role='shop'` และ `shop_id` ไม่ว่าง (ไม่มี → `FORBIDDEN`) → ร้านต้อง `status='active'` ไม่งั้น `FORBIDDEN` · ถ้า `opts.allowPending` และ `status='pending'` ให้ผ่าน · `suspended` ไม่ผ่านเสมอ
- `requireAdmin(req)`: ต้องมี `profiles.role='admin'`
- หน้าเข้าสู่ระบบ magic link สำหรับร้าน/แอดมินที่ `/login` (UI เรียบง่าย ยูริปรับสไตล์ทีหลัง) + callback `/auth/callback` + `signOut`
- สคริปต์ `npm run make-admin -- email@x.com` ใส่ role admin ให้ผู้ใช้ (ใช้ service role)
- proxy (`src/proxy.ts` — Next.js 16 เปลี่ยนชื่อจาก middleware): ป้องกัน `/shop/**` และ `/admin/**` ให้ต้องล็อกอิน (ไม่ใช่ที่เดียวของการตรวจสิทธิ์ — API ต้องตรวจเองด้วย) · ล็อกอินแล้วแต่ยังไม่มี profile ร้าน → ส่งไป `/shop/onboarding` (ยกเว้นตัวหน้านั้นเอง; การเช็ก profile ใช้ `GET /api/shop/me` ฝั่งหน้าจอได้ ไม่จำเป็นต้องทำใน middleware ถ้าทำยาก) · หน้า `/login` ข้อความ "เข้าสู่ระบบ / สมัครร้านค้า" ใช้อีเมลช่องเดียว (D23)
- เปิดทางให้ dev: ถ้า `NODE_ENV!=='production'` และมี header `x-dev-user` ยังใช้ stub ได้ **แต่ต้องปิดเด็ดขาดใน production** (test ยืนยัน)
- test: token ปลอม → 401, ร้านเรียก API แอดมิน → 403, ร้าน `pending` เรียก API ออเดอร์ → 403 แต่เรียก `profile` ได้ (`allowPending`), ผู้ใช้ไม่มี profile เรียก `requireShop` → 403 แต่ `requireAuthUser` ผ่าน, `x-dev-user` ถูกปิดเมื่อ `NODE_ENV=production`
**เกณฑ์ผ่าน:** [ ] ล็อกอินร้านด้วย magic link ได้จริง [ ] verify LIFF token ได้จริงกับ LINE channel จริง (หรือรายงานตรง ๆ ว่ายังทดสอบกับของจริงไม่ได้) [ ] ทั้ง 3 ฟังก์ชันมี test [ ] production ปิด stub
**ห้าม:** เก็บ LIFF token ใน DB หรือ log · เชื่อ `customerId`/`shopId` จาก body ของ request
**ถามก่อนถ้า:** ต้องการเพิ่มวิธีล็อกอินอื่น

---

## Z5 — LINE OA + Webhook + Rich Menu  ·  11–12 พ.ย.
**เป้าหมาย:** ทัก OA แล้วเข้าสู่ฟอร์มสั่งปริ้นได้ และระบบรับ event จาก LINE อย่างปลอดภัย
**ทำอะไร:**
- (ด้วยมือบน LINE Developers) สร้าง Provider, Messaging API channel, LINE Login channel + LIFF app ชี้ `NEXT_PUBLIC_APP_URL/liff` (ขนาด Full), ใส่ค่าใน env
- `POST /api/line/webhook`: ตรวจ `x-line-signature` ด้วย `LINE_CHANNEL_SECRET` (HMAC-SHA256 ของ raw body, **อ่าน body แบบ raw ก่อน parse**) · ผิด → 401 · บันทึก `webhook_events` กันซ้ำ (event id จาก `webhookEventId`) · ตอบ 200 เร็ว
- จัดการ event: `follow` (ข้อความต้อนรับ + ปุ่มเปิดฟอร์ม), `message` ข้อความ (ตอบเมนูช่วยเหลือสั้น ๆ), `postback` (`action=view_order&id=…` ส่งลิงก์ LIFF ไปหน้าออเดอร์)
- Rich Menu: 3 ปุ่มตาม wireframe: "สั่งปริ้น" (เปิด LIFF `/liff/new`), "สถานะงาน" (เปิด `/liff/orders`) และ "คุยกับร้าน" (เปิด `/liff/chats`) · Rich Menu เป็นรูปนิ่ง ใส่ badge ไม่ได้ (badge อยู่ในหน้า LIFF ตาม D16) · เขียนสคริปต์ `scripts/setup-richmenu.mjs` (เป็น `.mjs` ตามแบบ `make-admin` เพื่อไม่ต้องเพิ่มตัวรัน TypeScript) ที่สร้างและตั้งเป็นค่าเริ่มต้น (รูปเมนู: ใช้รูปพื้นเรียบสีแบรนด์ + ตัวอักษร สร้างด้วย canvas/ภาพ static ได้)
- util `src/lib/line/client.ts`: ส่ง reply/push ผ่าน Messaging API (ห่อ fetch, ไม่ log token)
**เกณฑ์ผ่าน:** [ ] ลายเซ็นผิด → 401 (test) · [ ] event ซ้ำไม่ประมวลผลซ้ำ (test) · [ ] ทักบัญชี OA จริงบนมือถือแล้วเมนูขึ้นและเปิดหน้า LIFF ได้ (ซีทดสอบเอง บอกผลจริง) · [ ] ไม่มี token ใน log
**ห้าม:** ส่ง push เกินจำเป็น (โควตา/ค่าใช้จ่ายข้อความ; ใช้ reply เมื่อทำได้) · ฝัง secret ใน client
**ถามก่อนถ้า:** แผนข้อความ LINE OA ปัจจุบันจำกัดจำนวน push เท่าไร (ตรวจจากหน้าจอ LINE OA Manager ของซี ห้ามเดา)

---

## Z6 — `notify()` + Flex Message  ·  12–13 พ.ย.
**เป้าหมาย:** ทุกเหตุการณ์สำคัญของออเดอร์ส่งข้อความหาลูกค้าใน LINE ("ไม่ต้องถามว่าเสร็จหรือยัง")
**ทำอะไร:**
- แทน stub `notify(orderId, event)` (signature ตาม CONTRACTS ข้อ 7) โหลดออเดอร์+ลูกค้า แล้ว push Flex ไปที่ `customers.line_user_id`
- ทำ Flex template ต่อ event (ไทย สั้น ชัด ปุ่ม "ดูออเดอร์" เปิด LIFF `/liff/orders/{id}`):
  - `quote_ready`: ใบเสนอราคา (ค่าปริ้น, บริการเสริมรายบรรทัด, ค่าบริการ, ค่าส่ง, รวม — ใช้ `formatBaht`) + **เวลาเสร็จประมาณ** (แบบนับเวลา: "ประมาณ 15 นาทีหลังชำระเงิน" · แบบตายตัว: "พรุ่งนี้ 12:00 น." เวลาไทย) + หมายเหตุร้านถ้ามี + ปุ่ม "ชำระเงิน" + เวลาที่ต้องจ่ายก่อน
  - `eta_changed`: "ร้านปรับเวลาเสร็จเป็น … (เดิม …)" + หมายเหตุร้าน + ปุ่มเปิดแชท (ไม่มีปุ่มยกเลิก — D19)
  - `payment_verified`: ชำระแล้ว + (pickup) รหัสรับงาน + "เสร็จประมาณ 14:35 น." (จาก `estimated_ready_at` หลังแปลงตอน `paid`)
  - `payment_rejected` (สลิปไม่ผ่าน + เหตุผล), `order_rejected` (+ เหตุผลของร้าน), `order_expired`, `order_cancelled`
  - `printing`, `ready` (pickup: ที่อยู่ร้าน + รหัสรับงาน · delivery: กำลังหาไรเดอร์), `courier_requested`, `in_transit` (+ลิงก์ติดตามถ้ามี), `completed`
  - `chat_message`: ข้อความจากร้าน (ตัดความยาว ~60 ตัวอักษร) + ปุ่ม "ตอบร้าน" เปิด LIFF `/liff/chats/{orderId}` · ข้อความสั้น ๆ อ่านได้จากหน้าล็อกสกรีน เช่น "ร้านมีคำถามเรื่องออเดอร์ PG-0012" (ตั้ง altText ของ Flex ให้เป็นข้อความนี้ เพราะ altText คือสิ่งที่ขึ้นในแจ้งเตือนมือถือ — ตรวจเอกสาร LINE ปัจจุบันยืนยัน)
  - กติกาส่ง: ทำตาม CONTRACTS ข้อ 7 (ไม่ push ซ้ำเมื่อยังมีข้อความร้านที่ยังไม่อ่านค้าง) · ตั้ง `messages.push_sent_at`
- กันส่งซ้ำ: แต่ละ (orderId, event) ส่งครั้งเดียวต่อการเปลี่ยนสถานะหนึ่งครั้ง (ใช้คอลัมน์/ตารางตามที่ซีเห็นว่าเหมาะ — ถ้าต้องเพิ่มตารางให้แก้ CONTRACTS ก่อน)
- ถ้า push ล้มเหลว: log (ไม่มีข้อมูลลับ) และ **ไม่ทำให้การเปลี่ยนสถานะล้ม**
- `src/lib/line/flex/*.ts` + ตัวสร้างข้อความเป็นฟังก์ชันบริสุทธิ์ มี snapshot test
**เกณฑ์ผ่าน:** [ ] ทุก event ใน `NotifyEvent` มี template และ test [ ] ส่งหาบัญชีทดสอบจริงอย่างน้อย 3 event (บอกผลจริง) [ ] ตัวเลขเงินแสดงถูก (22.00 บาท ไม่ใช่ 2200)
**ห้าม:** ส่งรหัสรับงานให้ใครนอกจากเจ้าของออเดอร์

---

## Z7 — Delivery (ManualProvider + API)  ·  13 พ.ย. · (Z11 = Grab, เสริม)
**เป้าหมาย:** เมื่อสั่งจัดส่ง ระบบประเมินค่าส่งได้ และเมื่อร้านปริ้นเสร็จแอดมินเรียกไรเดอร์ด้วยมือ แล้วสถานะไปถึงลูกค้า
**ทำอะไร:**
- `src/lib/delivery/types.ts` interface `DeliveryProvider` (CONTRACTS ข้อ 7)
- `ManualProvider`: `getQuote` คำนวณ `DELIVERY_BASE_SATANG + DELIVERY_PER_KM_SATANG × กม.` (ปัดขึ้นเป็นสตางค์จำนวนเต็ม, `estimated:true`, **ตัวเลขสมมติ O5**) · `create` สร้างแถว `deliveries` สถานะ `pending_admin` · `cancel` เปลี่ยนเป็น `cancelled`
- ฟังก์ชัน `getDeliveryProvider()` เลือกจาก env `DELIVERY_PROVIDER` (default `manual`)
- ฟังก์ชัน `quoteDelivery(shopId, dropoffLatLng)` ให้พลุเรียกใน `estimate`/`orders`
- เมื่อออเดอร์เข้าสถานะ `courier_requested` (พลุเรียก `createDeliveryForOrder(orderId)` ของซี) → ใช้ provider สร้าง delivery + notify
- รับสถานะกลับ: ฝั่งแอดมินกรอกด้วยมือผ่าน `/api/admin/orders/:id/delivery` (อาร์มเขียน route) → เรียก `applyDeliveryUpdate(orderId, {...})` ของซี ที่อัปเดต `deliveries` และเรียก `transition` ไป `in_transit`/`completed` + notify
- `POST /api/delivery/webhook/:provider`: โครงไว้ (ตรวจ provider ว่า `grab` ยังไม่รองรับ → 501) เพื่อพร้อมต่อ Z11
- test: ค่าส่งสำหรับระยะต่าง ๆ, สถานะ `pending_admin`→`booked`→…
**เกณฑ์ผ่าน:** [ ] เลือก delivery แล้ว estimate มีค่าส่ง [ ] ร้านกด mark-ready ของออเดอร์ delivery → เกิดแถว `deliveries` + ลูกค้าได้ข้อความ [ ] แอดมินกรอกสถานะแล้วออเดอร์เดินต่อถึง `completed`
**ห้าม:** ระบุว่าเป็นค่าส่งจริงของ Grab ในหน้าจอ (ติดป้าย "ค่าประมาณ") · เรียก API ภายนอกจริงใน test

### Z11 (เสริม — ทำเมื่อ Grab ตอบกลับและเหลือเวลา) — `GrabExpressProvider`
อ่านเอกสาร Grab Express ล่าสุดก่อน (`developer.grab.com/docs/grab-express`): OAuth2 client_credentials, sandbox `…/grab-express-sandbox`, `POST /v1/deliveries/quotes`, `POST /v1/deliveries`, webhook สถานะ · ทำเป็น provider อีกตัว, เก็บ token แคช (อายุ ~7 วัน), idempotent webhook · **รายงานว่าทดสอบกับ sandbox เท่านั้น** · ถามซีก่อนทุกครั้งที่ต้องใช้ credentials

---

## Z8 — รวมระบบ (Integration)  ·  14–15 พ.ย.
**เป้าหมาย:** flow เต็มทำงานบน LINE จริง + dashboard ร้านจริง
**ทำอะไร:**
- ต่อ `notify` เข้ากับ `transition` (ตรวจว่าพลุเรียกครบตามตาราง CONTRACTS ข้อ 4)
- เปลี่ยนหน้าจอยูริจาก mock เป็น API จริงร่วมกับยูริ (ช่วยแก้ความไม่ตรงของ contract)
- ตรวจว่าอาร์มเรียก `transition(awaiting_payment→paid)` ถูกที่ และ settlement ถูกสร้าง
- ทดสอบทางเดินหลัก 5 เส้น: (A) รับเอง (B) จัดส่ง (C) ร้านปฏิเสธ (D) ร้านไม่ตอบ → หมดเวลา (E) ออเดอร์ที่มีบริการเสริม (รวมแบบ "ราคาตามตกลง") + เวลาเสร็จประมาณ + แชท
- แก้ปัญหาข้ามโมดูล/สั่งงานแก้ให้เจ้าของ (ส่งรายการบั๊กที่ชัดเจน: ขั้นตอนทำซ้ำ + ผลจริง + ผลที่ควรเป็น)
**เกณฑ์ผ่าน:** ทั้ง 5 เส้นทางทำได้ครบบนอุปกรณ์จริง (มือถือ LINE + เบราว์เซอร์ร้าน) และจดผลลงตาราง checklist ใน `docs/E2E.md`

## Z9 — ทดสอบสุดท้าย + ซ้อม demo  ·  16 พ.ย.
- เขียน `docs/E2E.md` (checklist ทุกฟีเจอร์, ติ๊กผ่าน/ไม่ผ่านพร้อมวันที่) ให้ครอบคลุมการตัดสินใจ D15–D22: แชท/badge, Web Push (ถ้าทำ), เวลาเสร็จประมาณ, ร้านเปิด/ดาวน์โหลดไฟล์, บริการเสริม
- ทดสอบสิทธิ์ข้ามร้าน/ข้ามลูกค้า, ไฟล์ใหญ่, ไฟล์ผิดชนิด, ร้านปิด/พักรับงาน, จ่ายซ้ำ/สลิปซ้ำ
- ทดสอบบนมือถือจริง 2 รุ่นถ้ามี (รวมการขอตำแหน่งใน LINE ตาม D24 และ Web Push ถ้าทำ) · เตรียมข้อมูล demo (reset DB, ร้านตัวอย่าง, บัญชีทดสอบ) และสคริปต์เดโม 5 นาที
- เตรียมแผนสำรอง: วิดีโออัดหน้าจอ flow เต็ม เผื่อเน็ต/LINE มีปัญหาตอนพรีเซนต์
- ตรวจให้ตัวเลขในสไลด์ตรงกับระบบ (ค่าบริการ 5% ขั้นต่ำ 3 บาท, ตัวอย่างราคา)

## Z12 — Web Push แจ้งเตือนร้าน (`notifyShop`)  ·  13–14 พ.ย.  ·  ตาม D17
**เป้าหมาย:** ร้านได้แจ้งเตือนบนเครื่อง (พร้อมเสียงของระบบ) เมื่อมีออเดอร์ใหม่/ข้อความลูกค้า แม้ไม่ได้เปิดหน้า dashboard
**ทำอะไร:**
- ตรวจเอกสารทางการก่อนเขียน: Push API / Notifications API (MDN), ข้อกำหนด iOS (เพิ่มลงหน้าจอโฮม), ไลบรารีฝั่งเซิร์ฟเวอร์สำหรับ Web Push · **ถามซีก่อนติดตั้ง dependency** (เช่น `web-push`) · สร้างคีย์ VAPID แล้วใส่ `.env` (ห้ามพิมพ์ค่าลงแชท/log)
- `public/sw.js`: service worker รับ `push` แล้ว `showNotification` (ไทย: "ออเดอร์ใหม่ PG-0012" / "ลูกค้าส่งข้อความ…" ตัดความยาว) · `notificationclick` เปิด/โฟกัส `/shop/orders/{orderId}` · ข้อความไม่ใส่ข้อมูลส่วนบุคคล (ไม่มีชื่อไฟล์/ที่อยู่)
- `src/lib/push/notifyShop.ts` ตาม CONTRACTS ข้อ 7: โหลด `push_subscriptions` ของร้าน → ส่งทุกเครื่อง → ถ้า push service ตอบหมดอายุ (404/410) ลบแถวนั้น → ไม่โยน error ออกนอก (try/catch + log ไม่มีข้อมูลลับ)
- migration ตาราง `push_subscriptions` (Z2 ต้องเพิ่มตามสัญญา)
- ให้ยูริ (Y6) มีฟังก์ชันฝั่งหน้าเว็บ: ขอสิทธิ์ → `pushManager.subscribe` → `POST /api/shop/push/subscribe` — ซีเตรียมคีย์สาธารณะ `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
**เกณฑ์ผ่าน:** [ ] ปิดแท็บ dashboard แล้วสร้างออเดอร์ทดสอบ → เครื่องของร้านขึ้นแจ้งเตือน (ซีทดสอบจริงบน Chrome คอม + Android อย่างน้อย 1 เครื่อง **บอกผลจริง**; iOS ถ้าไม่ได้ทดสอบให้บอกว่าไม่ได้ทดสอบ) [ ] คลิกแจ้งเตือนเปิดหน้าออเดอร์ถูกใบ [ ] subscription หมดอายุถูกลบ (test) [ ] ไม่มี `VAPID_PRIVATE_KEY` ใน bundle ฝั่ง client (grep) [ ] push ล้มไม่ทำให้สร้างออเดอร์/ส่งข้อความล้ม
**ห้าม:** บอกว่า "ทดสอบแล้ว" ถ้าทดสอบแค่ในโหมด dev ในเครื่องเดียว · สัญญาว่าเสียงเป็นเสียงที่เรากำหนด (เสียงตอนปิดหน้าเป็นของระบบ)
**ถามก่อนถ้า:** เบราว์เซอร์ปิดทั้งโปรแกรมแล้วยังได้ไหม (ขึ้นกับระบบปฏิบัติการ/การตั้งค่า — ห้ามเดา ทดสอบแล้วรายงาน)

---

## Z10 — รีวิว PR (ทำต่อเนื่อง)
- รีวิวทุก PR ภายในครึ่งวัน (เน้น: สัญญา, เงิน, สิทธิ์, ความลับ) · ใช้ agent `reviewer` ช่วยก่อนอ่านเอง
- merge ตามลำดับที่ลดการชน: types → auth → domain → API → UI
