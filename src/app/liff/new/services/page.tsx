"use client";

import { useRouter } from "next/navigation";
import { Button, Checkbox, Icon, Money, PageShell, Skeleton, Steps, cx } from "@/components/ui";
import { updateDraft, type OrderDraft } from "@/lib/client/draft";
import { UNIT_LABEL } from "@/lib/client/format";
import type { ShopListItem } from "@/lib/client/types";
import { FlowFooter, useChosenShop, useFlowGuard } from "../../_components/OrderFlow";
import { ORDER_STEPS } from "../../_components/steps";

/** C6 · step 4 (optional): the chosen shop's own extra services (D22). */
export default function ServicesPage() {
  const router = useRouter();
  const { draft, hydrated } = useFlowGuard("shop");
  const { shop, isLoading } = useChosenShop(draft.shopId);
  const chosen = draft.services.length;

  return (
    <PageShell
      title={shop ? `บริการเสริม · ${shop.name}` : "บริการเสริม"}
      subtitle="ไม่บังคับ ข้ามได้"
      backHref="/liff/new/shop"
      footer={
        <FlowFooter summary={chosen ? `บริการเสริม ${chosen} รายการ` : "ไม่เลือกบริการเสริม"}>
          <Button fullWidth size="lg" arrow onClick={() => router.push("/liff/new/delivery")}>
            {chosen ? "ต่อไป: รับงาน" : "ข้าม: ไปเลือกวิธีรับงาน"}
          </Button>
        </FlowFooter>
      }
    >
      <Steps steps={ORDER_STEPS} current={3} className="mb-5" />
      {!hydrated || isLoading || !shop ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {shop.services.map((s) => (
              <ServiceRow key={s.id} service={s} draft={draft} />
            ))}
          </ul>
          <p className="mt-4 flex gap-2 rounded-card bg-surface px-4 py-3 text-sm text-ink-muted ring-1 ring-line">
            <Icon name="chat" className="mt-0.5 size-4 shrink-0" />
            ไม่เลือกก็ได้ · ถ้ามีเรื่องพิเศษ คุยกับร้านทางแชทหลังส่งออเดอร์
          </p>
        </>
      )}
    </PageShell>
  );
}

function ServiceRow({
  service: s,
  draft,
}: {
  service: ShopListItem["services"][number];
  draft: OrderDraft;
}) {
  const chosen = draft.services.find((x) => x.serviceId === s.id);
  const manyFiles = draft.files.length > 1;
  const all = draft.files.map((_, i) => i);

  function toggle(on: boolean) {
    updateDraft((d) => ({
      ...d,
      services: on
        ? [...d.services, { serviceId: s.id }]
        : d.services.filter((x) => x.serviceId !== s.id),
    }));
  }

  function toggleFile(index: number, on: boolean) {
    updateDraft((d) => ({
      ...d,
      services: d.services.map((x) => {
        if (x.serviceId !== s.id) return x;
        const current = x.fileIndexes ?? all;
        const next = on
          ? [...new Set([...current, index])].sort((a, b) => a - b)
          : current.filter((i) => i !== index);
        // Every file again = leave fileIndexes out (the API default)
        return next.length === all.length
          ? { serviceId: s.id }
          : { serviceId: s.id, fileIndexes: next };
      }),
    }));
  }

  return (
    <li
      className={cx(
        "rounded-card bg-surface p-4 ring-1 transition",
        chosen ? "ring-2 ring-accent-ink" : "ring-line",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <Checkbox
          checked={Boolean(chosen)}
          onChange={(e) => toggle(e.target.checked)}
          label={<span className="font-semibold">{s.name}</span>}
          description={
            s.priceSatang === null ? (
              "ราคาตามตกลง"
            ) : (
              <>
                +<Money satang={s.priceSatang} /> / {UNIT_LABEL[s.unit]}
              </>
            )
          }
        />
        {s.priceSatang === null && (
          <span className="shrink-0 rounded-full bg-warning-50 px-2.5 py-1 text-xs font-semibold text-warning-ink">
            ร้านกรอกราคา
          </span>
        )}
      </div>
      {chosen && s.unit === "per_set" && manyFiles && (
        <fieldset className="mt-3 rounded-xl bg-canvas p-3">
          <legend className="sr-only">ใช้กับไฟล์</legend>
          <p className="mb-1 text-sm text-ink-muted">ใช้กับไฟล์:</p>
          {draft.files.map((f, i) => (
            <Checkbox
              key={f.key}
              checked={(chosen.fileIndexes ?? all).includes(i)}
              disabled={chosen.fileIndexes?.length === 1 && chosen.fileIndexes[0] === i}
              onChange={(e) => toggleFile(i, e.target.checked)}
              label={<span className="text-sm">{f.name}</span>}
            />
          ))}
        </fieldset>
      )}
    </li>
  );
}
