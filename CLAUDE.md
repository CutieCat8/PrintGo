# PrintGo — คู่มือสำหรับ AI agent (อ่านทุกครั้งก่อนเริ่มงาน)

> Your file goes in. Your print comes home.
> PrintGo = ตัวกลางสั่งปริ้นผ่าน LINE OA เดียว สำหรับหลายร้านปริ้น ลูกค้าส่งไฟล์ → เลือกร้าน → ร้านยืนยันราคา → ลูกค้าจ่าย → ร้านปริ้น → ลูกค้ารับเองหรือเรียกไรเดอร์
> **กำหนดส่ง: 17 พ.ย. 2026** (วางแผนให้โค้ดเสร็จ 15 พ.ย. ทดสอบ 16 พ.ย. สำรอง 17 พ.ย.)
> ผู้ใช้/สมาชิกพูดภาษาไทย ตอบและเขียนข้อความบนหน้าจอเป็นภาษาไทย แต่โค้ด ชื่อตัวแปร และ commit เป็นภาษาอังกฤษ

## 0. ลำดับการอ่าน (บังคับ)
1. ไฟล์นี้
2. `docs/CONTRACTS.md` — สัญญากลาง (ตาราง, สถานะ, API, หน่วยเงิน) **ห้ามเดา ห้ามคิดชื่อ field เอง**
3. `DECISIONS.md` — สิ่งที่ตัดสินแล้ว และข้อที่ยังเปิดอยู่
4. ไฟล์ task ของคุณใน `docs/tasks/` (คนที่สั่งงานจะบอกรหัส task เช่น `P3`)

## 1. โปรโตคอล "ถามก่อนทำ" (สำคัญที่สุด)
ก่อนเขียนโค้ดของ task ใด ให้ตอบกลับผู้สั่งงานด้วย 3 ข้อนี้ **แล้วรอคำตอบ**:
1. **ฉันเข้าใจว่า task นี้ต้องทำ:** (สรุป 3–6 บรรทัดด้วยคำของคุณเอง)
2. **ไฟล์ที่ฉันจะสร้าง/แก้:** (รายการ path ต้องอยู่ในโฟลเดอร์ของเจ้าของ task)
3. **สิ่งที่ฉันไม่แน่ใจ:** (ข้อที่ task/CONTRACTS/DECISIONS ไม่ตอบ) ถ้าไม่มีให้เขียนว่า "ไม่มี"

**ห้ามตัดสินใจเองแล้วทำเลย** ในเรื่องต่อไปนี้ ต้องถามมนุษย์ก่อนเสมอ:
- เปลี่ยนชื่อ/ชนิด field, ตาราง, สถานะ, endpoint ใน `docs/CONTRACTS.md`
- เพิ่ม dependency (npm package) ที่ไม่ได้ระบุใน task
- เรื่องเงิน: สูตรค่าบริการ, การปัดเศษ, การคืนเงิน, ใครได้เงินเท่าไร
- เรื่องความปลอดภัย/ข้อมูลส่วนบุคคล: ใครเห็นไฟล์, เก็บนานแค่ไหน, สิทธิ์
- ข้อที่ `DECISIONS.md` ติดป้าย `[เปิด]` ให้ใช้ค่า default ที่เขียนไว้ **และแจ้งในรายงานว่าใช้ default**
- งานนอกขอบเขต task, แก้ไฟล์นอกโฟลเดอร์ของเจ้าของ task
- เจอว่าเอกสารสองที่ขัดกัน → หยุดและถาม ไม่ต้องเลือกฝั่งเอง

ถ้าคำสั่งนั้นชัดและอยู่ในขอบเขต task ไม่ต้องถามซ้ำ ถามเฉพาะที่ผลต่างกันจริง ๆ

