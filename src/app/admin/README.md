# A5 — หน้าแอดมินและอนุมัติร้าน

## ขอบเขต

- `/admin`: จำนวนร้านรออนุมัติ สลิปรอตรวจ และร้านทั้งหมด (ไม่ใช่ KPI รายได้ของ A7)
- `/admin/shops`: ค้นหา/กรองสถานะ แสดงร้าน pending ก่อน พร้อมคำใบ้เรื่องราคาและเวลาเปิด
  อนุมัติหรือระงับผ่านหน้าต่างยืนยัน และ refresh ข้อมูลหลังบันทึก
- ทุกหน้าและ layout ตรวจ `requireAdmin` บนเซิร์ฟเวอร์ทุก request/render ผ่าน guard
  ไม่อาศัย proxy หรือ client UI เป็นตัวตรวจสิทธิ์เพียงอย่างเดียว
- ทุก API เรียก `requireAdmin` เอง และส่ง Cache-Control private, no-store
  mutation ที่ browser ส่งมาจาก origin อื่นถูกปฏิเสธ
- ชื่อแท็บ = จำนวนร้าน pending + payments pending_review เช่น `(3) PrintGo Admin`
  client poll ทุก 15 วินาที ไม่ใช้ mock API ของหน้าลูกค้า
- เมนู A4/A6 ที่ยังไม่มีหน้าจอแสดงว่าเร็ว ๆ นี้ ยังไม่พาผู้ใช้ไปหน้า 404

DashboardShell เดิมของยูริผูกเมนูกับร้าน (`/shop`) จึงสร้าง AdminFrame ใต้โฟลเดอร์อาร์ม
ตามตัวเลือกใน ARM.md โดยใช้ shared UI Button/Card/Badge/Modal/States ของยูริ

## API (response กำหนดเฉพาะแอดมินตาม CONTRACTS 6.4)

`GET /api/admin/shops`

```ts
{
  shops: Array<{
    id: string; name: string; phone: string; address: string;
    status: "pending" | "active" | "suspended"; createdAt: string;
    hasPricing: boolean; hasHours: boolean;
  }>;
  pendingShopCount: number;
  pendingPaymentCount: number;
}
```

รายการร้านอ่านแบบแบ่งหน้า 200 แถวจนหมด ไม่ถูกตัดที่ขีดจำกัด PostgREST
ราคาและเวลาอ่านผ่าน relations ใน query เดียวต่อหน้า ไม่ query ทีละร้าน
hasHours หมายถึงมี weekday ครบทั้ง 7 วัน การตั้งเวลาไม่ครบเป็นคำเตือน ไม่ใช่เงื่อนไขอนุมัติใหม่
hasPricing หมายถึงมีกติการาคาอย่างน้อยหนึ่งรายการ

`POST /api/admin/shops/:id/approve` และ `.../suspend` คืน `{ shop: AdminShop }`

อนุมัติ pending -> active เท่านั้น; ระงับ pending/active -> suspended
การส่งซ้ำเมื่ออยู่สถานะเป้าหมายแล้วไม่มีการเขียนซ้ำ
ทุก update ระบุ status เดิมในเงื่อนไข หากแพ้คำขอที่เปลี่ยนเป็นสถานะอื่น คืน VALIDATION_ERROR 422
ไม่เพิ่ม error code ใหม่หรือแก้ CONTRACTS และไม่เปิดฟีเจอร์เปิดร้านที่ suspended กลับมาใน A5

การอนุมัติไม่สร้างราคา/เวลาให้อัตโนมัติ และการระงับไม่ยกเลิกออเดอร์เดิม
ใช้ buildShopList ของพลุตรวจว่าร้าน suspended ไม่โผล่ให้ลูกค้า

## ทดสอบจริง / จำลอง

Tests ใช้ requireAdmin ตัวจริงกับ development identity และตรวจว่า header นี้ใช้ไม่ได้ใน production
ทดสอบ page guard, API 401/403, origin, คำขอซ้ำ/พร้อมกัน และ mapping ข้อมูลด้วย query จำลอง
ทดสอบการค้นหาร้านผ่าน buildShopList ตัวจริง โดยใช้ข้อมูลร้านและฐานข้อมูลจำลอง
ไม่ใช่การยืนยัน transaction/query บน Supabase จริง

ผลรอบพัฒนา: tests เฉพาะ A5 33 ข้อผ่าน; ทั้งโปรเจกต์ 985 ข้อผ่าน
manual payment preview 1 ข้อถูกข้าม; lint/typecheck และ diff check ผ่าน
ตรวจ HTTP บน dev server จริงโดยไม่ใช้ DB: anonymous `/admin` -> 307 `/login`,
development identity ของร้านเข้า `/admin/shops` -> 404 และ anonymous API -> 401
ไม่ได้ทดสอบหน้าจอแอดมินที่ล็อกอินจริงใน browser

เครื่องนี้ยังไม่มี NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY
จึงยังไม่ได้ทดสอบ magic link/admin session จริงหรือวงจรสมัครร้าน -> อนุมัติ -> ค้นหาร้านบน DB จริง
ก่อนเดโมให้ซีเตรียม Supabase dev และบัญชี admin (ใช้ make-admin ที่มีอยู่) แล้วทดสอบวงจรนี้
ไม่เพิ่มสคริปต์ create-shop นอกโฟลเดอร์ในงาน A5

ใช้การตั้งค่าที่ตัดสินแล้ว D23; ไม่มี default ใหม่จาก DECISIONS
ไฟล์ A5 อยู่เฉพาะ src/app/admin และ src/app/api/admin/shops ไม่มี dependency ใหม่
branch นี้เริ่มจาก A3 เพื่อใช้ UI/domain ที่นำ PR #12 มารวมทดสอบแล้ว
ไม่ได้ merge A3 หรือ PR ของเพื่อนเข้า main
