# PrintGo API — ส่วนของพลุ (ลูกค้า · ร้าน · cron)

เอกสารนี้ไว้ให้ยูริ (หน้าจอ LIFF และหน้าร้าน) และอาร์ม (หน้าตั้งค่าร้าน แอดมิน) เรียก API ได้โดยไม่ต้องเปิดโค้ด
**สัญญากลางคือ `docs/CONTRACTS.md`** ถ้าเอกสารนี้ขัดกับสัญญา ให้ถือสัญญาเป็นหลักแล้วบอกพลุและซี ส่วนที่โค้ดจริงต่างหรือเพิ่มจากสัญญาอยู่ในหัวข้อ 5

> **ตัวอย่างทั้งหมดเป็นข้อมูลสมมติ** (ชื่อร้าน ที่อยู่ เบอร์โทร ราคา ค่าส่ง) ไม่ใช่ข้อมูลจริง
> JSON ในเอกสารนี้ได้จากการเรียก route handler จริงของพลุกับฐานข้อมูลและ Storage จำลองในหน่วยความจำ **ไม่ใช่ Supabase/LINE จริง** และไม่ได้เขียนด้วยมือ
> id ถูกแทนด้วยเลขเรียงเพื่อให้อ่านง่าย ของจริงเป็น uuid ปกติ ตัวอย่างที่ยาวถูกตัดและมีหมายเหตุกำกับ

---

## 0. กติกาทั่วไป

**สิทธิ์ (ใครเรียกได้)**

| กลุ่ม | วิธีล็อกอิน | ฟังก์ชันที่ตรวจ |
|---|---|---|
| `/api/liff/*` (ลูกค้า) | header `Authorization: Bearer <LIFF ID token>` | `requireCustomer` — ลูกค้าเห็นเฉพาะออเดอร์ตัวเอง |
| `/api/shop/*` (ร้าน) | คุกกี้ session ของ Supabase | `requireShop` — ร้านต้อง `active` และเห็นเฉพาะออเดอร์ร้านตัวเอง |
| `/api/shop/{me,register}` | คุกกี้ session ของ Supabase | `requireAuthUser` — แค่ล็อกอินก็พอ ยังไม่ต้องมีร้าน |
| `/api/shop/{profile,hours,pricing,services,push/*}` | คุกกี้ session | `requireShop(req,{allowPending:true})` — ร้านที่ยังรออนุมัติ (`pending`) ใช้ได้ |
| `/api/cron/*` | header `Authorization: Bearer <CRON_SECRET>` | `requireCronSecret` — ถ้าไม่ได้ตั้ง `CRON_SECRET` ที่เซิร์ฟเวอร์ route จะปิด (401) |

`shopId`, `customerId`, ผู้ส่งข้อความ และสถานะ **มาจาก session เสมอ** ไม่ใช่จาก body ค่าที่ส่งมาเกินจะถูกเมินเฉย
ออเดอร์ (หรือไฟล์ แชท บริการ) ของคนอื่นตอบ **404** เหมือนไม่มีอยู่ ไม่บอกว่ามีอยู่จริง

**เงินเป็น "สตางค์" (จำนวนเต็ม) เสมอ** ฟิลด์ที่ลงท้าย `Satang` เช่น `1300` = 13.00 บาท แปลงเป็นบาทเฉพาะตอนวาดหน้าจอด้วย `formatBaht()` ที่เดียว
**เวลาเป็น ISO 8601** (UTC เช่น `2026-11-12T05:00:00.000Z`) ฟิลด์ JSON เป็น camelCase

**รูปแบบ error ทุก endpoint** (ข้อความ `message` เป็นภาษาไทย แสดงให้ผู้ใช้ได้เลย)

```json
{ "error": { "code": "ORDER_INVALID_TRANSITION", "message": "สถานะออเดอร์เปลี่ยนไปแล้ว กรุณารีเฟรช", "details": { } } }
```

| `code` | HTTP | เมื่อไหร่ |
|---|---|---|
| `UNAUTHENTICATED` | 401 | ยังไม่ล็อกอิน / token หมดอายุ / cron ไม่มี secret ที่ถูกต้อง |
| `FORBIDDEN` | 403 | ล็อกอินแล้วแต่ไม่มีสิทธิ์ (ไม่ใช่ร้าน ร้านยัง `pending` หรือถูกระงับ) |
| `NOT_FOUND` | 404 | ไม่พบ หรือเป็นของคนอื่น |
| `VALIDATION_ERROR` | 422 | ข้อมูลที่ส่งไม่ถูกต้อง รายละเอียดรายช่องอยู่ใน `details.issues[]` (`path`, `message`) |
| `ORDER_INVALID_TRANSITION` | 409 | สถานะออเดอร์เปลี่ยนไปแล้ว / ทำขั้นนี้ไม่ได้ในสถานะนี้ (`details.currentStatus`) → ให้โหลดออเดอร์ใหม่ |
| `MANUAL_PRICE_REQUIRED` | 409 | ออเดอร์ที่ต้องให้ร้านกำหนดราคา แต่ร้านไม่ได้ส่ง `printSubtotalSatang` |
| `SHOP_CLOSED` / `SHOP_PAUSED` | 409 | สั่งตอนร้านปิด (รวมช่วงใกล้ปิดตาม `cutoffMinutes`) / ร้านพักรับงาน |
| `CHAT_CLOSED` | 409 | ส่งข้อความในห้องที่ออเดอร์จบแล้ว |
| `ALREADY_REGISTERED` | 409 | ผู้ใช้นี้มีโปรไฟล์ (ร้านหรือแอดมิน) อยู่แล้ว |
| `RATE_LIMITED` | 429 | ใส่รหัสรับงานผิดเกิน 5 ครั้ง/10 นาที หรือส่งข้อความเกิน 20 ข้อความ/นาที |
| `INTERNAL` | 500 | ระบบขัดข้อง (ไม่มีรายละเอียดภายในหลุดออกมา) |
| `PAYMENT_*` | 409 | เป็นของ API ชำระเงิน (อาร์ม) ไม่ได้อยู่ในเอกสารนี้ |

**สถานะออเดอร์** `submitted → awaiting_payment → paid → printing → ready → completed` (รับเอง) หรือ `ready → courier_requested → in_transit → completed` (จัดส่ง) · ปลายทาง: `completed`, `rejected`, `cancelled`, `expired` · เปลี่ยนสถานะผ่าน `transition()` ที่เดียวเท่านั้น

---

## 1. ลูกค้า — `/api/liff/*`

### GET `/api/liff/shops?lat=&lng=`
รายการร้านที่ลูกค้าเลือกได้ เฉพาะร้าน `active` ที่ตั้งราคาอย่างน้อย 1 รายการ เรียงใกล้→ไกล (ไม่ส่งพิกัด → `distanceKm: null` เรียงตามชื่อ)
- `lat` กับ `lng` ส่งทั้งคู่หรือไม่ส่งเลย (ช่วง −90..90 / −180..180) ไม่งั้น 422
- `distanceKm` ปัดทศนิยม 1 ตำแหน่ง · ร้านปิดหรือพักยังอยู่ในรายการแต่ `isOpen: false` · `opensAt/closesAt` เป็น "HH:mm" เวลาไทย (ถ้าปิดอยู่คือเวลาเปิดครั้งถัดไป)
- `services` มีเฉพาะที่เปิดใช้งาน `priceSatang: null` = ราคาตามตกลง

```jsonc
// Response — HTTP 200
[
  {
    "id": "00000001-0000-4000-8000-000000000000",
    "name": "ร้านตัวอย่างปริ้นเร็ว",
    "address": "99 ถนนตัวอย่าง เชียงใหม่ (ตัวอย่างสมมติ)",
    "distanceKm": 0,
    "isOpen": true,
    "opensAt": "08:00",
    "closesAt": "20:00",
    "isPaused": false,
    "acceptsDelivery": true,
    "startingPriceSatang": 80,
    "services": [
      {
        "id": "00000002-0000-4000-8000-000000000000",
        "name": "เข้าเล่มสันกาว",
        "priceSatang": 4000,
        "unit": "per_set"
      },
      {
        "id": "00000003-0000-4000-8000-000000000000",
        "name": "เคลือบพลาสติก",
        "priceSatang": null,
        "unit": "per_order"
      }
    ]
  }
]
```

### POST `/api/liff/uploads/sign`
ขอ URL อัปโหลดไฟล์เข้า Storage โดยตรง (ไฟล์ไม่ผ่าน API) ไฟล์ละหนึ่งรายการ
- body: `{ files: [{ name, mime, sizeBytes }] }` · 1–10 ไฟล์ · `mime` ∈ `application/pdf`, `image/jpeg`, `image/png` · `sizeBytes` 1..20 MB
- ชื่อไฟล์ใน `path` ถูกแปลงเป็นอักษรอังกฤษ/ตัวเลข (ชื่อไทยล้วนจะเป็น `file`) ชื่อจริงให้ส่งใน `originalName` ตอนสร้างออเดอร์
- ลูกค้าอัปโหลดไปที่ `uploadUrl` ด้วย `token` ตามวิธีของ Supabase (`uploadToSignedUrl`) แล้วส่ง `path` กลับมาตอนสร้างออเดอร์ · ไฟล์ที่ไม่ถูกใช้ภายใน 24 ชม. ถูกลบ

```jsonc
// Request
{
  "files": [
    {"name":"รายงานประจำเดือน.pdf","mime":"application/pdf","sizeBytes":482113},
    {"name":"slides.pdf","mime":"application/pdf","sizeBytes":90311}
  ]
}
```

