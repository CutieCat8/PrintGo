"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import {
  Button,
  Card,
  ErrorState,
  Icon,
  Money,
  PageShell,
  Skeleton,
  Textarea,
  buttonClasses,
  cx,
  useToast,
} from "@/components/ui";
import { api, errorMessage, isApiClientError } from "@/lib/client/api";
import {
  clearDraft,
  toCreateOrderRequest,
  toEstimateRequest,
  updateDraft,
} from "@/lib/client/draft";
import { COLOR_LABEL, SIDES_LABEL, isThaiPhone } from "@/lib/client/format";
import { describeOrderProblem, type OrderProblem } from "@/lib/client/orders";
import type { EstimateResult } from "@/lib/client/types";
import {
  ChosenShopGate,
  markOrderSent,
  useChosenShop,
  useFlowGuard,
} from "../../_components/OrderFlow";

/** C8: check everything, see the estimate, send to the shop. */
export default function SummaryPage() {
  const router = useRouter();
  const toast = useToast();
  const { draft, hydrated } = useFlowGuard("shop");
  const chosen = useChosenShop(draft.shopId);
  const { shop, pos, mutate: refreshShops } = chosen;
  const [sending, setSending] = useState(false);
  const sentRef = useRef(false);

  const delivery = draft.fulfillment === "delivery" && Boolean(shop?.acceptsDelivery && pos);
  const effective = {
    ...draft,
    fulfillment: delivery ? ("delivery" as const) : ("pickup" as const),
  };
  const deliveryIncomplete =
    delivery &&
    (!draft.delivery.address.trim() ||
      !draft.delivery.name.trim() ||
      !isThaiPhone(draft.delivery.phone));
  // Delivery was chosen but the location is gone (LIFF reloaded: it is kept in memory only).
  // Never turn it into pickup silently: send the customer back to step 5 to allow it again.
  const lostLocation = draft.fulfillment === "delivery" && Boolean(shop?.acceptsDelivery) && !pos;

  useEffect(() => {
    if (hydrated && !sentRef.current && (deliveryIncomplete || lostLocation)) {
      router.replace("/liff/new/delivery");
    }
  }, [hydrated, deliveryIncomplete, lostLocation, router]);

  const body = shop ? toEstimateRequest(effective, shop.id, pos) : null;
  const estimate = useSWR(
    body ? ["estimate", JSON.stringify(body)] : null,
    () => api.estimate(body!),
    {
      shouldRetryOnError: (e) => !(isApiClientError(e) && e.status < 500),
    },
  );

  const fileNames = draft.files.map((f) => f.name);
  const problemOf = (e: unknown): OrderProblem =>
    isApiClientError(e)
      ? describeOrderProblem(e, fileNames)
      : { message: errorMessage(e), pickAnotherShop: false, fileIndex: null };

  function pickAnotherShop() {
    updateDraft((d) => ({ ...d, shopId: null, services: [] }));
    refreshShops();
    router.push("/liff/new/shop");
  }

  async function submit() {
    if (!shop || sentRef.current) return;
    sentRef.current = true; // a double tap must create one order only
    setSending(true);
    try {
      const order = await api.createOrder(toCreateOrderRequest(effective, shop.id, pos));
      markOrderSent(); // the guard must not send us back to step 1 once the draft is cleared
      clearDraft();
      router.replace(`/liff/orders/${order.id}`);
    } catch (e) {
      sentRef.current = false;
      setSending(false);
      toast(problemOf(e).message, "error");
      if (isApiClientError(e) && (e.code === "SHOP_CLOSED" || e.code === "SHOP_PAUSED")) {
        pickAnotherShop();
      }
    }
  }

  const services = (shop?.services ?? []).filter((s) =>
    draft.services.some((x) => x.serviceId === s.id),
  );

  return (
    <PageShell
      title="สรุปออเดอร์"
      backHref="/liff/new/delivery"
      footer={
        <Button
          fullWidth
          size="lg"
          arrow
          loading={sending}
          disabled={sending || !estimate.data}
          onClick={submit}
        >
          ส่งให้ร้านยืนยัน
        </Button>
      }
    >
      <ChosenShopGate hydrated={hydrated} chosen={chosen}>
        {(shop) => (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-card bg-race p-4 text-white">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
                <Icon name="store" className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg font-bold italic">{shop.name}</p>
                <p className="flex items-center gap-1 text-sm text-white/75">
                  <Icon name={delivery ? "truck" : "store"} className="size-4" />
                  {delivery ? "ส่งถึงที่ · ค่าส่งประมาณ" : "รับเองที่ร้าน"}
                </p>
              </div>
              <Link
                href="/liff/new/shop"
                className="rounded-full px-3 py-1.5 text-sm font-semibold text-white ring-1 ring-white/40 hover:bg-white/10"
              >
                เปลี่ยน
              </Link>
            </div>

            <section>
              <h2 className="mb-2 font-display text-lg font-bold italic">ไฟล์ที่พิมพ์</h2>
              <ul className="divide-y divide-line rounded-card bg-surface ring-1 ring-line">
                {draft.files.map((f) => (
                  <li key={f.key} className="flex items-start gap-3 px-4 py-3">
                    <Icon name="file" className="mt-0.5 size-5 shrink-0 text-ink-muted" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{f.name}</p>
                      <p className="text-sm text-ink-muted">
                        {f.paper} · {COLOR_LABEL[f.color]} · {SIDES_LABEL[f.sides]} · {f.pageCount}{" "}
                        หน้า × {f.copies} ชุด
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              {services.length > 0 && (
                <p className="mt-2 text-sm text-ink-muted">
                  บริการเสริม: {services.map((s) => s.name).join(", ")}
                </p>
              )}
              {delivery && (
                <p className="mt-2 text-sm text-ink-muted">
                  ส่งที่: {draft.delivery.address} · {draft.delivery.name} {draft.delivery.phone}
                </p>
              )}
            </section>

            <EstimateCard
              loading={estimate.isLoading}
              problem={estimate.error ? problemOf(estimate.error) : null}
              data={estimate.data}
              onRetry={() => estimate.mutate()}
              onPickAnotherShop={pickAnotherShop}
            />

            <p className="flex gap-2 rounded-card bg-surface px-4 py-3 text-sm text-ink-muted ring-1 ring-line">
              <Icon name="clock" className="mt-0.5 size-4 shrink-0" />
              ร้านจะยืนยันราคาและเวลาเสร็จภายใน 15 นาที ยังไม่ต้องจ่ายตอนนี้ · ร้านดาวน์โหลดไฟล์ได้
            </p>

            <Textarea
              label="หมายเหตุถึงร้าน (ไม่บังคับ)"
              rows={2}
              maxLength={500}
              placeholder="เช่น ขอแม็กซ์สีปก…"
              value={draft.note}
              onChange={(e) => updateDraft((d) => ({ ...d, note: e.target.value }))}
            />
          </div>
        )}
      </ChosenShopGate>
    </PageShell>
  );
}

function Row({
  label,
  children,
  muted,
}: {
  label: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className={cx("flex items-baseline justify-between gap-3", muted && "text-ink-muted")}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

function EstimateCard({
  loading,
  problem,
  data,
  onRetry,
  onPickAnotherShop,
}: {
  loading: boolean;
  problem: OrderProblem | null;
  data: EstimateResult | undefined;
  onRetry: () => void;
  onPickAnotherShop: () => void;
}) {
  if (loading && !data) return <Skeleton className="h-40" />;
  if (problem?.pickAnotherShop) {
    return (
      <Card className="border-l-4 border-l-warning-ink" role="alert">
        <p className="font-semibold">ร้านนี้รับออเดอร์นี้ไม่ได้</p>
        <p className="mt-1 text-sm text-ink-muted">{problem.message}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={onPickAnotherShop}>
            เลือกร้านอื่น
          </Button>
          <Link
            href="/liff/new/settings"
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            แก้ไขการตั้งค่า
          </Link>
        </div>
      </Card>
    );
  }
  if (problem && !data) {
    return (
      <ErrorState title="คำนวณราคาไม่สำเร็จ" description={problem.message} onRetry={onRetry} />
    );
  }
  if (!data) return null;

  return (
    <Card aria-live="polite">
      {data.requiresManualPrice && (
        <p className="mb-3 rounded-xl bg-warning-50 px-3 py-2 text-sm text-warning-ink">
          ออเดอร์ขนาดใหญ่หรือมีบริการราคาตามตกลง ร้านจะแจ้งราคาให้เร็ว ๆ นี้
        </p>
      )}
      <dl className="flex flex-col gap-1.5">
        {data.estimatedPrintSatang !== null && (
          <Row label="ค่าปริ้น">
            <Money satang={data.estimatedPrintSatang} />
          </Row>
        )}
        {data.serviceLines.map((l, i) => (
          // a per-set service has one line per file, so the id repeats
          <Row
            key={`${l.serviceId}-${i}`}
            label={`${l.name}${l.quantity > 1 ? ` × ${l.quantity}` : ""}`}
          >
            {l.lineTotalSatang === null ? (
              <span className="text-sm text-ink-muted">ราคาตามตกลง</span>
            ) : (
              <Money satang={l.lineTotalSatang} />
            )}
          </Row>
        ))}
        {data.platformFeeSatang !== null && (
          <Row label="ค่าบริการแพลตฟอร์ม" muted>
            <Money satang={data.platformFeeSatang} />
          </Row>
        )}
        {data.deliveryFeeSatang > 0 && (
          <Row label="ค่าส่ง (ประมาณ)" muted>
            <Money satang={data.deliveryFeeSatang} />
          </Row>
        )}
        {data.totalSatang !== null && (
          <div className="mt-2 flex items-baseline justify-between border-t border-line pt-3">
            <dt className="font-display text-lg font-bold italic">รวมประมาณ</dt>
            <dd className="font-display text-2xl font-bold text-accent-ink italic">
              <Money satang={data.totalSatang} />
            </dd>
          </div>
        )}
      </dl>
    </Card>
  );
}
