import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as hoursGet, PUT as hoursPut } from "@/app/api/shop/hours/route";
import { GET as meGet } from "@/app/api/shop/me/route";
import { GET as ordersList } from "@/app/api/shop/orders/route";
import { GET as pricingGet, PUT as pricingPut } from "@/app/api/shop/pricing/route";
import { GET as profileGet, PUT as profilePut } from "@/app/api/shop/profile/route";
import { POST as registerPost } from "@/app/api/shop/register/route";
import { DELETE as serviceDelete, PUT as servicePut } from "@/app/api/shop/services/[id]/route";
import { GET as servicesGet, POST as servicesPost } from "@/app/api/shop/services/route";
import type { Access } from "@/lib/auth/access";
import { Shop } from "@/lib/db/types";
import { estimateForCustomer } from "@/lib/domain/orders/quote";
import { FakeSupabase, type Row } from "@/lib/domain/testing/fakeSupabase";
import { searchShops } from "./search";

// FakeSupabase is in memory (not Postgres): it enforces a few unique constraints but no foreign
// keys or check constraints. Auth is mocked, except that the real `assertShopAccess` decides who
// may call what, so the tests prove each route asks for the right kind of access.
const h = vi.hoisted(() => ({
  db: null as unknown,
  access: null as unknown,
  authUserId: "",
  loggedIn: true,
}));
vi.mock("@/lib/db/server", () => ({ getServiceClient: () => h.db }));
vi.mock("@/lib/delivery", () => ({
  quoteDelivery: vi.fn(),
  createDeliveryForOrder: vi.fn(),
}));
vi.mock("@/lib/auth", async () => {
  const { assertShopAccess } = await import("@/lib/auth/access");
  const { ApiError } = await import("@/lib/errors");
  const who = () => {
    if (!h.loggedIn) throw new ApiError("UNAUTHENTICATED", 401);
    return h.authUserId;
  };
  return {
    requireAuthUser: async () => ({ authUserId: who(), email: "owner@example.com" }),
    requireShop: async (_req: Request, opts?: { allowPending?: boolean }) => {
      const authUserId = who();
      const { shopId } = assertShopAccess(h.access as Access | null, opts);
      return { authUserId, shopId };
    },
  };
});

const NOW = new Date("2026-11-12T05:00:00.000Z");
const T = NOW.toISOString();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const USER = id(900);
const SHOP = id(101);
const OTHER = id(102);

let db: FakeSupabase;

const request = (method: string, body?: unknown, raw = false) =>
  new Request("http://localhost/x", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : raw ? (body as string) : JSON.stringify(body),
  });
type Handler = (req: Request, ctx: never) => Promise<Response>;
const call = (handler: Handler, method: string, body?: unknown, params?: { id: string }) =>
  handler(
    request(method, body),
    (params ? { params: Promise.resolve(params) } : undefined) as never,
  );

function seedShop(shopId: string, over: Row = {}) {
  db.rows("shops").push({
    id: shopId,
    created_at: T,
    name: "ร้านตัวอย่าง",
    phone: "0800000000",
    address: "ที่อยู่สมมติ",
    lat: 18.79,
    lng: 98.95,
    status: "pending",
    is_paused: false,
    accepts_delivery: true,
    cutoff_minutes: 30,
    ...over,
  });
}
const signInAs = (
  role: Access["role"] | null,
  status: Access["shopStatus"],
  shopId: string | null = SHOP,
) => {
  h.access = role === null ? null : { role, shopId, shopStatus: status };
};
const shopRow = (shopId = SHOP) => db.rows("shops").find((s) => s.id === shopId) as Row;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  db = new FakeSupabase();
  h.db = db;
  h.authUserId = USER;
  h.loggedIn = true;
  seedShop(SHOP);
  seedShop(OTHER, { name: "ร้านอื่น" });
  signInAs("shop", "pending");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const registerBody = (over: Row = {}) => ({
  name: "ร้านใหม่ ปริ้นเร็ว",
  phone: "081-234-5678",
  address: "99 ถนนสมมติ เชียงใหม่",
  lat: 18.79,
  lng: 98.95,
  acceptsDelivery: true,
  ...over,
});
/**
 * The error text of a 422. Every message the shop could see (the top one and each of the details)
 * must contain Thai, so the settings screen never shows a raw English validation message.
 */
const THAI = /[฀-๿]/;
const messages = async (res: Response) => {
  const error = (await res.json()).error;
  expect(error.code).toBe("VALIDATION_ERROR");
  expect(error.message).toMatch(THAI);
  for (const issue of error.details?.issues ?? []) expect(issue.message, issue.path).toMatch(THAI);
  return JSON.stringify(error);
};