```jsonc
// Response — HTTP 200
[
  {
    "path": "order-files/pending/00000005-0000-4000-8000-000000000000/00000006-0000-4000-8000-000000000000-file.pdf",
    "uploadUrl": "https://<project>.supabase.co/storage/v1/object/upload/sign/order-files/pending/00000005-0000-4000-8000-000000000000/00000006-0000-4000-8000-000000000000-file.pdf?token=<signed-token>",
    "token": "<signed-token>"
  },
  {
    "path": "order-files/pending/00000005-0000-4000-8000-000000000000/00000007-0000-4000-8000-000000000000-slides.pdf",
    "uploadUrl": "https://<project>.supabase.co/storage/v1/object/upload/sign/order-files/pending/00000005-0000-4000-8000-000000000000/00000007-0000-4000-8000-000000000000-slides.pdf?token=<signed-token>",
    "token": "<signed-token>"
  }
]
```

### POST `/api/liff/estimate`
ประเมินราคา **ก่อนสั่ง** ราคาคำนวณจากรายการราคาของร้านเอง ไม่เชื่อราคาจาก request
- body: `{ shopId, fulfillment: "pickup"|"delivery", deliveryLat?, deliveryLng?, files:[{ pageCount, color, paper, sides, copies }], services?:[{ serviceId, fileIndexes? }] }`
- `files` 1–10 รายการ · `pageCount` 1..10000 · `copies` 1..99 · `fileIndexes` = ลำดับไฟล์ใน `files` (0 เริ่ม) ที่ใช้บริการ `per_set` ไม่ส่ง = ทุกไฟล์
- `delivery` ต้องมี `deliveryLat/Lng` และร้านต้องรับจัดส่ง ไม่งั้น 422 · ร้านไม่รับชุดนี้ (สี/กระดาษ/ด้าน) → 422 · บริการของร้านอื่น/ปิดอยู่/ไม่มี → 422
- **ถ้า `requiresManualPrice: true` (มีส่วนลดปริมาณหรือบริการราคาตามตกลง) ฟิลด์ราคาที่ขึ้นกับร้านเป็น `null` ทั้งหมด** แสดงข้อความ "ร้านจะแจ้งราคา" ห้ามคำนวณเอง
- `deliveryFeeSatang` เป็น **ค่าประมาณ** (ตัวอย่างใช้ค่าสมมติ 4000)

```jsonc
// Request
{
  "shopId": "00000001-0000-4000-8000-000000000000",
  "fulfillment": "pickup",
  "files": [
    {"pageCount":10,"color":"bw","paper":"A4","sides":"single","copies":2},
    {"pageCount":4,"color":"color","paper":"A4","sides":"single","copies":1}
  ],
  "services": [{"serviceId":"00000002-0000-4000-8000-000000000000","fileIndexes":[0]}]
}
```

```jsonc
// Response — HTTP 200
{
  "requiresManualPrice": false,
  "estimatedPrintSatang": 4000,
  "servicesSatang": 8000,
  "serviceLines": [
    {
      "serviceId": "00000002-0000-4000-8000-000000000000",
      "name": "เข้าเล่มสันกาว",
      "unit": "per_set",
      "unitPriceSatang": 4000,
      "quantity": 2,
      "lineTotalSatang": 8000
    }
  ],
  "platformFeeSatang": 600,
  "deliveryFeeSatang": 0,
  "totalSatang": 12600
}
```

ตัวอย่างกรณีต้องให้ร้านกำหนดราคา (120 หน้า ≥ ขั้นส่วนลด 100 หน้า):

```jsonc
// Response — HTTP 200
{
  "requiresManualPrice": true,
  "estimatedPrintSatang": null,
  "servicesSatang": null,
  "serviceLines": [],
  "platformFeeSatang": null,
  "deliveryFeeSatang": 0,
  "totalSatang": null
}
```

### POST `/api/liff/orders`
สร้างออเดอร์ (สถานะ `submitted`) ร้านมี 15 นาทีให้ตอบ (`responseDeadline`)
- body: ฟิลด์เดียวกับ estimate + `deliveryAddress, deliveryLat, deliveryLng, deliveryRecipientName, deliveryRecipientPhone` (บังคับเมื่อ `delivery`; เบอร์ไทย 9–10 หลัก รับ `081-234-5678` / `+66…`) + `customerNote?` (≤ 500) + `files:[{ path, originalName, mime, sizeBytes, pageCount, color, paper, sides, copies }]` (`path` ต้องเป็นของ `uploads/sign` ที่ลูกค้าคนนี้ขอเอง)
- `pageCount` ของรูปภาพต้องเป็น 1 · เซิร์ฟเวอร์ตรวจว่าไฟล์มีอยู่จริงใน Storage และใช้ขนาด/ชนิดที่ Storage รายงาน (ถ้า Storage ไม่ระบุมา ใช้ค่าจาก request) · ตัวอย่าง `sizeBytes` ด้านล่างปรับให้ตรงกับไฟล์ที่ส่ง
- ราคา สถานะ และผู้สั่งถูกกำหนดที่เซิร์ฟเวอร์ · ถ้า `requiresManualPrice` และสถานะ `submitted` ลูกค้าจะเห็น `estimatedPrintSatang`/`estimatedServicesSatang` เป็น `null`
- error: `SHOP_CLOSED`, `SHOP_PAUSED` (409) · ร้านไม่พบ/ไม่ active (404) · ไฟล์ไม่ใช่ของลูกค้า/ไม่พบ/ซ้ำ (422) · กดซ้ำด้วยไฟล์ชุดเดิม → 422 "ไฟล์นี้ถูกใช้ในออเดอร์อื่นแล้ว"

```jsonc
// Request
{
  "shopId": "00000001-0000-4000-8000-000000000000",
  "fulfillment": "pickup",
  "customerNote": "ขอเย็บมุมด้วยครับ",
  "files": [
    {
      "path": "order-files/pending/00000005-0000-4000-8000-000000000000/00000006-0000-4000-8000-000000000000-file.pdf",
      "originalName": "รายงานประจำเดือน.pdf",
      "mime": "application/pdf",
      "sizeBytes": 482113,
      "pageCount": 10,
      "color": "bw",
      "paper": "A4",
      "sides": "single",
      "copies": 2
    },
    {
      "path": "order-files/pending/00000005-0000-4000-8000-000000000000/00000007-0000-4000-8000-000000000000-slides.pdf",
      "originalName": "slides.pdf",
      "mime": "application/pdf",
      "sizeBytes": 90311,
      "pageCount": 4,
      "color": "color",
      "paper": "A4",
      "sides": "single",
      "copies": 1
    }
  ],
  "services": [{"serviceId":"00000002-0000-4000-8000-000000000000","fileIndexes":[0]}]
}
```

```jsonc
// Response — HTTP 200
{
  "id": "00000008-0000-4000-8000-000000000000",
  "orderNo": "PG-0001",
  "status": "submitted",
  "fulfillment": "pickup",
  "shopId": "00000001-0000-4000-8000-000000000000",
  "customerNote": "ขอเย็บมุมด้วยครับ",
  "requiresManualPrice": false,
  "estimatedPrintSatang": 4000,
  "estimatedServicesSatang": 8000,
  "printSubtotalSatang": null,
  "platformFeeSatang": null,
  "deliveryFeeSatang": 0,
  "totalSatang": null,
  "rejectReason": null,
  "responseDeadline": "2026-11-12T05:15:00.000Z",
  "paymentDeadline": null,
  "pickupCode": null,
  "readyInMinutes": null,
  "estimatedReadyAt": null,
  "readyNote": null,
  "createdAt": "2026-11-12T05:00:00.000Z",
  "updatedAt": "2026-11-12T05:00:00.000Z",
  "shopName": "ร้านตัวอย่างปริ้นเร็ว",
  "unreadMessageCount": 0
}
```

ตัวอย่างสั่งแบบจัดส่ง (ลูกค้าเห็นค่าส่ง ไม่เห็นชื่อ/เบอร์ผู้รับใน `Order` — อยู่ใน `OrderDetail` ของเจ้าของเท่านั้น):

```jsonc
// Response — HTTP 200
{
  "id": "00000015-0000-4000-8000-000000000000",
  "orderNo": "PG-0002",
  "status": "submitted",
  "fulfillment": "delivery",
  "shopId": "00000001-0000-4000-8000-000000000000",
  "customerNote": null,
  "requiresManualPrice": false,
  "estimatedPrintSatang": 2500,
  "estimatedServicesSatang": 0,
  "printSubtotalSatang": null,
  "platformFeeSatang": null,
  "deliveryFeeSatang": 4000,
  "totalSatang": null,
  "rejectReason": null,
  "responseDeadline": "2026-11-12T05:15:00.000Z",
  "paymentDeadline": null,
  "pickupCode": null,
  "readyInMinutes": null,
  "estimatedReadyAt": null,
  "readyNote": null,
  "createdAt": "2026-11-12T05:00:00.000Z",
  "updatedAt": "2026-11-12T05:00:00.000Z",
  "shopName": "ร้านตัวอย่างปริ้นเร็ว",
  "unreadMessageCount": 0
}
```

### GET `/api/liff/orders`
ออเดอร์ของฉัน ใหม่→เก่า (`Order[]`) ออเดอร์ที่เลยกำหนดจะถูกเปลี่ยนเป็น `expired` ก่อนคืน · `unreadMessageCount` = ข้อความจากร้านที่ยังไม่อ่าน

