"use client";
import { useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import { api } from "@/lib/client/api";
import { formatBaht } from "@/lib/client/money";
import type { ShopService } from "@/lib/db/types";
import { serviceBody, serviceDraft } from "../_lib/forms";
import { useSave } from "../_lib/useSave";
import { Resource } from "./Resource";

export function ServicesSettings() {
  return (
    <Resource cacheKey="shopServices" load={api.listShopServices}>
      {(data, saved) => <Services initial={data} saved={saved} />}
    </Resource>
  );
}
function Services({
  initial,
  saved,
}: {
  initial: ShopService[];
  saved: (value: ShopService[]) => Promise<void>;
}) {
  const [editing, setEditing] = useState<ShopService | "new" | null>(null);
  const [draft, setDraft] = useState(() => serviceDraft());
  const [deleting, setDeleting] = useState<string | null>(null);
  const { busy, errors, run, clearErrors } = useSave();
  const rows = [...initial].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  async function refresh() {
    await saved(await api.listShopServices());
  }
  function edit(row: ShopService | "new") {
    clearErrors();
    setEditing(row);
    setDraft(serviceDraft(row === "new" ? undefined : row));
  }
  async function move(index: number, delta: number) {
    const ordered = [...rows];
    [ordered[index], ordered[index + delta]] = [ordered[index + delta], ordered[index]];
    await run(async () => {
      // P7 exposes individual updates. Refresh even after a partial failure.
      try {
        for (const [sortOrder, row] of ordered.entries()) {
          await api.updateShopService(row.id, {
            name: row.name,
            priceSatang: row.priceSatang,
            unit: row.unit,
            isActive: row.isActive,
            sortOrder,
          });
        }
      } finally {
        await refresh();
      }
    }, "บันทึกลำดับแล้ว");
  }
  let preview = "กรอกชื่อและราคาเพื่อดูตัวอย่าง";
  try {
    const value = serviceBody(draft);
    preview = `${value.name} ${value.priceSatang === null ? "ราคาตามตกลง" : `฿${formatBaht(value.priceSatang)}/${value.unit === "per_set" ? "ชุด" : "ออเดอร์"}`}`;
  } catch {
    /* Incomplete drafts are expected. */
  }
  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-xl font-semibold text-brand">บริการเสริม</h2>
        <p className="my-3 text-sm text-ink-muted">
          ต่อชุดคิดตามจำนวนชุดที่เลือก ต่อออเดอร์คิดครั้งเดียว
          ราคาตามตกลงต้องให้ร้านยืนยันราคาก่อนลูกค้าชำระ
        </p>
        {!rows.length && <p className="my-4">ยังไม่มีบริการเสริม</p>}
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={row.id} className="rounded-control border border-line p-4">
              <p className="font-semibold">
                {row.name} ·{" "}
                {row.priceSatang === null
                  ? "ราคาตามตกลง"
                  : `฿${formatBaht(row.priceSatang)}/${row.unit === "per_set" ? "ชุด" : "ออเดอร์"}`}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={row.isActive}
                    disabled={busy || editing !== null}
                    onChange={() =>
                      void run(async () => {
                        await api.updateShopService(row.id, {
                          name: row.name,
                          priceSatang: row.priceSatang,
                          unit: row.unit,
                          sortOrder: row.sortOrder,
                          isActive: !row.isActive,
                        });
                        await refresh();
                      })
                    }
                  />
                  เปิดใช้งาน
                </label>
                <Button
                  variant="secondary"
                  disabled={busy || editing !== null}
                  onClick={() => edit(row)}
                >
                  แก้ไข
                </Button>
                <Button
                  variant="secondary"
                  aria-label={`เลื่อน ${row.name} ขึ้น`}
                  disabled={busy || editing !== null || index === 0}
                  onClick={() => void move(index, -1)}
                >
                  ขึ้น
                </Button>
                <Button
                  variant="secondary"
                  aria-label={`เลื่อน ${row.name} ลง`}
                  disabled={busy || editing !== null || index === rows.length - 1}
                  onClick={() => void move(index, 1)}
                >
                  ลง
                </Button>
                <Button
                  variant="danger"
                  disabled={busy || editing !== null}
                  onClick={() => {
                    clearErrors();
                    setDeleting(row.id);
                  }}
                >
                  ลบ
                </Button>
              </div>
              {deleting === row.id && (
                <div role="group" aria-label={`ยืนยันลบ ${row.name}`} className="mt-3 space-y-3">
                  <p>ยืนยันลบบริการ “{row.name}” หรือไม่?</p>
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      loading={busy}
                      onClick={() =>
                        void run(async () => {
                          await api.deleteShopService(row.id);
                          setDeleting(null);
                          await refresh();
                        }, "ลบบริการแล้ว")
                      }
                    >
                      ยืนยันลบ
                    </Button>
                    <Button variant="secondary" disabled={busy} onClick={() => setDeleting(null)}>
                      ยกเลิก
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        {rows.length >= 20 ? (
          <p className="mt-4">เพิ่มบริการได้สูงสุด 20 รายการ กรุณาแก้ไขหรือลบรายการเดิม</p>
        ) : (
          !editing && (
            <Button
              className="mt-4"
              disabled={busy}
              onClick={() => {
                setDeleting(null);
                edit("new");
              }}
            >
              + เพิ่มบริการ
            </Button>
          )
        )}
      </Card>
      {editing && (
        <Card>
          <h3 className="text-lg font-semibold">
            {editing === "new" ? "เพิ่มบริการ" : "แก้ไขบริการ"}
          </h3>
          <form
            noValidate
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                async () => {
                  const body = serviceBody(draft);
                  if (editing === "new") await api.createShopService(body);
                  else
                    await api.updateShopService(editing.id, {
                      ...body,
                      isActive: editing.isActive,
                      sortOrder: editing.sortOrder,
                    });
                  await refresh();
                  setEditing(null);
                },
                "บันทึกบริการแล้ว",
                (path) => (path === "priceSatang" ? "priceBaht" : path),
              );
            }}
          >
            <fieldset disabled={busy} className="space-y-4">
              <Input
                label="ชื่อบริการ"
                required
                maxLength={60}
                value={draft.name}
                error={errors.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
              <div className="flex flex-wrap gap-2">
                {["เย็บมุม", "สันเกลียว", "สันกาว", "ปกใส", "เคลือบ", "เจาะรู"].map((name) => (
                  <Button
                    key={name}
                    variant="secondary"
                    onClick={() => setDraft({ ...draft, name })}
                  >
                    {name}
                  </Button>
                ))}
              </div>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.negotiated}
                  onChange={(event) => setDraft({ ...draft, negotiated: event.target.checked })}
                />
                ราคาตามตกลง (ร้านกรอกให้ตอนยืนยันราคา)
              </label>
              <Input
                label="ราคา (บาท)"
                hint="มากกว่า 0 ถึง 10,000 บาท"
                inputMode="decimal"
                disabled={draft.negotiated}
                value={draft.priceBaht}
                error={errors.priceBaht}
                onChange={(event) => setDraft({ ...draft, priceBaht: event.target.value })}
              />
              <label className="block">
                คิดราคา
                <select
                  className="ml-3 min-h-11 rounded-control border border-line p-2"
                  value={draft.unit}
                  onChange={(event) =>
                    setDraft({ ...draft, unit: event.target.value as typeof draft.unit })
                  }
                >
                  <option value="per_set">ต่อชุด</option>
                  <option value="per_order">ต่อออเดอร์</option>
                </select>
              </label>
              {errors.unit && (
                <p role="alert" className="text-danger">
                  {errors.unit}
                </p>
              )}
              <p className="rounded-control bg-surface p-3">ลูกค้าจะเห็น: {preview}</p>
            </fieldset>
            <div className="flex gap-2">
              <Button type="submit" loading={busy}>
                บันทึกบริการ
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setEditing(null);
                  clearErrors();
                }}
              >
                ยกเลิก
              </Button>
            </div>
          </form>
        </Card>
      )}
      {errors._form && (
        <p role="alert" className="text-danger">
          {errors._form}
        </p>
      )}
    </div>
  );
}