## 2. เทคโนโลยี (ตัดสินแล้ว)
- Next.js (App Router) + TypeScript, deploy บน Vercel
- Supabase: Postgres, Storage (bucket private), Auth (อีเมล magic link สำหรับร้านและแอดมิน)
- UI: Tailwind CSS ธีม navy `#12284C` + ส้ม `#F26B21`, ฟอนต์ที่รองรับไทย (เช่น Noto Sans Thai / Prompt)
- Validation: Zod. Test: Vitest. Data fetching ฝั่งหน้าจอ: SWR
- ลูกค้าใช้ LIFF บน LINE (ล็อกอินด้วย LINE) · ร้าน/แอดมินใช้เว็บ + Supabase Auth
- ห้ามเพิ่ม ORM ตัวใหม่ ใช้ `@supabase/supabase-js` ตรง ๆ ฝั่งเซิร์ฟเวอร์
- ตรวจเวอร์ชัน/ API ของไลบรารีจากเอกสารทางการก่อนเขียน อย่าเดาจากความจำ

## 3. กฎเหล็กของโดเมน
1. **เงินเป็นจำนวนเต็ม "สตางค์" เสมอ** (1 บาท = 100) ทั้งใน DB, API, โค้ด ห้ามใช้ float ห้ามเก็บเป็น "บาท" แสดงผลเป็นบาทเฉพาะตอนวาดหน้าจอผ่าน `formatBaht()` ที่เดียว
2. **เปลี่ยนสถานะออเดอร์ผ่าน `transition()` เท่านั้น** (`src/lib/domain/orders/transition.ts`) ห้าม `update orders set status` ตรง ๆ ที่ไหนทั้งนั้น
3. **ความลับอยู่ฝั่งเซิร์ฟเวอร์เท่านั้น** (`SUPABASE_SERVICE_ROLE_KEY`, LINE channel secret/access token, SlipOK key, Grab secret, `VAPID_PRIVATE_KEY`, `CRON_SECRET`) ห้ามขึ้น `NEXT_PUBLIC_*`, ห้าม commit `.env*` (ยกเว้น `.env.example`), ห้ามพิมพ์ค่าจริงลงแชทหรือ log
4. **ตรวจสิทธิ์ในโค้ดทุก endpoint**: ลูกค้าเห็นเฉพาะออเดอร์ตัวเอง, ร้านเห็นเฉพาะออเดอร์ร้านตัวเอง, แอดมินเห็นทั้งหมด (RLS เปิดแต่ไม่มี policy; เซิร์ฟเวอร์ใช้ service role และตรวจเองผ่าน `requireCustomer/requireShop/requireAdmin`; ร้านต้อง `active` ยกเว้น API สมัคร/ตั้งค่าที่ใช้ `requireShop(req,{allowPending:true})` ตาม CONTRACTS 6.2)
5. **ไฟล์ลูกค้า**: bucket private, อัปโหลดด้วย signed upload URL ตรงเข้า Storage, ร้านเปิด/ดาวน์โหลดผ่าน signed URL อายุสั้น (ร้านดาวน์โหลดไปปริ้นได้ — D20), ลบอัตโนมัติ 7 วันหลังออเดอร์จบ (ลบเฉพาะที่เก็บของเรา ไม่รวมสำเนาที่ร้านดาวน์โหลดไปแล้ว)
6. **Webhook ทุกตัวต้อง idempotent** (ใช้ตาราง `webhook_events`) และตรวจลายเซ็น
7. ถ้าส่วนลดตามปริมาณถูกกระตุ้น หรือมีบริการเสริมที่ "ราคาตามตกลง" → `requires_manual_price = true` ระบบ **ห้ามส่งราคาให้ลูกค้าเอง** ร้านต้องกรอกราคาก่อน
8. ห้ามแต่งข้อมูลจริง (ตัวเลขตลาด, ค่าส่งจริง, ราคาจริง) ในโค้ด/seed ใช้ค่าตัวอย่างและติดป้ายว่า "ตัวอย่างสมมติ"
9. ของนอกที่ยังไม่ได้เชื่อมจริง (Grab, SlipOK) ให้ทำผ่าน provider interface + ตัวสำรอง และ **รายงานตรง ๆ ว่าอะไรเป็น mock** อย่าเขียนว่า "ทดสอบแล้ว" ถ้าไม่ได้ทดสอบกับของจริง
10. **หลังชำระเงินแล้วลูกค้ายกเลิกเองไม่ได้** (เฉพาะแอดมินยกเลิก + refund — D19) · **ร้านห้ามเห็น `pickupCode` และ `deliveryRecipient*`** (ชื่อ/เบอร์ผู้รับ) ตรวจที่ชั้น API ไม่ใช่แค่ซ่อนในหน้าจอ