```jsonc
// Response — HTTP 200
[
  {
    "id": "00000008-0000-4000-8000-000000000000",
    "orderNo": "PG-0001",
    "status": "submitted",
    "fulfillment": "pickup",
    "shopId": "00000001-0000-4000-8000-000000000000",
    "customerNote": "ขอเย็บมุมด้วยครับ",
    "requiresManualPrice": false,
    "estimatedPrintSatang": 4000,
    "estimatedServicesSatang": 8000,
    "printSubtotalSatang": null,
    "platformFeeSatang": null,
    "deliveryFeeSatang": 0,
    "totalSatang": null,
    "rejectReason": null,
    "responseDeadline": "2026-11-12T05:15:00.000Z",
    "paymentDeadline": null,
    "pickupCode": null,
    "readyInMinutes": null,
    "estimatedReadyAt": null,
    "readyNote": null,
    "createdAt": "2026-11-12T05:00:00.000Z",
    "updatedAt": "2026-11-12T05:00:00.000Z",
    "shopName": "ร้านตัวอย่างปริ้นเร็ว",
    "unreadMessageCount": 0
  }
]
```

### GET `/api/liff/orders/:id`
`OrderDetail` ของฉัน (รวม `files`, `services`, `payment`, `delivery`, `shop`, `deliveryAddress`, `deliveryRecipientName/Phone`)
- **`pickupCode`** ส่งเฉพาะเจ้าของ เมื่อ `fulfillment = pickup` และสถานะ `paid | printing | ready` (ตัวอย่างด้านล่าง) — ลูกค้าบอกรหัสนี้ที่เคาน์เตอร์
- ไม่มี `storagePath`, `slipPath`, `slipRef`

```jsonc
// Response — HTTP 200
{
  "id": "00000008-0000-4000-8000-000000000000",
  "orderNo": "PG-0001",
  "status": "submitted",
  "fulfillment": "pickup",
  "shopId": "00000001-0000-4000-8000-000000000000",
  "customerNote": "ขอเย็บมุมด้วยครับ",
  "requiresManualPrice": false,
  "estimatedPrintSatang": 4000,
  "estimatedServicesSatang": 8000,
  "printSubtotalSatang": null,
  "platformFeeSatang": null,
  "deliveryFeeSatang": 0,
  "totalSatang": null,
  "rejectReason": null,
  "responseDeadline": "2026-11-12T05:15:00.000Z",
  "paymentDeadline": null,
  "pickupCode": null,
  "readyInMinutes": null,
  "estimatedReadyAt": null,
  "readyNote": null,
  "createdAt": "2026-11-12T05:00:00.000Z",
  "updatedAt": "2026-11-12T05:00:00.000Z",
  "shopName": "ร้านตัวอย่างปริ้นเร็ว",
  "unreadMessageCount": 0,
  "files": [
    {
      "id": "00000009-0000-4000-8000-000000000000",
      "originalName": "รายงานประจำเดือน.pdf",
      "mime": "application/pdf",
      "sizeBytes": 482113,
      "pageCount": 10,
      "color": "bw",
      "paper": "A4",
      "sides": "single",
      "copies": 2
    },
    {
      "id": "00000010-0000-4000-8000-000000000000",
      "originalName": "slides.pdf",
      "mime": "application/pdf",
      "sizeBytes": 90311,
      "pageCount": 4,
      "color": "color",
      "paper": "A4",
      "sides": "single",
      "copies": 1
    }
  ],
  "services": [
    {
      "id": "00000011-0000-4000-8000-000000000000",
      "name": "เข้าเล่มสันกาว",
      "unit": "per_set",
      "unitPriceSatang": 4000,
      "fileId": "00000009-0000-4000-8000-000000000000",
      "quantity": 2,
      "lineTotalSatang": 8000
    }
  ],
  "payment": null,
  "delivery": null,
  "deliveryAddress": null,
  "deliveryRecipientName": null,
  "deliveryRecipientPhone": null,
  "shop": {
    "id": "00000001-0000-4000-8000-000000000000",
    "name": "ร้านตัวอย่างปริ้นเร็ว",
    "address": "99 ถนนตัวอย่าง เชียงใหม่ (ตัวอย่างสมมติ)",
    "phone": "0812345678"
  }
}
```

หลังชำระเงิน (`paid`) จะมีรหัสรับงานและเวลาเสร็จประมาณ:

```jsonc
// Response — HTTP 200
{
  "id": "00000008-0000-4000-8000-000000000000",
  "orderNo": "PG-0001",
  "status": "paid",
  "fulfillment": "pickup",
  "shopId": "00000001-0000-4000-8000-000000000000",
  "customerNote": "ขอเย็บมุมด้วยครับ",
  "requiresManualPrice": false,
  "estimatedPrintSatang": 4000,
  "estimatedServicesSatang": 8000,
  "printSubtotalSatang": 12000,
  "platformFeeSatang": 600,
  "deliveryFeeSatang": 0,
  "totalSatang": 12600,
  "rejectReason": null,
  "responseDeadline": "2026-11-12T05:15:00.000Z",
  "paymentDeadline": "2026-11-12T05:30:00.000Z",
  "pickupCode": "5172",
  "readyInMinutes": 30,
  "estimatedReadyAt": "2026-11-12T05:30:00.000Z",
  "readyNote": "รับได้หลังชำระเงินประมาณ 30 นาที",
  "createdAt": "2026-11-12T05:00:00.000Z",
  "updatedAt": "2026-11-12T05:00:00.000Z",
  "shopName": "ร้านตัวอย่างปริ้นเร็ว",
  "unreadMessageCount": 0,
  "files": [
    {
      "id": "00000009-0000-4000-8000-000000000000",
      "originalName": "รายงานประจำเดือน.pdf",
      "mime": "application/pdf",
      "sizeBytes": 482113,
      "pageCount": 10,
      "color": "bw",
      "paper": "A4",
      "sides": "single",
      "copies": 2
    },
    {
      "id": "00000010-0000-4000-8000-000000000000",
      "originalName": "slides.pdf",
      "mime": "application/pdf",
      "sizeBytes": 90311,
      "pageCount": 4,
      "color": "color",
      "paper": "A4",
      "sides": "single",
      "copies": 1
    }
  ],
  "services": [
    {
      "id": "00000011-0000-4000-8000-000000000000",
      "name": "เข้าเล่มสันกาว",
      "unit": "per_set",
      "unitPriceSatang": 4000,
      "fileId": "00000009-0000-4000-8000-000000000000",
      "quantity": 2,
      "lineTotalSatang": 8000
    }
  ],
  "payment": null,
  "delivery": null,
  "deliveryAddress": null,
  "deliveryRecipientName": null,
  "deliveryRecipientPhone": null,
  "shop": {
    "id": "00000001-0000-4000-8000-000000000000",
    "name": "ร้านตัวอย่างปริ้นเร็ว",
    "address": "99 ถนนตัวอย่าง เชียงใหม่ (ตัวอย่างสมมติ)",
    "phone": "0812345678"
  }
}
```

### POST `/api/liff/orders/:id/cancel`
ลูกค้ายกเลิกเองได้ **เฉพาะก่อนชำระเงิน** (`submitted`, `awaiting_payment`) หลังชำระแล้ว → 409 `ORDER_INVALID_TRANSITION` (ติดต่อร้าน/แอดมิน)

```jsonc
// Response — HTTP 200
{
  "id": "00000017-0000-4000-8000-000000000000",
  "orderNo": "PG-0003",
  "status": "cancelled",
  "fulfillment": "pickup",
  "shopId": "00000001-0000-4000-8000-000000000000",
  "customerNote": null,
  "requiresManualPrice": false,
  "estimatedPrintSatang": 300,
  "estimatedServicesSatang": 0,
  "printSubtotalSatang": null,
  "platformFeeSatang": null,
  "deliveryFeeSatang": 0,
  "totalSatang": null,
  "rejectReason": null,
  "responseDeadline": "2026-11-12T05:15:00.000Z",
  "paymentDeadline": null,
  "pickupCode": null,
  "readyInMinutes": null,
  "estimatedReadyAt": null,
  "readyNote": null,
  "createdAt": "2026-11-12T05:00:00.000Z",
  "updatedAt": "2026-11-12T05:00:00.000Z",
  "shopName": "ร้านตัวอย่างปริ้นเร็ว",
  "unreadMessageCount": 0
}
```

ตัวอย่าง error — HTTP 409

```json
{"error":{"code":"ORDER_INVALID_TRANSITION","message":"สถานะออเดอร์เปลี่ยนไปแล้ว กรุณารีเฟรช","details":{"currentStatus":"completed","expected":["submitted","awaiting_payment"],"to":"cancelled"}}}
```

ตัวอย่าง error — HTTP 404

```json
{"error":{"code":"NOT_FOUND","message":"ไม่พบข้อมูลที่ต้องการ","details":{}}}
```

