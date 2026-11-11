import { z } from "zod";
import { requireShop } from "@/lib/auth";
import { createShopFileUrl } from "@/lib/domain/files/url";
import { ApiError, handle } from "@/lib/errors";

const Params = z.object({ id: z.uuid(), fileId: z.uuid() });
const Mode = z.enum(["view", "download"]).default("view");

/**
 * GET /api/shop/orders/:id/files/:fileId/url?mode=view|download (CONTRACTS 6.2, D20).
 * The shop must own the order; anything else is a 404.
 */
export const GET = handle(
  async (req: Request, ctx: { params: Promise<{ id: string; fileId: string }> }) => {
    const { shopId } = await requireShop(req);

    const params = Params.safeParse(await ctx.params);
    if (!params.success) throw new ApiError("NOT_FOUND", 404);
    const mode = Mode.parse(new URL(req.url).searchParams.get("mode") ?? undefined);

    return Response.json(
      await createShopFileUrl({
        shopId,
        orderId: params.data.id,
        fileId: params.data.fileId,
        mode,
      }),
    );
  },
);