## 4. ความเป็นเจ้าของโฟลเดอร์
| โฟลเดอร์ | เจ้าของ |
|---|---|
| `src/app/liff/**`, `src/app/shop/**` (ยกเว้น `shop/settings/**`), `src/app/dev/**`, `src/app/globals.css`, `src/app/not-found.tsx`, `src/app/error.tsx`, `src/components/ui/**`, `src/lib/client/**` | ยูริ |
| `src/app/shop/settings/**`, `src/app/admin/**`, `src/app/api/payments/**`, `src/app/api/admin/**`, `src/lib/payment/**`, `src/components/payment/**` | อาร์ม |
| `src/app/api/liff/**`, `src/app/api/shop/**`, `src/app/api/cron/**`, `src/lib/domain/**`, `docs/API.md` | พลุ |
| `src/app/api/line/**`, `src/app/api/delivery/**`, `src/lib/line/**`, `src/lib/delivery/**`, `src/lib/auth/**`, `src/lib/db/**`, `src/lib/push/**`, `src/lib/errors.ts`, `src/proxy.ts`, `src/app/login/**`, `src/app/auth/**`, `public/**`, `scripts/**`, `supabase/**`, `.github/**`, `docs/**` (ยกเว้น `docs/API.md`), config ราก | ซี |
แก้นอกโฟลเดอร์ตัวเอง = เปิด PR และขอให้เจ้าของรีวิว/อนุมัติ

## 5. Git
- branch: `feat/<task-id>-<สั้นๆ>` เช่น `feat/p3-shop-search` · ห้าม push ตรง `main` (ยกเว้นซีทำ commit แรกของ repo ใน Z1)
- commit ภาษาอังกฤษ รูปแบบ `feat:` `fix:` `chore:` `docs:` `test:` · หนึ่ง commit ต่อหนึ่งงานย่อย · เนื้อ commit สั้น
- **ห้ามใส่ "Co-Authored-By" หรือข้อความระบุว่า AI เขียน** ใน commit/PR
- ก่อนเปิด PR: `npm run lint && npm run typecheck && npm test` ต้องผ่าน

## 6. วิธีจบ task (Definition of Done)
1. ทำตาม **เกณฑ์ผ่าน (Acceptance criteria)** ของ task ครบทุกข้อ
2. มี test สำหรับตรรกะเรื่องเงิน ราคา สถานะ สิทธิ์
3. เรียก sub-agent `reviewer` (ไฟล์ `.claude/agents/reviewer.md`) ตรวจงานก่อนรายงาน แล้วแก้ข้อ "ต้องแก้ก่อนไปต่อ"
4. รายงานผู้สั่งงานตามรูปแบบนี้:
   - ทำอะไรเสร็จ (เทียบกับเกณฑ์ผ่านทีละข้อ)
   - **ทดสอบอะไรจริง / อะไรเป็น mock** (แยกให้ชัด)
   - ใช้ค่า default ข้อไหนจาก `DECISIONS.md`
   - ไฟล์ที่แก้นอกโฟลเดอร์ตัวเอง (ถ้ามี)
   - ที่ยังค้าง/ความเสี่ยง
5. อย่าบอกว่า "เสร็จ" ถ้ายังรันไม่ผ่านหรือยังไม่ได้รัน

## 7. คำสั่งที่ใช้บ่อย (จะถูกเติมใน task Z1)
`npm run dev` · `npm run lint` · `npm run typecheck` · `npm test` · `npm run db:reset` (รัน migration + seed บน Supabase local/โปรเจกต์ dev)