### GET `/api/liff/orders/:id/messages?after=<ISO>` และ POST `/api/liff/orders/:id/messages`
แชทผูกออเดอร์ (1 ออเดอร์ = 1 ห้อง) ลูกค้าและร้านเห็นข้อความของกันและกัน และข้อความ `system`
- **GET** เรียงเก่า→ใหม่ สูงสุด 100 · ไม่ส่ง `after` = 100 ข้อความล่าสุด · ส่ง `after` = เฉพาะที่ **ใหม่กว่า** เวลานั้น (ใช้ `createdAt` ของข้อความล่าสุดที่มีอยู่) · **ต้อง `encodeURIComponent` ค่า `after`** ไม่งั้น `+00:00` กลายเป็นช่องว่างแล้วได้ 422 · อ่านย้อนหลังได้แม้ห้องปิดแล้ว
- **POST** body `{ body }` 1–1000 ตัวอักษร ตัดช่องว่างหัวท้าย เก็บข้อความตามที่พิมพ์ (ไม่แปลง HTML ฝั่งหน้าจอต้อง escape เอง) ตัดอักขระควบคุมออก · ผู้ส่งคือผู้ล็อกอินเสมอ
- ห้องปิดเมื่อออเดอร์ `completed|rejected|cancelled|expired` → POST ได้ 409 `CHAT_CLOSED` ทันที · ส่งเกิน 20 ข้อความ/นาที/ฝั่ง/ออเดอร์ → 429
- **polling** ทุก 3–4 วินาที (ไม่ใช้ WebSocket — D15) แนะนำให้ `after` ย้อนหลัง 2–3 วินาทีแล้วตัดซ้ำด้วย `id`

```jsonc
// Request
{"body":"ขอถามหน่อยครับ รับไฟล์ที่เป็นรูปด้วยไหม"}
```

```jsonc
// Response — HTTP 200
{
  "id": "00000012-0000-4000-8000-000000000000",
  "orderId": "00000008-0000-4000-8000-000000000000",
  "sender": "customer",
  "body": "ขอถามหน่อยครับ รับไฟล์ที่เป็นรูปด้วยไหม",
  "createdAt": "2026-11-12T05:00:00.000Z"
}
```

```jsonc
// Response — HTTP 200
[]
```

ตัวอย่าง error — HTTP 422

```json
{"error":{"code":"VALIDATION_ERROR","message":"ข้อความยาวเกิน 1000 ตัวอักษร","details":{"field":"body"}}}
```

ตัวอย่าง error — HTTP 409

```json
{"error":{"code":"CHAT_CLOSED","message":"ออเดอร์นี้จบแล้ว แชทปิดแล้ว","details":{}}}
```

### POST `/api/liff/orders/:id/messages/read`
ตั้งว่าอ่านแล้วให้ข้อความของ **ร้าน** ในออเดอร์นี้ (ข้อความของฝั่งตัวเองและ `system` ไม่ถูกแตะ) ทำได้แม้ห้องปิด

```jsonc
// Response — HTTP 200
{"unreadMessageCount":0}
```

### GET `/api/liff/chats`
รายการห้องแชทของฉัน: ออเดอร์ที่ยังไม่จบ + ออเดอร์ที่จบแล้วแต่ยังมีข้อความ เรียงตามข้อความล่าสุด (ห้องที่ยังไม่มีข้อความใช้เวลาสร้างออเดอร์) `totalUnread` ไว้ทำ badge ในหน้า LIFF · ใช้จำนวน query คงที่

```jsonc
// Response — HTTP 200
{
  "totalUnread": 1,
  "chats": [
    {
      "orderId": "00000008-0000-4000-8000-000000000000",
      "orderNo": "PG-0001",
      "shopName": "ร้านตัวอย่างปริ้นเร็ว",
      "status": "paid",
      "isClosed": false,
      "lastMessage": {
        "sender": "customer",
        "body": "ขอถามหน่อยครับ รับไฟล์ที่เป็นรูปด้วยไหม",
        "createdAt": "2026-11-12T05:00:00.000Z"
      },
      "unreadMessageCount": 1
    }
  ]
}
```

---

## 2. ร้าน — ออเดอร์ `/api/shop/orders/*`

ทุก route ต้องเป็นร้าน `active` และเป็นออเดอร์ของร้านนั้น (ของร้านอื่น → 404) ผลลัพธ์ของร้าน **ไม่มี `pickupCode` และไม่มีชื่อ/เบอร์ผู้รับ** (ตรวจที่ชั้น API) ร้านเห็นราคาประเมินของระบบเสมอ แม้ออเดอร์ต้องกำหนดราคาเอง

### GET `/api/shop/orders?status=a,b`
ออเดอร์ของร้าน: งานรอยืนยัน (`submitted`) ขึ้นก่อน แล้วใหม่→เก่า · `status` คั่นด้วย `,` ได้ ค่าที่ไม่รู้จัก → 422 · ออเดอร์ที่เลยกำหนดถูกเปลี่ยนเป็น `expired` ก่อนคืน · หน้า dashboard poll ทุก 5–8 วินาที

```jsonc
// Response — HTTP 200
[
  {
    "id": "00000008-0000-4000-8000-000000000000",
    "orderNo": "PG-0001",
    "status": "submitted",
    "fulfillment": "pickup",
    "shopId": "00000001-0000-4000-8000-000000000000",
    "customerNote": "ขอเย็บมุมด้วยครับ",
    "requiresManualPrice": false,
    "estimatedPrintSatang": 4000,
    "estimatedServicesSatang": 8000,
    "printSubtotalSatang": null,
    "platformFeeSatang": null,
    "deliveryFeeSatang": 0,
    "totalSatang": null,
    "rejectReason": null,
    "responseDeadline": "2026-11-12T05:15:00.000Z",
    "paymentDeadline": null,
    "pickupCode": null,
    "readyInMinutes": null,
    "estimatedReadyAt": null,
    "readyNote": null,
    "createdAt": "2026-11-12T05:00:00.000Z",
    "updatedAt": "2026-11-12T05:00:00.000Z",
    "shopName": "ร้านตัวอย่างปริ้นเร็ว",
    "unreadMessageCount": 0
  }
]
```

### GET `/api/shop/orders/:id`
`OrderDetail` ของร้าน (มี `files`, `services`, `payment`, `delivery`, `deliveryAddress`, `shop` · ไม่มี `deliveryRecipientName/Phone`)

```jsonc
// Response — HTTP 200
{
  "id": "00000008-0000-4000-8000-000000000000",
  "orderNo": "PG-0001",
  "status": "submitted",
  "fulfillment": "pickup",
  "shopId": "00000001-0000-4000-8000-000000000000",
  "customerNote": "ขอเย็บมุมด้วยครับ",
  "requiresManualPrice": false,
  "estimatedPrintSatang": 4000,
  "estimatedServicesSatang": 8000,
  "printSubtotalSatang": null,
  "platformFeeSatang": null,
  "deliveryFeeSatang": 0,
  "totalSatang": null,
  "rejectReason": null,
  "responseDeadline": "2026-11-12T05:15:00.000Z",
  "paymentDeadline": null,
  "pickupCode": null,
  "readyInMinutes": null,
  "estimatedReadyAt": null,
  "readyNote": null,
  "createdAt": "2026-11-12T05:00:00.000Z",
  "updatedAt": "2026-11-12T05:00:00.000Z",
  "shopName": "ร้านตัวอย่างปริ้นเร็ว",
  "unreadMessageCount": 0,
  "files": [
    {
      "id": "00000009-0000-4000-8000-000000000000",
      "originalName": "รายงานประจำเดือน.pdf",
      "mime": "application/pdf",
      "sizeBytes": 482113,
      "pageCount": 10,
      "color": "bw",
      "paper": "A4",
      "sides": "single",
      "copies": 2
    },
    {
      "id": "00000010-0000-4000-8000-000000000000",
      "originalName": "slides.pdf",
      "mime": "application/pdf",
      "sizeBytes": 90311,
      "pageCount": 4,
      "color": "color",
      "paper": "A4",
      "sides": "single",
      "copies": 1
    }
  ],
  "services": [
    {
      "id": "00000011-0000-4000-8000-000000000000",
      "name": "เข้าเล่มสันกาว",
      "unit": "per_set",
      "unitPriceSatang": 4000,
      "fileId": "00000009-0000-4000-8000-000000000000",
      "quantity": 2,
      "lineTotalSatang": 8000
    }
  ],
  "payment": null,
  "delivery": null,
  "deliveryAddress": null,
  "shop": {
    "id": "00000001-0000-4000-8000-000000000000",
    "name": "ร้านตัวอย่างปริ้นเร็ว",
    "address": "99 ถนนตัวอย่าง เชียงใหม่ (ตัวอย่างสมมติ)",
    "phone": "0812345678"
  }
}
```

### GET `/api/shop/orders/:id/files/:fileId/url?mode=view|download`
Signed URL อายุ **5 นาที** ให้ร้านเปิดดู/พิมพ์ (`view` เป็นค่าเริ่มต้น) หรือดาวน์โหลด (`download` ตั้งชื่อไฟล์เป็นชื่อเดิมของลูกค้า) · ไฟล์ที่ถูกลบแล้ว/ของร้านอื่น → 404 · `mode` อื่น → 422 · ร้านดาวน์โหลดไปปริ้นได้ (D20) ลูกค้าถูกแจ้งไว้ในหน้าสั่ง

```jsonc
// Response — HTTP 200
{
  "url": "https://<project>.supabase.co/storage/v1/object/sign/order-files/00000008-0000-4000-8000-000000000000/00000006-0000-4000-8000-000000000000-file.pdf?token=<signed-token>&exp=300&download=%E0%B8%A3%E0%B8%B2%E0%B8%A2%E0%B8%87%E0%B8%B2%E0%B8%99%E0%B8%9B%E0%B8%A3%E0%B8%B0%E0%B8%88%E0%B8%B3%E0%B9%80%E0%B8%94%E0%B8%B7%E0%B8%AD%E0%B8%99.pdf",
  "expiresInSeconds": 300
}
```