// ---------------------------------------------------------------------------------------------
describe("POST /api/shop/register (D23)", () => {
  beforeEach(() => {
    db.tables.shops = [];
    signInAs(null, null);
  });

  it("makes a pending shop and the shop profile, with nothing else", async () => {
    const res = await call(registerPost, "POST", registerBody());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Object.keys(json).sort()).toEqual(Object.keys(Shop.shape).sort());
    expect(json).toMatchObject({
      name: "ร้านใหม่ ปริ้นเร็ว",
      phone: "0812345678",
      status: "pending",
      isPaused: false,
      acceptsDelivery: true,
      cutoffMinutes: 30,
    });
    expect(db.rows("shops")).toHaveLength(1);
    expect(db.rows("profiles")).toEqual([
      expect.objectContaining({ auth_user_id: USER, role: "shop", shop_id: json.id }),
    ]);
    for (const table of [
      "shop_hours",
      "shop_pricing_rules",
      "shop_discount_tiers",
      "shop_services",
    ]) {
      expect(db.rows(table)).toHaveLength(0);
    }
  });

  it("cannot choose its own status", async () => {
    const json = await (
      await call(registerPost, "POST", registerBody({ status: "active", isPaused: true }))
    ).json();
    expect(json.status).toBe("pending");
    expect(db.rows("shops")[0]).toMatchObject({ status: "pending", is_paused: false });
  });

  it("the same person registering again gets 409 ALREADY_REGISTERED and no second shop", async () => {
    expect((await call(registerPost, "POST", registerBody())).status).toBe(200);
    const again = await call(registerPost, "POST", registerBody({ name: "ร้านที่สอง" }));
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe("ALREADY_REGISTERED");
    expect(db.rows("shops")).toHaveLength(1);
    expect(db.rows("profiles")).toHaveLength(1);
  });

  it("two sign-ups at the same moment make one shop (the loser's shop is removed)", async () => {
    const results = await Promise.all([
      call(registerPost, "POST", registerBody()),
      call(registerPost, "POST", registerBody({ name: "ร้านที่สอง" })),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(db.rows("shops")).toHaveLength(1);
    expect(db.rows("profiles")).toHaveLength(1);
  });

  it("a person who already has a profile (an admin) cannot register a shop", async () => {
    db.rows("profiles").push({
      id: id(1),
      created_at: T,
      auth_user_id: USER,
      role: "admin",
      shop_id: null,
    });
    expect((await call(registerPost, "POST", registerBody())).status).toBe(409);
    expect(db.rows("shops")).toHaveLength(0);
  });

  it("if the profile cannot be saved the new shop is removed again (no unlinked shop)", async () => {
    db.failures.set("profiles.insert", "boom");
    const res = await call(registerPost, "POST", registerBody());
    expect(res.status).toBe(500);
    expect(db.rows("shops")).toHaveLength(0);
    expect(JSON.stringify(await res.json())).not.toContain("boom");
  });

  it("someone who is not a shop yet may register, but may not use the shop settings", async () => {
    signInAs(null, null);
    expect((await call(registerPost, "POST", registerBody())).status).toBe(200);
    for (const handler of [profileGet, hoursGet, pricingGet, servicesGet]) {
      signInAs(null, null);
      expect((await call(handler, "GET")).status).toBe(403);
    }
  });

  it("needs a login", async () => {
    h.loggedIn = false;
    expect((await call(registerPost, "POST", registerBody())).status).toBe(401);
    expect(db.rows("shops")).toHaveLength(0);
  });

  it("checks every field and answers 422 in Thai", async () => {
    const bad: [Row, string][] = [
      [{ name: "" }, "ชื่อร้าน"],
      [{ name: "   " }, "ชื่อร้าน"],
      [{ name: "ก".repeat(81) }, "ชื่อร้าน"],
      [{ name: undefined }, "ชื่อร้าน"],
      [{ phone: "12345" }, "เบอร์โทร"],
      [{ phone: "abc" }, "เบอร์โทร"],
      [{ phone: "+1 555 123 4567" }, "เบอร์โทร"],
      [{ phone: undefined }, "เบอร์โทร"],
      [{ address: "" }, "ที่อยู่"],
      [{ address: "ก".repeat(301) }, "ที่อยู่"],
      [{ lat: 91 }, "ละติจูด"],
      [{ lat: -91 }, "ละติจูด"],
      [{ lat: "18.7" }, "ละติจูด"],
      [{ lng: 181 }, "ลองจิจูด"],
      [{ lng: undefined }, "ลองจิจูด"],
      [{ acceptsDelivery: undefined }, "จัดส่ง"],
      [{ acceptsDelivery: "yes" }, "จัดส่ง"],
      [{ name: 5 }, "ชื่อร้าน"],
      [{ lat: null }, "ละติจูด"],
    ];
    for (const [over, word] of bad) {
      const res = await call(registerPost, "POST", registerBody(over));
      expect(res.status).toBe(422);
      expect(await messages(res)).toContain(word);
    }
    expect(db.rows("shops")).toHaveLength(0);
    expect((await registerPost(request("POST", "{oops", true), undefined as never)).status).toBe(
      422,
    );
  });

  it("accepts the edges: name 80, address 300, lat/lng at the limits, +66 and 02 phones", async () => {
    for (const [i, over] of [
      { name: "ก".repeat(80), address: "ก".repeat(300), lat: 90, lng: 180 },
      { lat: -90, lng: -180, phone: "+66 81 234 5678" },
      { phone: "02-123-4567" },
    ].entries()) {
      h.authUserId = id(950 + i);
      const res = await call(registerPost, "POST", registerBody(over));
      expect(res.status).toBe(200);
    }
    expect(
      db
        .rows("shops")
        .map((s) => s.phone)
        .sort(),
    ).toEqual(["021234567", "0812345678", "0812345678"]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("GET /api/shop/me", () => {
  it("no_profile for a person without a shop, and for an admin", async () => {
    expect(await (await call(meGet, "GET")).json()).toEqual({ state: "no_profile", shop: null });
    db.rows("profiles").push({
      id: id(1),
      created_at: T,
      auth_user_id: USER,
      role: "admin",
      shop_id: null,
    });
    expect(await (await call(meGet, "GET")).json()).toEqual({ state: "no_profile", shop: null });
  });

  it("shows pending, active and suspended with the shop", async () => {
    db.rows("profiles").push({
      id: id(1),
      created_at: T,
      auth_user_id: USER,
      role: "shop",
      shop_id: SHOP,
    });
    for (const status of ["pending", "active", "suspended"]) {
      shopRow().status = status;
      const json = await (await call(meGet, "GET")).json();
      expect(json.state).toBe(status);
      expect(json.shop).toMatchObject({ id: SHOP, status });
      expect(Object.keys(json.shop).sort()).toEqual(Object.keys(Shop.shape).sort());
    }
  });

  it("never shows another person's shop, and needs a login", async () => {
    db.rows("profiles").push({
      id: id(1),
      created_at: T,
      auth_user_id: id(777),
      role: "shop",
      shop_id: OTHER,
    });
    expect((await (await call(meGet, "GET")).json()).state).toBe("no_profile");
    h.loggedIn = false;
    expect((await call(meGet, "GET")).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------------------------
describe("profile", () => {
  const profileBody = (over: Row = {}) => ({
    name: "ร้านเปลี่ยนชื่อ",
    phone: "0899999999",
    address: "ที่อยู่ใหม่",
    lat: 18.8,
    lng: 98.96,
    acceptsDelivery: false,
    cutoffMinutes: 45,
    isPaused: true,
    ...over,
  });

  it("a pending shop can read and change its own profile", async () => {
    expect((await (await call(profileGet, "GET")).json()).id).toBe(SHOP);
    const res = await call(profilePut, "PUT", profileBody());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: SHOP,
      name: "ร้านเปลี่ยนชื่อ",
      phone: "0899999999",
      acceptsDelivery: false,
      cutoffMinutes: 45,
      isPaused: true,
      status: "pending",
    });
    expect(shopRow()).toMatchObject({
      name: "ร้านเปลี่ยนชื่อ",
      cutoff_minutes: 45,
      is_paused: true,
    });
  });

  it("can never change its own status or another shop, whatever the body says", async () => {
    await call(profilePut, "PUT", profileBody({ status: "active", id: OTHER, shopId: OTHER }));
    expect(shopRow().status).toBe("pending");
    expect(shopRow().id).toBe(SHOP);
    expect(shopRow(OTHER)).toMatchObject({
      name: "ร้านอื่น",
      status: "pending",
      cutoff_minutes: 30,
    });
  });

  it("an active shop keeps its status when it saves", async () => {
    shopRow().status = "active";
    signInAs("shop", "active");
    expect((await call(profilePut, "PUT", profileBody())).status).toBe(200);
    expect(shopRow().status).toBe("active");
  });

  it("checks the fields, cutoff 0 to 240 minutes", async () => {
    for (const over of [
      { cutoffMinutes: -1 },
      { cutoffMinutes: 241 },
      { cutoffMinutes: 1.5 },
      { cutoffMinutes: undefined },
      { isPaused: undefined },
      { lat: 100 },
      { phone: "1" },
    ]) {
      expect((await call(profilePut, "PUT", profileBody(over))).status).toBe(422);
    }
    expect(shopRow().name).toBe("ร้านตัวอย่าง");
    for (const cutoffMinutes of [0, 240]) {
      expect((await call(profilePut, "PUT", profileBody({ cutoffMinutes }))).status).toBe(200);
    }
  });

  it("a suspended shop and a non-shop are refused", async () => {
    signInAs("shop", "suspended");
    expect((await call(profileGet, "GET")).status).toBe(403);
    expect((await call(profilePut, "PUT", profileBody())).status).toBe(403);
    signInAs("admin", null, null);
    expect((await call(profileGet, "GET")).status).toBe(403);
    expect(shopRow().name).toBe("ร้านตัวอย่าง");
  });
});

// ---------------------------------------------------------------------------------------------
const week = (over: (d: number) => Row = () => ({})) =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    openTime: "09:00",
    closeTime: "18:00",
    isClosed: weekday === 0,
    ...over(weekday),
  }));

describe("hours", () => {
  it("is empty until the shop sets it", async () => {
    expect(await (await call(hoursGet, "GET")).json()).toEqual([]);
  });

  it("a pending shop saves 7 days and reads them back as HH:mm, weekday 0 to 6", async () => {
    const res = await call(
      hoursPut,
      "PUT",
      week((d) => (d === 3 ? { openTime: "08:30:00", closeTime: "24:00" } : {})),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.map((r: Row) => r.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(json[3]).toEqual({ weekday: 3, openTime: "08:30", closeTime: "24:00", isClosed: false });
    expect(json[0].isClosed).toBe(true);
    expect(await (await call(hoursGet, "GET")).json()).toEqual(json);
  });

  it("replaces the whole set: saving again changes it and leaves exactly 7 rows", async () => {
    await call(hoursPut, "PUT", week());
    await call(
      hoursPut,
      "PUT",
      week((d) => ({ openTime: "10:00", closeTime: "20:00", isClosed: d === 6 })),
    );
    const rows = db.rows("shop_hours").filter((r) => r.shop_id === SHOP);
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.open_time === "10:00" && r.close_time === "20:00")).toBe(true);
    expect(rows.find((r) => r.weekday === 6)?.is_closed).toBe(true);
    expect(rows.find((r) => r.weekday === 0)?.is_closed).toBe(false);
  });

  it("only touches its own shop", async () => {
    await call(hoursPut, "PUT", week());
    expect(db.rows("shop_hours").filter((r) => r.shop_id === OTHER)).toHaveLength(0);
    db.rows("shop_hours").push({
      id: id(5),
      created_at: T,
      shop_id: OTHER,
      weekday: 1,
      open_time: "07:00",
      close_time: "08:00",
      is_closed: false,
    });
    await call(hoursPut, "PUT", week());
    expect(db.rows("shop_hours").find((r) => r.shop_id === OTHER)).toMatchObject({
      open_time: "07:00",
    });
    expect((await (await call(hoursGet, "GET")).json()).length).toBe(7);
  });

  it("refuses anything that is not exactly 7 valid days (422, Thai) and saves nothing", async () => {
    const bad: [unknown, string][] = [
      [week().slice(0, 6), "7 วัน"],
      [[...week(), week()[0]], "7 วัน"],
      [week((d) => ({ weekday: d === 6 ? 5 : d })), "ซ้ำ"],
      [week((d) => ({ weekday: d === 6 ? 7 : d })), "0–6"],
      [week((d) => (d === 2 ? { openTime: "18:00", closeTime: "09:00" } : {})), "หลังเวลาเปิด"],
      [week((d) => (d === 2 ? { openTime: "09:00", closeTime: "09:00" } : {})), "หลังเวลาเปิด"],
      [week((d) => (d === 2 ? { openTime: "9am" } : {})), "HH:mm"],
      [week((d) => (d === 2 ? { closeTime: "25:00" } : {})), "HH:mm"],
      [week((d) => (d === 2 ? { openTime: "24:00" } : {})), "เวลาเปิด"],
      [week((d) => (d === 2 ? { isClosed: undefined } : {})), "ปิดทั้งวัน"],
      [week((d) => ({ weekday: d === 6 ? 5.5 : d })), "0–6"],
      [{}, "7 วัน"],
      ["nope", "7 วัน"],
    ];
    for (const [body, word] of bad) {
      const res = await call(hoursPut, "PUT", body);
      expect(res.status).toBe(422);
      expect(await messages(res)).toContain(word);
    }
    expect(db.rows("shop_hours")).toHaveLength(0);
  });

  it("a closed day may keep any times (even equal ones)", async () => {
    const res = await call(
      hoursPut,
      "PUT",
      week((d) => (d === 0 ? { openTime: "00:00", closeTime: "00:00", isClosed: true } : {})),
    );
    expect(res.status).toBe(200);
  });

  it("a failed save changes nothing (one statement)", async () => {
    await call(hoursPut, "PUT", week());
    db.failures.set("shop_hours.upsert", "boom");
    const res = await call(
      hoursPut,
      "PUT",
      week(() => ({ openTime: "11:00", closeTime: "12:00" })),
    );
    expect(res.status).toBe(500);
    expect(db.rows("shop_hours").every((r) => r.open_time === "09:00")).toBe(true);
  });

  it("the saved hours are what the customer list uses (open now, Thai time)", async () => {
    shopRow().status = "active";
    await call(pricingPut, "PUT", {
      rules: [{ color: "bw", paper: "A4", sides: "single", pricePerPageSatang: 100 }],
      tiers: [],
    });
    await call(
      hoursPut,
      "PUT",
      week((d) => ({ isClosed: false, openTime: "00:00", closeTime: "24:00", weekday: d })),
    );
    const list = await searchShops({ now: NOW });
    expect(list.find((s) => s.id === SHOP)).toMatchObject({
      isOpen: true,
      opensAt: "00:00",
      closesAt: "24:00",
    });
  });
});

// ---------------------------------------------------------------------------------------------
const pricingBody = (over: Row = {}) => ({
  rules: [
    { color: "bw", paper: "A4", sides: "single", pricePerPageSatang: 100 },
    { color: "bw", paper: "A4", sides: "double", pricePerPageSatang: 80 },
    { color: "color", paper: "A4", sides: "single", pricePerPageSatang: 500 },
  ],
  tiers: [{ minPages: 100, note: "ลดให้เมื่อสั่งเยอะ" }],
  ...over,
});
const rulesOf = (shopId = SHOP) =>
  db.rows("shop_pricing_rules").filter((r) => r.shop_id === shopId);
const tiersOf = (shopId = SHOP) =>
  db.rows("shop_discount_tiers").filter((r) => r.shop_id === shopId);

describe("pricing", () => {
  it("is empty until the shop sets it", async () => {
    expect(await (await call(pricingGet, "GET")).json()).toEqual({ rules: [], tiers: [] });
  });

  it("a pending shop saves rules and tiers and reads them back", async () => {
    const res = await call(pricingPut, "PUT", pricingBody());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rules).toHaveLength(3);
    expect(json.rules).toContainEqual({
      color: "color",
      paper: "A4",
      sides: "single",
      pricePerPageSatang: 500,
    });
    expect(json.tiers).toEqual([{ minPages: 100, note: "ลดให้เมื่อสั่งเยอะ" }]);
    expect(await (await call(pricingGet, "GET")).json()).toEqual(json);
  });

  it("replaces the whole set: changed prices, removed rules and tiers are gone", async () => {
    await call(
      pricingPut,
      "PUT",
      pricingBody({ tiers: [{ minPages: 100 }, { minPages: 500, note: "x" }] }),
    );
    await call(
      pricingPut,
      "PUT",
      pricingBody({
        rules: [{ color: "bw", paper: "A4", sides: "single", pricePerPageSatang: 120 }],
        tiers: [{ minPages: 500, note: null }, { minPages: 50 }],
      }),
    );
    expect(rulesOf().map((r) => [r.color, r.price_per_page_satang])).toEqual([["bw", 120]]);
    expect(
      tiersOf()
        .map((t) => t.min_pages)
        .sort((a, b) => (a as number) - (b as number)),
    ).toEqual([50, 500]);
    expect(tiersOf().find((t) => t.min_pages === 500)?.note).toBeNull();
  });

  it("an empty list removes everything (the shop disappears from customers until it sets prices again)", async () => {
    await call(pricingPut, "PUT", pricingBody());
    expect((await call(pricingPut, "PUT", { rules: [], tiers: [] })).status).toBe(200);
    expect(rulesOf()).toHaveLength(0);
    expect(tiersOf()).toHaveLength(0);
  });

  it("never touches another shop's list", async () => {
    db.rows("shop_pricing_rules").push({
      id: id(5),
      created_at: T,
      shop_id: OTHER,
      color: "bw",
      paper: "A4",
      sides: "single",
      price_per_page_satang: 77,
    });
    await call(pricingPut, "PUT", pricingBody());
    await call(pricingPut, "PUT", { rules: [], tiers: [] });
    expect(rulesOf(OTHER)).toHaveLength(1);
    expect((await (await call(pricingGet, "GET")).json()).rules).toEqual([]);
  });

  it("refuses bad prices, duplicates and sizes (422, Thai) and saves nothing", async () => {
    const rule = (over: Row = {}) => ({
      color: "bw",
      paper: "A4",
      sides: "single",
      pricePerPageSatang: 100,
      ...over,
    });
    const bad: [unknown, string][] = [
      [pricingBody({ rules: [rule({ pricePerPageSatang: 0 })] }), "มากกว่า 0"],
      [pricingBody({ rules: [rule({ pricePerPageSatang: -5 })] }), "มากกว่า 0"],
      [pricingBody({ rules: [rule({ pricePerPageSatang: 10_001 })] }), "100 บาท"],
      [pricingBody({ rules: [rule({ pricePerPageSatang: 1.5 })] }), "จำนวนเต็ม"],
      [pricingBody({ rules: [rule({ pricePerPageSatang: "100" })] }), "ราคา"],
      [pricingBody({ rules: [rule(), rule({ pricePerPageSatang: 90 })] }), "ซ้ำ"],
      [pricingBody({ rules: [rule({ color: "rainbow" })] }), "bw หรือ color"],
      [pricingBody({ tiers: [{ minPages: 0 }] }), "ไม่น้อยกว่า 1"],
      [pricingBody({ tiers: [{ minPages: 1.5 }] }), "จำนวนเต็ม"],
      [pricingBody({ tiers: [{ minPages: 10 }, { minPages: 10 }] }), "ซ้ำ"],
      [pricingBody({ tiers: [{ minPages: 10, note: "ก".repeat(201) }] }), "200"],
      [pricingBody({ rules: Array.from({ length: 9 }, () => rule()) }), "ไม่เกิน 8"],
      [
        pricingBody({ tiers: Array.from({ length: 21 }, (_, i) => ({ minPages: i + 1 })) }),
        "ไม่เกิน 20",
      ],
      [pricingBody({ tiers: [{ minPages: 1_000_001 }] }), "สูงสุด"],
      [pricingBody({ tiers: [{ minPages: 5, note: 7 }] }), "หมายเหตุ"],
      [pricingBody({ rules: [rule({ paper: "A0" })] }), "A4 หรือ A3"],
      [pricingBody({ rules: [rule({ sides: "triple" })] }), "single หรือ double"],
      [{ rules: [] }, "ส่วนลด"],
      [{ tiers: [] }, "ราคา"],
      [{}, "ส่ง"],
    ];
    for (const [body, word] of bad) {
      const res = await call(pricingPut, "PUT", body);
      expect(res.status).toBe(422);
      expect(await messages(res)).toContain(word);
    }
    expect(rulesOf()).toHaveLength(0);
    expect(tiersOf()).toHaveLength(0);
  });

  it("accepts the edges: 1 satang, 100 baht, minPages 1", async () => {
    const res = await call(pricingPut, "PUT", {
      rules: [
        { color: "bw", paper: "A4", sides: "single", pricePerPageSatang: 1 },
        { color: "color", paper: "A3", sides: "double", pricePerPageSatang: 10_000 },
      ],
      tiers: [{ minPages: 1 }],
    });
    expect(res.status).toBe(200);
  });

  it("if removing the old rows fails, the new list is still saved (never an empty list)", async () => {
    await call(pricingPut, "PUT", pricingBody());
    db.failures.set("shop_pricing_rules.delete", "boom");
    const res = await call(pricingPut, "PUT", {
      rules: [{ color: "bw", paper: "A4", sides: "single", pricePerPageSatang: 150 }],
      tiers: [],
    });
    expect(res.status).toBe(500);
    expect(rulesOf().length).toBeGreaterThan(0);
    expect(
      rulesOf().find((r) => r.color === "bw" && r.sides === "single")?.price_per_page_satang,
    ).toBe(150);
    // saving again fixes it
    db.failures.clear();
    expect(
      (
        await call(pricingPut, "PUT", {
          rules: [{ color: "bw", paper: "A4", sides: "single", pricePerPageSatang: 150 }],
          tiers: [],
        })
      ).status,
    ).toBe(200);
    expect(rulesOf()).toHaveLength(1);
  });

  it("a pending shop can set prices but is not shown to customers; once active it is, at once", async () => {
    await call(pricingPut, "PUT", pricingBody());
    expect((await searchShops({ now: NOW })).map((s) => s.id)).not.toContain(SHOP);
    shopRow().status = "active"; // the admin approves
    const listed = (await searchShops({ now: NOW })).find((s) => s.id === SHOP);
    expect(listed?.startingPriceSatang).toBe(80);
    // a new price is used by the very next estimate
    await call(pricingPut, "PUT", {
      rules: [{ color: "bw", paper: "A4", sides: "single", pricePerPageSatang: 250 }],
      tiers: [],
    });
    const estimate = await estimateForCustomer({
      shopId: SHOP,
      fulfillment: "pickup",
      files: [{ pageCount: 10, color: "bw", paper: "A4", sides: "single", copies: 1 }],
    });
    expect(estimate.estimatedPrintSatang).toBe(2500);
  });

  it("a shop with no prices is not listed even when active", async () => {
    shopRow().status = "active";
    expect((await searchShops({ now: NOW })).map((s) => s.id)).not.toContain(SHOP);
  });
});

// ---------------------------------------------------------------------------------------------
const serviceBody = (over: Row = {}) => ({
  name: "เข้าเล่ม",
  priceSatang: 3500,
  unit: "per_set",
  ...over,
});
const servicesOf = (shopId = SHOP) => db.rows("shop_services").filter((r) => r.shop_id === shopId);
const seedService = (shopId: string, n: number, over: Row = {}) =>
  db.rows("shop_services").push({
    id: id(2000 + n),
    created_at: T,
    shop_id: shopId,
    name: `บริการ ${n}`,
    price_satang: 100,
    unit: "per_set",
    is_active: true,
    sort_order: n,
    ...over,
  });

describe("services (D22)", () => {
  it("a pending shop creates, lists and sees them in order, active or not", async () => {
    const created = await call(servicesPost, "POST", serviceBody());
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({
      name: "เข้าเล่ม",
      priceSatang: 3500,
      unit: "per_set",
      isActive: true,
      sortOrder: 0,
    });
    await call(
      servicesPost,
      "POST",
      serviceBody({ name: "ปกใส", priceSatang: null, unit: "per_order" }),
    );
    const list = await (await call(servicesGet, "GET")).json();
    expect(list.map((s: Row) => s.name)).toEqual(["เข้าเล่ม", "ปกใส"]);
    expect(list[1]).toMatchObject({ priceSatang: null, unit: "per_order", sortOrder: 1 });
    expect(Object.keys(list[0]).sort()).toEqual([
      "id",
      "isActive",
      "name",
      "priceSatang",
      "sortOrder",
      "unit",
    ]);
  });

  it("allows 20 services and refuses the 21st with a Thai 422", async () => {
    for (let i = 0; i < 20; i++) {
      expect((await call(servicesPost, "POST", serviceBody({ name: `บริการ ${i}` }))).status).toBe(
        200,
      );
    }
    const res = await call(servicesPost, "POST", serviceBody({ name: "บริการที่ 21" }));
    expect(res.status).toBe(422);
    expect(await messages(res)).toContain("ไม่เกิน 20 รายการ");
    expect(servicesOf()).toHaveLength(20);
    // another shop has its own 20
    signInAs("shop", "pending", OTHER);
    expect((await call(servicesPost, "POST", serviceBody())).status).toBe(200);
  });

  it("deleting one frees a place", async () => {
    for (let i = 0; i < 20; i++) seedService(SHOP, i);
    expect((await call(servicesPost, "POST", serviceBody())).status).toBe(422);
    expect((await call(serviceDelete, "DELETE", undefined, { id: id(2005) })).status).toBe(200);
    expect((await call(servicesPost, "POST", serviceBody())).status).toBe(200);
  });

  it("checks name (1 to 60), price (null or 1 to 1,000,000 whole satang) and unit", async () => {
    const bad = [
      { name: "" },
      { name: "  " },
      { name: "ก".repeat(61) },
      { priceSatang: 0 },
      { priceSatang: -1 },
      { priceSatang: 1_000_001 },
      { priceSatang: 1.5 },
      { priceSatang: "100" },
      { priceSatang: undefined },
      { unit: "per_page" },
      { unit: undefined },
      { name: 5 },
    ];
    for (const over of bad) {
      const res = await call(servicesPost, "POST", serviceBody(over));
      expect(res.status).toBe(422);
      await messages(res);
    }
    expect(servicesOf()).toHaveLength(0);
    for (const over of [
      { name: "ก".repeat(60) },
      { priceSatang: 1_000_000 },
      { priceSatang: 1 },
      { priceSatang: null },
    ]) {
      expect((await call(servicesPost, "POST", serviceBody(over))).status).toBe(200);
    }
  });

  it("the shop id comes from the session, not the body", async () => {
    await call(
      servicesPost,
      "POST",
      serviceBody({ shopId: OTHER, isActive: false, sortOrder: 99 }),
    );
    expect(servicesOf(OTHER)).toHaveLength(0);
    expect(servicesOf()[0]).toMatchObject({ shop_id: SHOP, is_active: true, sort_order: 0 });
  });

  it("changes its own service, including turning it off and re-ordering", async () => {
    seedService(SHOP, 1);
    const res = await call(
      servicePut,
      "PUT",
      { name: "ใหม่", priceSatang: null, unit: "per_order", isActive: false, sortOrder: 7 },
      { id: id(2001) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: id(2001),
      name: "ใหม่",
      priceSatang: null,
      unit: "per_order",
      isActive: false,
      sortOrder: 7,
    });
    expect(servicesOf()[0]).toMatchObject({ is_active: false, sort_order: 7 });
  });

  it("another shop's service is 404 to change or delete, and stays as it was", async () => {
    seedService(OTHER, 1);
    const before = { ...servicesOf(OTHER)[0] };
    const put = await call(
      servicePut,
      "PUT",
      { name: "แฮ็ก", priceSatang: 1, unit: "per_set", isActive: false, sortOrder: 0 },
      { id: id(2001) },
    );
    const del = await call(serviceDelete, "DELETE", undefined, { id: id(2001) });
    const missing = await call(serviceDelete, "DELETE", undefined, { id: id(2999) });
    expect(put.status).toBe(404);
    expect(del.status).toBe(404);
    expect(await del.json()).toEqual(await missing.json());
    expect(servicesOf(OTHER)[0]).toEqual(before);
  });

  it("deletes for real; a second delete and a bad id are 404", async () => {
    seedService(SHOP, 1);
    expect(await (await call(serviceDelete, "DELETE", undefined, { id: id(2001) })).json()).toEqual(
      { ok: true },
    );
    expect(servicesOf()).toHaveLength(0);
    expect((await call(serviceDelete, "DELETE", undefined, { id: id(2001) })).status).toBe(404);
    expect((await call(serviceDelete, "DELETE", undefined, { id: "nope" })).status).toBe(404);
    expect(
      (
        await call(
          servicePut,
          "PUT",
          { name: "x", priceSatang: 1, unit: "per_set", isActive: true, sortOrder: 0 },
          { id: "nope" },
        )
      ).status,
    ).toBe(404);
  });

  it("a new service goes after the last one even after a delete (no two with the same order)", async () => {
    for (let i = 0; i < 4; i++)
      await call(servicesPost, "POST", serviceBody({ name: `บริการ ${i}` }));
    const second = servicesOf().find((s) => s.name === "บริการ 1") as Row;
    await call(serviceDelete, "DELETE", undefined, { id: second.id as string });
    await call(servicesPost, "POST", serviceBody({ name: "ใหม่" }));
    const orders = servicesOf().map((s) => s.sort_order as number);
    expect(new Set(orders).size).toBe(orders.length);
    expect(servicesOf().find((s) => s.name === "ใหม่")?.sort_order).toBe(4);
  });

  it("an update needs every field, and the same limits", async () => {
    seedService(SHOP, 1);
    for (const over of [
      { isActive: undefined },
      { sortOrder: undefined },
      { sortOrder: -1 },
      { sortOrder: 10_000 },
      { sortOrder: 1.5 },
      { unit: "x" },
      { name: "" },
      { priceSatang: 0 },
    ]) {
      const res = await call(
        servicePut,
        "PUT",
        { name: "ก", priceSatang: 100, unit: "per_set", isActive: true, sortOrder: 0, ...over },
        { id: id(2001) },
      );
      expect(res.status).toBe(422);
      await messages(res);
    }
    expect(servicesOf()[0].name).toBe("บริการ 1");
  });

  it("an inactive service is not offered to customers, an active one is", async () => {
    shopRow().status = "active";
    await call(pricingPut, "PUT", pricingBody());
    seedService(SHOP, 1, { name: "เปิดอยู่" });
    seedService(SHOP, 2, { name: "ปิดอยู่", is_active: false });
    const listed = (await searchShops({ now: NOW })).find((s) => s.id === SHOP);
    expect(listed?.services.map((s) => s.name)).toEqual(["เปิดอยู่"]);
    expect((await (await call(servicesGet, "GET")).json()).map((s: Row) => s.name)).toEqual([
      "เปิดอยู่",
      "ปิดอยู่",
    ]); // the shop sees both
    await call(
      servicePut,
      "PUT",
      { name: "ปิดอยู่", priceSatang: 100, unit: "per_set", isActive: true, sortOrder: 2 },
      { id: id(2002) },
    );
    expect((await searchShops({ now: NOW })).find((s) => s.id === SHOP)?.services).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------
describe("who may call what", () => {
  const settingsCalls: [string, () => Promise<Response>][] = [
    ["profile GET", () => call(profileGet, "GET")],
    [
      "profile PUT",
      () =>
        call(profilePut, "PUT", {
          name: "x",
          phone: "0899999999",
          address: "x",
          lat: 1,
          lng: 1,
          acceptsDelivery: true,
          cutoffMinutes: 30,
          isPaused: false,
        }),
    ],
    ["hours GET", () => call(hoursGet, "GET")],
    ["hours PUT", () => call(hoursPut, "PUT", week())],
    ["pricing GET", () => call(pricingGet, "GET")],
    ["pricing PUT", () => call(pricingPut, "PUT", pricingBody())],
    ["services GET", () => call(servicesGet, "GET")],
    ["services POST", () => call(servicesPost, "POST", serviceBody())],
    [
      "services PUT",
      () =>
        call(
          servicePut,
          "PUT",
          { name: "x", priceSatang: 1, unit: "per_set", isActive: true, sortOrder: 0 },
          { id: id(2001) },
        ),
    ],
    ["services DELETE", () => call(serviceDelete, "DELETE", undefined, { id: id(2001) })],
  ];

  it("a pending shop may use every setup route", async () => {
    seedService(SHOP, 1);
    for (const [name, run] of settingsCalls) {
      const res = await run();
      expect(res.status, name).toBe(200);
    }
  });

  it("a pending shop cannot use the order routes (403)", async () => {
    signInAs("shop", "pending");
    const res = await ordersList(
      new Request("http://localhost/api/shop/orders"),
      undefined as never,
    );
    expect(res.status).toBe(403);
  });

  it("a suspended shop, an admin and a person without a profile are refused everywhere (403)", async () => {
    for (const [role, status, shopId] of [
      ["shop", "suspended", SHOP],
      ["admin", null, null],
      [null, null, null],
    ] as const) {
      signInAs(role, status, shopId);
      for (const [name, run] of settingsCalls) {
        expect((await run()).status, `${role}/${status} ${name}`).toBe(403);
      }
    }
    expect(db.rows("shop_hours")).toHaveLength(0);
    expect(db.rows("shop_pricing_rules")).toHaveLength(0);
    expect(db.rows("shop_services")).toHaveLength(0);
    expect(shopRow().name).toBe("ร้านตัวอย่าง");
  });

  it("nobody who is signed out may use any of them (401)", async () => {
    h.loggedIn = false;
    for (const [name, run] of settingsCalls) {
      expect((await run()).status, name).toBe(401);
    }
  });

  it("refused calls say FORBIDDEN in the shared error format", async () => {
    signInAs(null, null);
    const body = await (await call(profileGet, "GET")).json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(typeof body.error.message).toBe("string");
  });
});
