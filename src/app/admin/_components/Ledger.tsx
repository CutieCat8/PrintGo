"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Button, Card, ErrorState, Modal, Money, Skeleton } from "@/components/ui";
import { errorMessage } from "@/lib/client/http";
import { formatDayTime } from "@/lib/client/format";
import { SettlementList, RefundList, type LedgerFilter } from "@/lib/payment/ledger-types";
import { adminRead, adminAction } from "../_lib/api";

type Selection = { id: string; orderNo: string; amountSatang: number; recipient: string };
export function Ledger({ kind }: { kind: "settlements" | "refunds" }) {
  const [status, setStatus] = useState<LedgerFilter>("pending");
  const resource = useSWR(
    ["admin-ledger", kind, status],
    async () => {
      const raw = await adminRead(`${kind}?status=${status}`);
      return kind === "settlements"
        ? { kind: "settlements" as const, ...SettlementList.parse(raw) }
        : { kind: "refunds" as const, ...RefundList.parse(raw) };
    },
    { refreshInterval: 15000, shouldRetryOnError: false },
  );
  const [selection, setSelection] = useState<Selection | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  function select(value: Selection) {
    setSelection(value);
    setFailure(null);
  }
  async function confirm() {
    if (!selection || lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await adminAction(`${kind}/${selection.id}/mark-paid`, {});
      setNotice(kind === "settlements" ? "บันทึกโอนให้ร้านแล้ว" : "บันทึกโอนคืนแล้ว");
      setSelection(null);
      await resource.mutate();
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const data = resource.data;
  function action(
    row: {
      id: string;
      orderNo: string;
      amountSatang: number;
      status: "pending" | "paid";
      paidAt: string | null;
    },
    recipient: string,
  ) {
    return row.status === "paid" ? (
      <p className="text-success-ink">โอนแล้ว {row.paidAt ? formatDayTime(row.paidAt) : ""}</p>
    ) : (
      <Button variant="secondary" onClick={() => select({ ...row, recipient })}>
        {kind === "settlements" ? "บันทึกโอนให้ร้านแล้ว" : "บันทึกโอนคืนแล้ว"}
      </Button>
    );
  }
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold text-brand">
        {kind === "settlements" ? "โอนให้ร้าน" : "คืนเงินลูกค้า"}
      </h1>
      <p className="text-sm text-ink-muted">
        {kind === "settlements"
          ? "แสดงเฉพาะออเดอร์ที่เสร็จสิ้นแล้ว ตรวจยอดและโอนให้ร้านก่อนบันทึก"
          : "ตรวจผู้รับและยอดที่ต้องคืน โอนคืนก่อนบันทึก"}
      </p>
      <label>
        สถานะ
        <select
          className="ml-3 min-h-11 rounded-control border border-line bg-white px-3"
          value={status}
          onChange={(e) => setStatus(e.target.value as LedgerFilter)}
        >
          <option value="pending">รอโอน</option>
          <option value="paid">โอนแล้ว</option>
          <option value="all">ทั้งหมด</option>
        </select>
      </label>
      {notice && <p role="status">{notice}</p>}
      {resource.error ? (
        <ErrorState
          description={errorMessage(resource.error)}
          onRetry={() => void resource.mutate()}
        />
      ) : !data ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <Card>
            <p>
              ยอดรอโอนในรายการ <Money satang={data.pendingSatang} />
            </p>
            <p>
              ยอดโอนแล้วในรายการ <Money satang={data.paidSatang} />
            </p>
          </Card>
          {data.kind === "settlements" ? (
            data.shops.length ? (
              data.shops.map((shop) => (
                <Card key={shop.shopId} className="space-y-3">
                  <h2 className="text-lg font-semibold">{shop.name}</h2>
                  <p>ติดต่อร้าน {shop.phone}</p>
                  <p>
                    รอโอน <Money satang={shop.pendingSatang} /> · โอนแล้ว{" "}
                    <Money satang={shop.paidSatang} />
                  </p>
                  {shop.settlements.map((row) => (
                    <div
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"
                    >
                      <div>
                        <Link
                          className="text-brand underline"
                          href={`/admin/orders/${row.orderId}`}
                        >
                          {row.orderNo}
                        </Link>
                        <p>
                          <Money satang={row.amountSatang} />
                        </p>
                      </div>
                      {action(row, shop.name)}
                    </div>
                  ))}
                </Card>
              ))
            ) : (
              <p>ไม่มีรายการโอนให้ร้านในสถานะนี้</p>
            )
          ) : data.refunds.length ? (
            data.refunds.map((row) => (
              <Card key={row.id} className="space-y-2">
                <Link className="text-brand underline" href={`/admin/orders/${row.orderId}`}>
                  {row.orderNo}
                </Link>
                <p>ผู้รับ {row.customerName}</p>
                <p>
                  <Money satang={row.amountSatang} />
                </p>
                <p>เหตุผล {row.reason}</p>
                {action(row, row.customerName)}
              </Card>
            ))
          ) : (
            <p>ไม่มีรายการคืนเงินในสถานะนี้</p>
          )}
        </>
      )}
      <Modal
        open={!!selection}
        onClose={() => setSelection(null)}
        dismissible={!busy}
        title={kind === "settlements" ? "ยืนยันว่าโอนให้ร้านแล้ว" : "ยืนยันว่าโอนคืนแล้ว"}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setSelection(null)}>
              กลับ
            </Button>
            <Button loading={busy} disabled={busy} onClick={() => void confirm()}>
              ยืนยันบันทึก
            </Button>
          </>
        }
      >
        {selection && (
          <div className="space-y-2">
            <p>
              {selection.orderNo} · {selection.recipient}
            </p>
            <p>
              ยอดโอน <Money satang={selection.amountSatang} />
            </p>
            <p>ตรวจว่าการโอนสำเร็จและยอดถูกต้องก่อนยืนยันบันทึก</p>
          </div>
        )}
        {failure && <p role="alert">{failure}</p>}
      </Modal>
    </section>
  );
}