### POST `/api/shop/orders/:id/confirm`
ร้านยืนยันราคาและเวลาเสร็จ (`submitted → awaiting_payment`) ระบบคำนวณค่าบริการแพลตฟอร์ม (5% ขั้นต่ำ 3 บาท) ยอดรวม และเวลาที่ลูกค้าต้องจ่ายก่อน (30 นาที) แล้วแจ้งลูกค้า (`quote_ready`)
- body: `{ printSubtotalSatang?, readyInMinutes? | estimatedReadyAt?, readyNote? }`
- **ต้องมีเวลาเสร็จอย่างใดอย่างหนึ่งเท่านั้น**: `readyInMinutes` 5–2880 (นับจากตอนลูกค้าชำระเงิน) หรือ `estimatedReadyAt` (ISO อนาคต) ไม่งั้น 422 · `readyNote` ≤ 200
- `printSubtotalSatang` = ราคาค่าปริ้นรวมบริการเสริม (ไม่รวมค่าส่ง) จำนวนเต็ม 1..10,000,000 · **ถ้าออเดอร์ `requiresManualPrice` ต้องส่ง** ไม่งั้น 409 `MANUAL_PRICE_REQUIRED` · ถ้าไม่ manual และไม่ส่ง ใช้ราคาประเมินของระบบ (ส่งมา = ร้านแก้ราคา)
- ค่าส่งใช้ค่าที่ลูกค้าเห็นตอนสั่ง (`deliveryFeeSatang` ที่เก็บไว้) **ไม่ได้ quote ใหม่ตอน confirm** ซึ่งต่างจาก CONTRACTS ข้อ 7 ดูหัวข้อ 5 ข้อ 14 · กดซ้ำ/ออเดอร์เปลี่ยนไปแล้ว/เลยเวลาตอบแล้ว → 409

```jsonc
// Request
{"readyInMinutes":30,"readyNote":"รับได้หลังชำระเงินประมาณ 30 นาที"}
```

```jsonc
// Response — HTTP 200
{
  "id": "00000008-0000-4000-8000-000000000000",
  "orderNo": "PG-0001",
  "status": "awaiting_payment",
  "fulfillment": "pickup",
  "shopId": "00000001-0000-4000-8000-000000000000",
  "customerNote": "ขอเย็บมุมด้วยครับ",
  "requiresManualPrice": false,
  "estimatedPrintSatang": 4000,
  "estimatedServicesSatang": 8000,
  "printSubtotalSatang": 12000,
  "platformFeeSatang": 600,
  "deliveryFeeSatang": 0,
  "totalSatang": 12600,
  "rejectReason": null,
  "responseDeadline": "2026-11-12T05:15:00.000Z",
  "paymentDeadline": "2026-11-12T05:30:00.000Z",
  "pickupCode": null,
  "readyInMinutes": 30,
  "estimatedReadyAt": null,
  "readyNote": "รับได้หลังชำระเงินประมาณ 30 นาที",
  "createdAt": "2026-11-12T05:00:00.000Z",
  "updatedAt": "2026-11-12T05:00:00.000Z",
  "shopName": "ร้านตัวอย่างปริ้นเร็ว",
  "unreadMessageCount": 0
}
```

ตัวอย่าง error — HTTP 409

```json
{"error":{"code":"ORDER_INVALID_TRANSITION","message":"สถานะออเดอร์เปลี่ยนไปแล้ว กรุณารีเฟรช","details":{"currentStatus":"awaiting_payment","expected":["submitted"],"to":"awaiting_payment"}}}
```

ตัวอย่าง error — HTTP 422

```json
{"error":{"code":"VALIDATION_ERROR","message":"ข้อมูลที่ส่งมาไม่ถูกต้อง","details":{"issues":[{"path":"","message":"ต้องระบุเวลาเสร็จอย่างใดอย่างหนึ่ง (readyInMinutes หรือ estimatedReadyAt)"}]}}}
```

### POST `/api/shop/orders/:id/eta`
ร้านเลื่อน/ปรับเวลาเสร็จหลังลูกค้าจ่ายแล้ว (เฉพาะ `paid`, `printing` ที่อื่น → 409) · body `{ estimatedReadyAt, readyNote? }` เวลาต้องอยู่ในอนาคต · ไม่ส่ง `readyNote` = คงข้อความเดิม · ไม่เปลี่ยนสถานะ ไม่แตะ `readyInMinutes` · แจ้งลูกค้า (`eta_changed`) และเพิ่มข้อความ `system` ในแชท · ลูกค้ายกเลิกเองไม่ได้เพราะการเลื่อน

```jsonc
// Response — HTTP 200
{
  "id": "00000008-0000-4000-8000-000000000000",
  "orderNo": "PG-0001",
  "status": "paid",
  "fulfillment": "pickup",
  "shopId": "00000001-0000-4000-8000-000000000000",
  "customerNote": "ขอเย็บมุมด้วยครับ",
  "requiresManualPrice": false,
  "estimatedPrintSatang": 4000,
  "estimatedServicesSatang": 8000,
  "printSubtotalSatang": 12000,
  "platformFeeSatang": 600,
  "deliveryFeeSatang": 0,
  "totalSatang": 12600,
  "rejectReason": null,
  "responseDeadline": "2026-11-12T05:15:00.000Z",
  "paymentDeadline": "2026-11-12T05:30:00.000Z",
  "pickupCode": null,
  "readyInMinutes": 30,
  "estimatedReadyAt": "2026-11-12T07:00:00.000Z",
  "readyNote": "เครื่องพิมพ์ขัดข้อง ขอเลื่อนประมาณ 2 ชั่วโมง",
  "createdAt": "2026-11-12T05:00:00.000Z",
  "updatedAt": "2026-11-12T05:00:00.000Z",
  "shopName": "ร้านตัวอย่างปริ้นเร็ว",
  "unreadMessageCount": 0
}
```

### POST `/api/shop/orders/:id/reject`
ปฏิเสธออเดอร์ body `{ reason }` (3–300 ตัวอักษร) · จาก `submitted` ได้ · จาก `paid|printing` (เช่น เปิดไฟล์ไม่ได้) จะสร้างรายการคืนเงินเต็มจำนวน (`pending` แอดมินโอนคืนเอง) · สถานะอื่น → 409

```jsonc
// Response — HTTP 200
{
  "id": "00000015-0000-4000-8000-000000000000",
  "orderNo": "PG-0002",
  "status": "rejected",
  "fulfillment": "delivery",
  "shopId": "00000001-0000-4000-8000-000000000000",
  "customerNote": null,
  "requiresManualPrice": false,
  "estimatedPrintSatang": 2500,
  "estimatedServicesSatang": 0,
  "printSubtotalSatang": null,
  "platformFeeSatang": null,
  "deliveryFeeSatang": 4000,
  "totalSatang": null,
  "rejectReason": "ขณะนี้หมึกสีหมด ขออภัยครับ",
  "responseDeadline": "2026-11-12T05:15:00.000Z",
  "paymentDeadline": null,
  "pickupCode": null,
  "readyInMinutes": null,
  "estimatedReadyAt": null,
  "readyNote": null,
  "createdAt": "2026-11-12T05:00:00.000Z",
  "updatedAt": "2026-11-12T05:00:00.000Z",
  "shopName": "ร้านตัวอย่างปริ้นเร็ว",
  "unreadMessageCount": 0
}
```

### POST `/api/shop/orders/:id/start-printing`
`paid → printing` (ไม่มี body)

```jsonc
// Response — HTTP 200
// แสดงบางฟิลด์ รูปแบบเต็มคือ Order (CONTRACTS 6.6)
{
  "id": "00000008-0000-4000-8000-000000000000",
  "orderNo": "PG-0001",
  "status": "printing",
  "fulfillment": "pickup",
  "pickupCode": null,
  "estimatedReadyAt": "2026-11-12T07:00:00.000Z",
  "readyNote": "เครื่องพิมพ์ขัดข้อง ขอเลื่อนประมาณ 2 ชั่วโมง",
  "unreadMessageCount": 0
}
```

### POST `/api/shop/orders/:id/mark-ready`
`printing → ready` (ไม่มี body) · **ถ้าเป็นออเดอร์จัดส่ง ระบบต่อด้วย `courier_requested` ทันที** ผลที่ได้จึงเป็น `courier_requested` (ให้แอดมินเห็นงานเรียกไรเดอร์) ถ้าขั้นต่อล้มจะได้ `ready` ตามที่เก็บจริง

```jsonc
// Response — HTTP 200
// แสดงบางฟิลด์ รูปแบบเต็มคือ Order (CONTRACTS 6.6)
{
  "id": "00000008-0000-4000-8000-000000000000",
  "orderNo": "PG-0001",
  "status": "ready",
  "fulfillment": "pickup",
  "pickupCode": null,
  "estimatedReadyAt": "2026-11-12T07:00:00.000Z",
  "readyNote": "เครื่องพิมพ์ขัดข้อง ขอเลื่อนประมาณ 2 ชั่วโมง",
  "unreadMessageCount": 0
}
```

### POST `/api/shop/orders/:id/complete`
ส่งมอบงานรับเอง: ร้านพิมพ์ **รหัสรับงาน 4 หลักที่ลูกค้าบอก** body `{ pickupCode }` (ช่องว่างไม่สนใจ) · ได้เฉพาะ `ready` + `pickup` ไม่งั้น 409 (ไม่นับครั้งลอง) · รหัสผิด → 422 · **ผิดเกิน 5 ครั้ง/10 นาที/ออเดอร์ → 429 `RATE_LIMITED`** (ช่วงล็อกไม่ยืดถ้ากดซ้ำ) · ไม่มีรหัสในผลตอบกลับและ log

ตัวอย่าง error — HTTP 422

