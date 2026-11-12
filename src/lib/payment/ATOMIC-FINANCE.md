# ธุรกรรมกลางสำหรับ A3 / A4 / A6

เพิ่ม migration `20261112090000_atomic_order_finance.sql` และ persistence ภายใน `transition()` โดยไม่เปลี่ยนสถานะ ตาราง สูตรเงิน หรือ endpoint ตาม CONTRACTS

## ใช้งาน

- ระบบตรวจสลิป: เรียก `finalizePayment({ orderId, paymentId, slipRef, verifiedBy: 'slipok' })` หลัง provider ยืนยันเท่านั้น
- แอดมิน A6: ตรวจสิทธิ์ด้วย requireAdmin และเรียก `finalizePayment({ orderId, paymentId, verifiedBy: 'admin' })` หลังตรวจสลิปด้วยมือ
- การยกเลิกหลังจ่าย/ร้านปฏิเสธ: เรียก `transition()` เช่นเดิม พร้อม refundSatang เฉพาะ admin; ไม่เขียนแถว refund แยก
- Legacy `transition(…paid)` รับได้เฉพาะเมื่อมี verified payment ยอดตรงแล้ว ไม่ใช่ทางที่ A3/A6 ควรใช้เพื่อบันทึก payment ใหม่

RPC เป็น SECURITY INVOKER, search_path ว่าง และให้ execute เฉพาะ service_role ไม่มี endpoint ใหม่สำหรับ browser สิทธิ์เจ้าของออเดอร์/บทบาทยังต้องตรวจใน API ตามเดิม

ล็อกตามลำดับ shop → order → payment; การล็อกร้านช่วยตรวจรหัสรับงานซ้ำข้ามออเดอร์พร้อมกัน บันทึก payment/order/settlement ใน transaction เดียว คืนเงินก็เปลี่ยนออเดอร์พร้อมสร้าง refund หากล้มขั้นใด PostgreSQL ย้อนกลับทั้งหมดและลองใหม่ได้

ตรวจยอดกับออเดอร์ที่ล็อกแล้ว ตรวจ deadline ด้วยเวลาฐานข้อมูลหลังได้ lock ใช้ unique constraint เดิมกันสลิปซ้ำและ payment verified ซ้ำ Replay payment เดิมไม่เขียน timestamp/verifier/code/settlement ซ้ำและไม่ notify ซ้ำ; transaction ใหม่ที่แพ้สถานะคืน conflict ตามเดิม

## ทดสอบ

ใช้ Docker container PostgreSQL 17 ชั่วคราว ไม่มี published port/network และไม่มีข้อมูลจริง:

```sh
docker run -d --name printgo-atomic-test --network none --tmpfs /var/lib/postgresql/data -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine
# เมื่อ pg_isready ใน container รายงานว่าพร้อมแล้ว
PRINTGO_ATOMIC_PG_CONTAINER=printgo-atomic-test npm test -- src/lib/db/atomicFinance.integration.test.ts
```

ชุดทดสอบสร้าง/ลบฐานข้อมูลชื่อสุ่มของตัวเอง ใช้ migration จริงทั้งสองไฟล์ เฉพาะ schema `auth.users` และ `storage.buckets` ของ Supabase เป็น stub ตรวจ commit/replay พร้อมกัน, rollback เมื่อ insert settlement/refund ล้ม, partial refund, deadline/ยอด/ออเดอร์ผิด, duplicate slip/pickup code การอนุมัติแข่งกับแอดมิน/การยกเลิก, deadline ที่หมดระหว่างรอ payment lock และสิทธิ์ anon/authenticated/service_role

Unit tests ใช้ RPC response simulator สำหรับตรวจ adapter/state-machine/notify; ไม่ใช่หลักฐานของ SQL transaction โดยลำพัง

## ก่อน deploy และข้อจำกัด

- ซี/พลุรีวิว migration และ domain; apply migration ผ่านขั้นตอน deploy ของทีมก่อนใช้โค้ดใหม่ งานนี้ไม่ได้ apply กับ Supabase จริงหรือ push migration ไป production
- default O9 ยังเป็นคนตรวจ: ไม่เปิด SlipOK จริงและไม่ตั้ง branchReceiverConfirmed ให้เอง; O3 ใช้หน้าต่างชำระเดิม (default 30 นาที)
- ยังต้องทดสอบ PostgREST, Auth, Storage, LINE และ flow ทั้งระบบกับ Supabase dev จริง
- Notify ทำหลัง commit แบบ best effort ตามเดิม หาก process หยุดหลัง commit ก่อนส่ง อาจไม่ได้ส่งข้อความ; ยังไม่มี durable outbox/retry queue
- ไม่ซ่อมข้อมูลเก่าที่เคยมี paid แต่ขาด settlement หรือ verified แต่สถานะไม่ตรงโดยอัตโนมัติ ไม่เปลี่ยนนโยบายยกเลิก/หมดอายุระหว่าง pending_review ไม่เปลี่ยน external delivery side effects
- บันทึก SlipOK log:true แล้ว transaction ล้มจะคง pending_review ต้องให้ admin ตรวจ ไม่เรียกตรวจสลิปซ้ำอัตโนมัติ
- A4 ต้องแสดง/โอน settlement เฉพาะ order completed; rejected/cancelled ไม่เข้า payout ตามสัญญาเดิม

รหัสรับงาน 4–5 หลักสืบจาก codegen/schema เดิม ส่วน D25 ระบุ 4 หลัก งานนี้ไม่ได้ปรับนโยบายดังกล่าว ต้องให้ซีตรวจความสอดคล้องแยกจากธุรกรรมเงิน
