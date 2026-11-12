import { z } from "zod";
import { requireCustomer } from "@/lib/auth";
import { searchShops } from "@/lib/domain/shops/search";
import { ApiError, handle } from "@/lib/errors";

const coordinate = (min: number, max: number) =>
  z
    .string()
    .regex(/^-?\d+(\.\d+)?$/, "ต้องเป็นตัวเลข")
    .transform(Number)
    .pipe(z.number().min(min).max(max));

const Query = z.object({
  lat: coordinate(-90, 90).optional(),
  lng: coordinate(-180, 180).optional(),
});

/** GET /api/liff/shops?lat&lng (CONTRACTS 6.1): active shops with a price list, nearest first. */
export const GET = handle(async (req: Request) => {
  await requireCustomer(req);

  const params = new URL(req.url).searchParams;
  const { lat, lng } = Query.parse({
    lat: params.get("lat") ?? undefined,
    lng: params.get("lng") ?? undefined,
  });
  if ((lat === undefined) !== (lng === undefined)) {
    throw new ApiError("VALIDATION_ERROR", 422, "ต้องส่ง lat และ lng พร้อมกัน หรือไม่ส่งเลย");
  }

  const shops = await searchShops({ lat, lng, now: new Date() });
  return Response.json(
    shops.map((s) => ({
      ...s,
      // Rounded for display only, here and nowhere else (D9).
      distanceKm: s.distanceKm === null ? null : Math.round(s.distanceKm * 10) / 10,
    })),
  );
});