```json
{"error":{"code":"VALIDATION_ERROR","message":"รหัสรับงานไม่ถูกต้อง","details":{"field":"pickupCode"}}}
```

```jsonc
// Response — HTTP 200
// แสดงบางฟิลด์ รูปแบบเต็มคือ Order (CONTRACTS 6.6)
{
  "id": "00000008-0000-4000-8000-000000000000",
  "orderNo": "PG-0001",
  "status": "completed",
  "fulfillment": "pickup",
  "pickupCode": null,
  "estimatedReadyAt": "2026-11-12T07:00:00.000Z",
  "readyNote": "เครื่องพิมพ์ขัดข้อง ขอเลื่อนประมาณ 2 ชั่วโมง",
  "unreadMessageCount": 0
}
```

### GET/POST `/api/shop/orders/:id/messages` และ POST `/api/shop/orders/:id/messages/read`
เหมือนฝั่งลูกค้า (ผู้ส่งเป็น `shop`; `read` ล้างข้อความของ **ลูกค้า**) · ร้าน `pending` ใช้ไม่ได้ (403) · เมื่อร้านส่งข้อความ ระบบแจ้งลูกค้าทาง LINE **เฉพาะเมื่อไม่มีข้อความร้านก่อนหน้าที่ยังไม่อ่านค้าง** (ส่ง 3 ข้อความติด = แจ้ง 1 ครั้ง) ฝั่งร้านก็ถูกแจ้งเมื่อ **ลูกค้า** ส่งข้อความ (`notifyShop` Web Push ด้วยกติกาเดียวกัน: ไม่แจ้งซ้ำถ้ายังมีข้อความลูกค้าที่ร้านยังไม่อ่านค้าง) และหน้า dashboard ที่เปิดอยู่ให้ poll ทุก 3–4 วินาที

```jsonc
// Request
{"body":"รับค่ะ ส่งมาได้เลย"}
```

```jsonc
// Response — HTTP 200
{
  "id": "00000013-0000-4000-8000-000000000000",
  "orderId": "00000008-0000-4000-8000-000000000000",
  "sender": "shop",
  "body": "รับค่ะ ส่งมาได้เลย",
  "createdAt": "2026-11-12T05:00:00.000Z"
}
```

```jsonc
// Response — HTTP 200
[
  {
    "id": "00000013-0000-4000-8000-000000000000",
    "orderId": "00000008-0000-4000-8000-000000000000",
    "sender": "shop",
    "body": "รับค่ะ ส่งมาได้เลย",
    "createdAt": "2026-11-12T05:00:00.000Z"
  },
  {
    "id": "00000012-0000-4000-8000-000000000000",
    "orderId": "00000008-0000-4000-8000-000000000000",
    "sender": "customer",
    "body": "ขอถามหน่อยครับ รับไฟล์ที่เป็นรูปด้วยไหม",
    "createdAt": "2026-11-12T05:00:00.000Z"
  }
]
```

```jsonc
// Response — HTTP 200
{"unreadMessageCount":0}
```

### GET `/api/shop/chats`
เหมือน `/api/liff/chats` แต่เป็นห้องของออเดอร์ร้านฉัน `unreadMessageCount` = ข้อความของลูกค้าที่ยังไม่อ่าน

```jsonc
// Response — HTTP 200
{
  "totalUnread": 1,
  "chats": [
    {
      "orderId": "00000008-0000-4000-8000-000000000000",
      "orderNo": "PG-0001",
      "shopName": "ร้านตัวอย่างปริ้นเร็ว",
      "status": "paid",
      "isClosed": false,
      "lastMessage": {
        "sender": "customer",
        "body": "ขอถามหน่อยครับ รับไฟล์ที่เป็นรูปด้วยไหม",
        "createdAt": "2026-11-12T05:00:00.000Z"
      },
      "unreadMessageCount": 1
    }
  ]
}
```

---

## 3. ร้าน — สมัครและตั้งค่า (`/api/shop/*`)

ร้านที่ยังไม่อนุมัติ (`pending`) ตั้งค่าได้ แต่ไม่โผล่ให้ลูกค้าและเรียก `orders`/`chats` ไม่ได้ (403) ร้านจะโผล่ให้ลูกค้าเมื่อ **`active` และมีรายการราคาอย่างน้อย 1 รายการ** ผลของการแก้ราคา/บริการใช้ได้ทันทีกับ `estimate` และรายการร้าน

### GET `/api/shop/me`
สถานะของผู้ล็อกอิน (`requireAuthUser`) · `state` = `no_profile | pending | active | suspended` · แอดมิน/คนที่ยังไม่มีร้านได้ `no_profile` → พาไปฟอร์มสมัคร

```jsonc
// Response — HTTP 200
{"state":"no_profile","shop":null}
```

```jsonc
// Response — HTTP 200
{
  "state": "pending",
  "shop": {
    "id": "00000001-0000-4000-8000-000000000000",
    "name": "ร้านตัวอย่างปริ้นเร็ว",
    "phone": "0812345678",
    "address": "99 ถนนตัวอย่าง เชียงใหม่ (ตัวอย่างสมมติ)",
    "lat": 18.7953,
    "lng": 98.9534,
    "status": "pending",
    "isPaused": false,
    "acceptsDelivery": true,
    "cutoffMinutes": 30
  }
}
```

### POST `/api/shop/register`
สมัครร้าน (D23): สร้างร้านสถานะ `pending` ผูกกับผู้ล็อกอิน · body `{ name, phone, address, lat, lng, acceptsDelivery }` · `name` 1–80, `phone` เบอร์ไทย 9–10 หลัก (เก็บเป็น `0xxxxxxxxx`), `address` 1–300, `lat/lng` ช่วงถูกต้อง · **ไม่สร้างราคาหรือเวลาเปิดให้เอง** · หนึ่งผู้ใช้หนึ่งร้าน มีโปรไฟล์อยู่แล้ว → 409 `ALREADY_REGISTERED` · ส่ง `status` มาก็ไม่มีผล แอดมินเป็นคนอนุมัติ

```jsonc
// Request
{
  "name": "ร้านตัวอย่างปริ้นเร็ว",
  "phone": "081-234-5678",
  "address": "99 ถนนตัวอย่าง เชียงใหม่ (ตัวอย่างสมมติ)",
  "lat": 18.7953,
  "lng": 98.9534,
  "acceptsDelivery": true
}
```

```jsonc
// Response — HTTP 200
{
  "id": "00000001-0000-4000-8000-000000000000",
  "name": "ร้านตัวอย่างปริ้นเร็ว",
  "phone": "0812345678",
  "address": "99 ถนนตัวอย่าง เชียงใหม่ (ตัวอย่างสมมติ)",
  "lat": 18.7953,
  "lng": 98.9534,
  "status": "pending",
  "isPaused": false,
  "acceptsDelivery": true,
  "cutoffMinutes": 30
}
```

### GET/PUT `/api/shop/profile`
PUT ต้องส่งครบ: `{ name, phone, address, lat, lng, acceptsDelivery, cutoffMinutes, isPaused }` · `cutoffMinutes` 0–240 (นาทีก่อนปิดที่เลิกรับงานใหม่) · `isPaused: true` = พักรับงาน · **แก้ `status` ไม่ได้**

```jsonc
// Request
{
  "name": "ร้านตัวอย่างปริ้นเร็ว",
  "phone": "0812345678",
  "address": "99 ถนนตัวอย่าง เชียงใหม่ (ตัวอย่างสมมติ)",
  "lat": 18.7953,
  "lng": 98.9534,
  "acceptsDelivery": true,
  "cutoffMinutes": 30,
  "isPaused": false
}
```

```jsonc
// Response — HTTP 200
{
  "id": "00000001-0000-4000-8000-000000000000",
  "name": "ร้านตัวอย่างปริ้นเร็ว",
  "phone": "0812345678",
  "address": "99 ถนนตัวอย่าง เชียงใหม่ (ตัวอย่างสมมติ)",
  "lat": 18.7953,
  "lng": 98.9534,
  "status": "pending",
  "isPaused": false,
  "acceptsDelivery": true,
  "cutoffMinutes": 30
}
```

### GET/PUT `/api/shop/hours`
เวลาเปิด-ปิด 7 วัน ส่งครบ 7 รายการ (`weekday` 0=อาทิตย์ … 6) ไม่ซ้ำ · `openTime`/`closeTime` รูป `HH:mm` (`closeTime` เป็น `24:00` ได้) · วันที่เปิดต้อง `closeTime > openTime` · วันที่ `isClosed: true` ยังต้องส่งเวลามา · แทนที่ทั้งชุดด้วยคำสั่งเดียว · **ร้านที่ยังไม่เคยตั้งจะได้ `[]`** (ไม่มีค่าเริ่มต้น) · ผลลัพธ์เป็น `HH:mm`

```jsonc
// Response — HTTP 200
[]
```

```jsonc
// Request
[
  {"weekday":0,"openTime":"08:00","closeTime":"20:00","isClosed":true},
  {"weekday":1,"openTime":"08:00","closeTime":"20:00","isClosed":false},
  {"weekday":2,"openTime":"08:00","closeTime":"20:00","isClosed":false},
  {"weekday":3,"openTime":"08:00","closeTime":"20:00","isClosed":false},
  {"weekday":4,"openTime":"08:00","closeTime":"20:00","isClosed":false},
  {"weekday":5,"openTime":"08:00","closeTime":"20:00","isClosed":false},
  {"weekday":6,"openTime":"08:00","closeTime":"20:00","isClosed":false}
]
```

```jsonc
// Response — HTTP 200
[
  {"weekday":0,"openTime":"08:00","closeTime":"20:00","isClosed":true},
  {"weekday":1,"openTime":"08:00","closeTime":"20:00","isClosed":false},
  /* … อีก 5 รายการ */
]
```

### GET/PUT `/api/shop/pricing`
`{ rules:[{ color, paper, sides, pricePerPageSatang }], tiers:[{ minPages, note }] }` · ราคา/หน้า 1..10,000 สตางค์ · ชุด สี/กระดาษ/ด้าน ไม่ซ้ำ (ไม่เกิน 8) · `minPages` ≥ 1 ไม่ซ้ำ (ไม่เกิน 20) `note` ≤ 200 · tier คือ "ถ้าจำนวนหน้ารวมทั้งออเดอร์ ≥ `minPages` ร้านต้องกรอกราคาเอง" · แทนที่ทั้งชุด · **ส่ง `rules: []` ได้ (ร้านจะหายจากรายการลูกค้าจนกว่าจะตั้งใหม่)** · ร้านที่ยังไม่ตั้งได้ `{ "rules": [], "tiers": [] }`

```jsonc
// Response — HTTP 200
{"rules":[],"tiers":[]}
```

```jsonc
// Request
{
  "rules": [
    {"color":"bw","paper":"A4","sides":"single","pricePerPageSatang":100},
    {"color":"bw","paper":"A4","sides":"double","pricePerPageSatang":80},
    {"color":"color","paper":"A4","sides":"single","pricePerPageSatang":500}
  ],
  "tiers": [{"minPages":100,"note":"สั่งตั้งแต่ 100 หน้า ราคาตามตกลง"}]
}
```

```jsonc
// Response — HTTP 200
{
  "rules": [
    {"color":"bw","paper":"A4","sides":"double","pricePerPageSatang":80},
    {"color":"bw","paper":"A4","sides":"single","pricePerPageSatang":100},
    {"color":"color","paper":"A4","sides":"single","pricePerPageSatang":500}
  ],
  "tiers": [{"minPages":100,"note":"สั่งตั้งแต่ 100 หน้า ราคาตามตกลง"}]
}
```

### GET/POST `/api/shop/services` และ PUT/DELETE `/api/shop/services/:id`
บริการเสริมของร้าน (เข้าเล่ม ปกใส ฯลฯ — D22) · GET คืนทั้งที่เปิดและปิด เรียงตาม `sortOrder` · POST `{ name, priceSatang | null, unit }` (`name` 1–60, `priceSatang` null = ราคาตามตกลง หรือ 1..1,000,000, `unit` = `per_set` คิดต่อชุดของไฟล์ที่เลือก | `per_order` คิดครั้งเดียว) · **ไม่เกิน 20 รายการ** (เกิน → 422) · PUT ต้องส่งครบ `{ name, priceSatang, unit, isActive, sortOrder }` · DELETE ลบจริง (ออเดอร์เก่าเก็บสำเนาชื่อ/ราคาไว้) · ของร้านอื่น → 404 · บริการที่ปิด (`isActive: false`) ไม่โผล่ให้ลูกค้า

```jsonc
// Request
{"name":"เข้าเล่มสันกาว","priceSatang":3500,"unit":"per_set"}
```

```jsonc
// Response — HTTP 200
{
  "id": "00000002-0000-4000-8000-000000000000",
  "name": "เข้าเล่มสันกาว",
  "priceSatang": 3500,
  "unit": "per_set",
  "isActive": true,
  "sortOrder": 0
}
```

```jsonc
// Request
{"name":"เคลือบพลาสติก","priceSatang":null,"unit":"per_order"}
```

```jsonc
// Response — HTTP 200
{
  "id": "00000003-0000-4000-8000-000000000000",
  "name": "เคลือบพลาสติก",
  "priceSatang": null,
  "unit": "per_order",
  "isActive": true,
  "sortOrder": 1
}
```

```jsonc
// Response — HTTP 200
[
  {
    "id": "00000002-0000-4000-8000-000000000000",
    "name": "เข้าเล่มสันกาว",
    "priceSatang": 3500,
    "unit": "per_set",
    "isActive": true,
    "sortOrder": 0
  },
  {
    "id": "00000003-0000-4000-8000-000000000000",
    "name": "เคลือบพลาสติก",
    "priceSatang": null,
    "unit": "per_order",
    "isActive": true,
    "sortOrder": 1
  },
  {
    "id": "00000004-0000-4000-8000-000000000000",
    "name": "ปกใส",
    "priceSatang": 2000,
    "unit": "per_order",
    "isActive": true,
    "sortOrder": 2
  }
]
```

```jsonc
// Response — HTTP 200
{
  "id": "00000002-0000-4000-8000-000000000000",
  "name": "เข้าเล่มสันกาว",
  "priceSatang": 4000,
  "unit": "per_set",
  "isActive": true,
  "sortOrder": 0
}
```

```jsonc
// Response — HTTP 200
{"ok":true}
```

### POST `/api/shop/push/subscribe` และ `/api/shop/push/unsubscribe`
บันทึก/ลบอุปกรณ์สำหรับ Web Push ของร้าน (D17) · ร้าน `pending` ใช้ได้ · subscribe body คือ `PushSubscription.toJSON()`: `{ endpoint (https), keys: { p256dh, auth } }` · อุปกรณ์เดิมของร้านเดิม = อัปเดตคีย์ · **endpoint ที่ผูกกับร้านอื่นอยู่แล้ว → 422 ไม่ย้ายให้** · unsubscribe ลบเฉพาะของร้านตัวเอง ตอบ `{ ok: true }` เสมอ

```jsonc
// Request
{
  "endpoint": "https://push.example.com/send/abc123",
  "keys": {
    "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
    "auth": "tBHItJI5svbpez7KI4CCXg"
  }
}
```

```jsonc
// Response — HTTP 200
{"ok":true}
```

```jsonc
// Response — HTTP 200
{"ok":true}
```

ตัวอย่าง error — HTTP 403

```json
{"error":{"code":"FORBIDDEN","message":"คุณไม่มีสิทธิ์ทำรายการนี้","details":{}}}
```

---

## 4. Cron — `/api/cron/*`

ต้องมี `Authorization: Bearer <CRON_SECRET>` · **รับทั้ง `POST` (ตามสัญญา) และ `GET` (Vercel Cron เรียกแบบ GET)** · รันซ้ำได้ปลอดภัย · Vercel Hobby รันได้วันละครั้ง จึงใช้ lazy-expiry เป็นหลัก (ทุก endpoint ที่อ่านออเดอร์ตรวจเวลาหมดอายุให้เอง) cron เป็นตัวกวาดสำรอง

### `/api/cron/expire-orders`
ทำให้ออเดอร์ที่ร้านไม่ตอบใน 15 นาที (`submitted`) หรือลูกค้าไม่จ่ายใน 30 นาที (`awaiting_payment`) เป็น `expired` และแจ้งลูกค้า (`order_expired`) · ไม่เกิน 500 ใบต่อรอบ · ใบที่ล้มไม่ทำให้ทั้งรอบล้ม · ลบแถวบันทึกการลองรหัสรับงานที่เก่ากว่า 1 วันด้วย (`pickupAttemptsDeleted`)

```jsonc
// Response — HTTP 200
{"expired":0,"alreadyChanged":0,"failed":0,"pickupAttemptsDeleted":0}
```

ตัวอย่าง error — HTTP 401

```json
{"error":{"code":"UNAUTHENTICATED","message":"กรุณาเข้าสู่ระบบ","details":{}}}
```

### `/api/cron/cleanup-files`
ลบไฟล์ที่ระบบเก็บไว้: ของออเดอร์ที่จบเกิน 7 วัน และไฟล์อัปโหลดค้าง (`pending/`) เกิน 24 ชม. (ไม่รวมสำเนาที่ร้านดาวน์โหลดไปแล้ว)

```jsonc
// Response — HTTP 200
{"orderFilesDeleted":0,"pendingDeleted":0}
```

---

## 5. ที่โค้ดจริงต่างหรือเพิ่มจาก CONTRACTS (ให้ซีตัดสิน)

ผมไม่ได้แก้ CONTRACTS ข้อใดเอง

| # | เรื่อง | สัญญา | โค้ดจริง |
|---|---|---|---|
| 1 | Cron | `POST` | รับ `POST` และ `GET` (Vercel Cron เรียก GET) ยังไม่มี `vercel.json` จึงยังไม่มีอะไรเรียก cron อัตโนมัติ |
| 2 | `GET /api/shop/hours` | 7 รายการ | ร้านที่ยังไม่ตั้งได้ `[]` (หน้าตั้งค่าของอาร์มต้องรับกรณีว่าง) ผลเป็น `HH:mm` |
| 3 | `PUT /api/shop/pricing` | — | ส่ง `rules: []` ได้ → ร้านที่ active หายจากรายการลูกค้าทันที (ควรตัดสินว่าจะยอมหรือบังคับ ≥ 1 รายการ) |
| 4 | Push ของ endpoint ที่ผูกร้านอื่น | upsert ตาม `endpoint` | ปฏิเสธ 422 ไม่ย้ายให้ร้านใหม่ (กันแย่งการแจ้งเตือน) ผลคือเครื่องที่สลับบัญชีร้านต้อง unsubscribe ของเดิมก่อน |
| 5 | `GET /api/shop/me` ของแอดมิน | — | `no_profile` (`ShopMe` ไม่มีสถานะแอดมิน) แอดมินที่เปิดหน้าร้านจะถูกพาไปฟอร์มสมัครแล้วได้ 409 |
| 6 | ไฟล์: `path` | `order-files/…` | `path` ใน API และ `order_files.storage_path` ใช้รูปเต็มมี `order-files/` นำหน้า ชื่อไฟล์ใน key เป็นอักษรอังกฤษ/ตัวเลข นามสกุลมาจาก mime |
| 7 | ชื่อ field ยอดบริการเสริม | 6.1 `servicesSatang` · 6.6 `estimatedServicesSatang` | API ใช้ตามแต่ละที่ (estimate → `servicesSatang`, `Order` → `estimatedServicesSatang`) สัญญาควรเหลือชื่อเดียว |
| 8 | ผลข้างเคียงที่สัญญาไม่ได้ระบุ | — | แอดมินยกเลิกต้องมีเหตุผลและถูกเก็บใน `orders.reject_reason` (ลูกค้าและร้านเห็นได้) · notify ของ `completed`, `in_transit`, ลูกค้ายกเลิก ใช้ event ชื่อเดียวกับสถานะ |
| 9 | ราคาประมาณหลัง `submitted` | หมายเหตุ 6.6 ซ่อนเฉพาะ `submitted` | ซ่อนเฉพาะ `submitted` ตามตัวอักษร ถ้าออเดอร์ manual ไปเป็น `rejected/expired/cancelled` ลูกค้าจะเห็นราคาประเมินของระบบ (ขัดเจตนากฎ "ห้ามส่งราคาให้ลูกค้าเอง" ควรให้ซีตัดสิน) |
| 10 | ยกเลิกตอน `awaiting_payment` | — | ลูกค้ายกเลิกได้แม้มีสลิปรอตรวจ (โอนแล้ว) และไม่มี refund |
| 11 | `/chats` | query เดียว | จำนวน query คงที่ แต่ PostgREST ตัดที่ 1,000 แถว ถ้าข้อความมาก ห้องเก่าอาจไม่มีข้อความล่าสุด ควรทำ view/RPC |
| 12 | `expireIfDue` | `(order)` | มีพารามิเตอร์ `now` เพิ่ม (ไม่บังคับ) ไว้ทดสอบ |
| 13 | ตัวนับรหัสรับงาน | — | ใช้ตาราง `webhook_events` ชั่วคราว (`source = 'pickup_attempt'`) ควรมีตารางเฉพาะ |
| 14 | ค่าส่งตอน confirm | ข้อ 7: พลุเรียก `quoteDelivery` ใน `/estimate` และ confirm | confirm ใช้ `deliveryFeeSatang` ที่เก็บไว้ตอนสร้างออเดอร์ ไม่เรียก `quoteDelivery` ใหม่ (เรื่องเงิน ให้ซีตัดสิน) |
| 15 | `pickupCode` ฝั่งร้าน | 6.2: "ไม่มี pickupCode" | key `pickupCode` ยังอยู่ใน `Order`/`OrderDetail` ที่ร้านได้ แต่ค่าเป็น `null` เสมอ (ค่าไม่หลุด รูปแบบต่างจากสัญญา) |
| 16 | แชท | ข้อ 7 กำหนดกติกา "ไม่แจ้งซ้ำ" ฝั่งร้าน→ลูกค้า | ใช้กติกาเดียวกันกับฝั่งลูกค้า→ร้านด้วย (`notifyShop`) · จำกัด 20 ข้อความ/นาที/ฝั่ง/ออเดอร์ (→ 429 `RATE_LIMITED`) เป็นของที่เพิ่มขึ้นเอง ("เช่น 20" ใน task) |
| 17 | รหัสรับงานผิด | — | ตอบ 422 `VALIDATION_ERROR` (สัญญาไม่ได้กำหนดรหัส) ผิดเกิน 5 ครั้ง → 429 |
| 18 | ราคาประมาณหลังร้านยืนยัน (ต่อจากข้อ 9) | — | ตั้งแต่ `awaiting_payment` ลูกค้าเห็นราคาที่ร้านกรอกคู่กับ `estimatedPrintSatang` (ราคาประเมินของระบบก่อนกรอก) ซึ่งอาจต่างกัน หน้าจอควรแสดงเฉพาะราคาที่ร้านยืนยัน |
| 19 | รายการไม่แบ่งหน้า | — | `GET /api/liff/orders`, `GET /api/shop/orders`, `/chats` ไม่มีการแบ่งหน้า PostgREST ตัดที่ 1,000 แถว (เกินสเกล demo) |

---

## 6. ที่ยังเป็น stub / ยังไม่ได้ทดสอบกับของจริง

- **`notify()` (LINE), `notifyShop()` (Web Push), `quoteDelivery()` / `createDeliveryForOrder()`** ของซียังเป็น stub: endpoint ที่เรียกมันทำงานครบ แต่ **ยังไม่มีข้อความ LINE/แจ้งเตือนส่งถึงใครจริง** และค่าส่งเป็นค่าประมาณสมมติ (`4000` สตางค์) · ข้อความ `push_sent_at` ในแชทแปลว่า "เรียก notify แล้วไม่ error"
- **API ชำระเงิน (`/api/payments/*`) เป็นของอาร์ม** ไม่อยู่ในเอกสารนี้ · ตัวอย่างข้างต้นใช้ `transition()` เปลี่ยนเป็น `paid` แทนการชำระเงินจริง · API ชำระเงินต้องเรียก `expireIfDue` ก่อนรับสลิป
- ทุก test ของพลุรันกับฐานข้อมูล/Storage จำลองในหน่วยความจำ **ยังไม่เคยรันกับ Supabase/Postgres จริง** ผลที่ต้องดูกับของจริงก่อนเดโม: สร้างออเดอร์พร้อมย้ายไฟล์, signed URL อัปโหลด/ดาวน์โหลด, cleanup, cron, สมัครร้าน
- การสร้างออเดอร์ สมัครร้าน และแทนที่ราคา **ไม่ใช่ทรานแซกชันจริง** (supabase-js ไม่มี) ใช้การบันทึกตามลำดับแล้วชดเชยเมื่อล้ม ควรให้ซีทำ RPC

- **การเปลี่ยนสถานะที่มีผลข้างเคียงเรื่องเงินก็ไม่เป็นอะตอมมิก:** `transition()` อัปเดตสถานะก่อน แล้วค่อยสร้างแถว `settlements` (ตอน `paid`) หรือ `refunds` (ตอนปฏิเสธ/แอดมินยกเลิกหลังจ่าย) ถ้าขั้นหลังล้ม ผู้เรียกได้ 500 แต่สถานะเปลี่ยนไปแล้ว และกดซ้ำได้ 409 จึง **ไม่มีทางสร้างแถวเงินที่ขาดให้อีก** (ร้านปฏิเสธหลังจ่ายอาจไม่มีรายการคืนเงิน / ออเดอร์ที่จ่ายแล้วอาจไม่มี settlement) มี log ไว้เท่านั้น ต้องให้ซีทำ RPC แบบทรานแซกชัน หรือมีงานกวาดเติมแถวที่ขาด หรือให้แอดมินเห็นออเดอร์ที่ไม่มีแถวเงิน
- **cron ยังไม่ถูกเรียกอัตโนมัติ (ยังไม่มี `vercel.json`):** ไฟล์ลูกค้าจึง **ยังไม่ถูกลบ** ทั้งแบบ 7 วันหลังออเดอร์จบและแบบ pending 24 ชม. (กระทบ CLAUDE.md กฎข้อ 5) และออเดอร์ที่ไม่มีใครเปิดดูจะไม่หมดอายุจนกว่าจะมีคนอ่านหรือซีตั้งเวลา cron
- **`createService` นับ 20 รายการแล้วค่อยเพิ่ม** ไม่เป็นอะตอมมิก กดพร้อมกันอาจเกิน 20 เล็กน้อย

## 7. ข้อควรรู้สำหรับหน้าจอ

- **409 `ORDER_INVALID_TRANSITION`** = มีคนเปลี่ยนออเดอร์ไปแล้ว ให้โหลดออเดอร์ใหม่ (ไม่ใช่ error ร้ายแรง) เช่น ลูกค้ากดยกเลิกพร้อมร้านกดยืนยัน
- **หมดอายุ** ตรวจตอนอ่านออเดอร์ ออเดอร์ที่ร้านไม่ตอบ 15 นาทีจะกลายเป็น `expired` ในการโหลดครั้งถัดไป จึงควรโพลต่อเนื่องในหน้าร้าน
- **ราคา manual:** ถ้า `requiresManualPrice` ฝั่งลูกค้าแสดง "ร้านจะแจ้งราคา" จนกว่าจะเป็น `awaiting_payment` แล้วใช้ `printSubtotalSatang`, `platformFeeSatang`, `totalSatang`
- **เวลาเสร็จ:** แสดง `estimatedReadyAt` ถ้ามี ถ้าเป็นแบบนับเวลา (`readyInMinutes`) จะได้ `estimatedReadyAt` ตอนชำระเงินแล้ว ก่อนหน้านั้นแสดง "ประมาณ N นาทีหลังชำระเงิน" · เวลาแสดงเป็นเวลาไทย (Asia/Bangkok)
- **แจ้งลูกค้าก่อนสั่ง:** ร้านดาวน์โหลดไฟล์ไปปริ้นได้ และไม่ควรส่งเอกสารลับ (D20)
- **ตำแหน่ง:** ตัวเลือก "ส่งถึงที่" ใช้ได้เมื่อลูกค้าอนุญาตตำแหน่ง พิกัดมาจากตำแหน่งปัจจุบันเท่านั้น (D24)
