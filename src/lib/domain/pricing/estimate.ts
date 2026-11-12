import { ApiError } from "@/lib/errors";
import type { ColorMode, Fulfillment, Paper, ServiceUnit, Sides } from "@/lib/db/enums";

/** Shapes below follow docs/CONTRACTS.md sections 3 and 5. */
export type FileSetting = {
  pageCount: number;
  color: ColorMode;
  paper: Paper;
  sides: Sides;
  copies: number;
};
export type PricingRule = {
  color: ColorMode;
  paper: Paper;
  sides: Sides;
  pricePerPageSatang: number;
};
export type DiscountTier = { minPages: number };
export type ShopServiceInput = {
  id: string;
  name: string;
  priceSatang: number | null; // null = "ราคาตามตกลง"
  unit: ServiceUnit;
  isActive: boolean;
};
export type SelectedService = { serviceId: string; fileIndexes?: number[] };

export type EstimateInput = {
  files: FileSetting[];
  rules: PricingRule[];
  tiers: DiscountTier[];
  shopServices: ShopServiceInput[];
  selectedServices: SelectedService[];
  fulfillment: Fulfillment;
  deliveryFeeSatang: number;
};

export type ServiceLine = {
  serviceId: string;
  name: string;
  unit: ServiceUnit;
  unitPriceSatang: number | null;
  fileIndex: number | null; // null for per_order
  quantity: number;
  lineTotalSatang: number | null;
};

export type Estimate = {
  requiresManualPrice: boolean;
  /** Internal "starting price" for the shop. Never send to a customer when manual: use customerVisible(). */
  estimatedPrintSatang: number;
  estimatedServicesSatang: number;
  serviceLines: ServiceLine[];
  totalPages: number;
  perFile: { filePrice: number; pages: number }[];
  deliveryFeeSatang: number;
};

export type CustomerEstimate = {
  requiresManualPrice: boolean;
  estimatedPrintSatang: number | null;
  estimatedServicesSatang: number | null;
  serviceLines: ServiceLine[];
  totalPages: number;
  perFile: { filePrice: number | null; pages: number }[];
  deliveryFeeSatang: number;
};

function invalid(
  message: string,
  details: Record<string, unknown> = {},
): ApiError<"VALIDATION_ERROR"> {
  return new ApiError("VALIDATION_ERROR", 422, message, details);
}

function isPositiveInt(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0;
}
function isNonNegativeInt(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
}

export function estimate(input: EstimateInput): Estimate {
  const { files, rules, tiers, shopServices, selectedServices, fulfillment, deliveryFeeSatang } =
    input;

  if (files.length === 0) throw invalid("ต้องมีอย่างน้อย 1 ไฟล์");
  if (!isNonNegativeInt(deliveryFeeSatang)) throw invalid("ค่าส่งไม่ถูกต้อง");

  const perFile: Estimate["perFile"] = [];
  let totalPages = 0;
  let estimatedPrintSatang = 0;

  files.forEach((file, fileIndex) => {
    if (!isPositiveInt(file.pageCount)) {
      throw invalid("จำนวนหน้าต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป", { fileIndex });
    }
    if (!isPositiveInt(file.copies)) {
      throw invalid("จำนวนชุดต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป", { fileIndex });
    }
    const rule = rules.find(
      (r) => r.color === file.color && r.paper === file.paper && r.sides === file.sides,
    );
    if (!rule) {
      throw invalid("ร้านนี้ไม่รับงานชุดค่านี้", {
        fileIndex,
        color: file.color,
        paper: file.paper,
        sides: file.sides,
      });
    }
    if (!isNonNegativeInt(rule.pricePerPageSatang)) {
      throw invalid("ราคาต่อหน้าของร้านไม่ถูกต้อง", { fileIndex });
    }
    const pages = file.pageCount * file.copies;
    const filePrice = pages * rule.pricePerPageSatang;
    perFile.push({ filePrice, pages });
    totalPages += pages;
    estimatedPrintSatang += filePrice;
  });

  const serviceLines: ServiceLine[] = [];
  let estimatedServicesSatang = 0;
  let manualService = false;
  const seen = new Set<string>();

  for (const sel of selectedServices) {
    if (seen.has(sel.serviceId)) {
      throw invalid("เลือกบริการเสริมซ้ำกัน", { serviceId: sel.serviceId });
    }
    seen.add(sel.serviceId);
    const svc = shopServices.find((s) => s.id === sel.serviceId && s.isActive);
    if (!svc) throw invalid("ไม่พบบริการเสริมนี้ในร้าน", { serviceId: sel.serviceId });
    if (svc.priceSatang !== null && !isPositiveInt(svc.priceSatang)) {
      throw invalid("ราคาบริการเสริมไม่ถูกต้อง", { serviceId: svc.id });
    }
    if (svc.priceSatang === null) manualService = true;

    // Validate fileIndexes whenever given, for any unit.
    let selectedIndexes: number[] | undefined;
    if (sel.fileIndexes !== undefined) {
      if (sel.fileIndexes.length === 0) {
        throw invalid("ต้องเลือกไฟล์สำหรับบริการเสริมอย่างน้อย 1 ไฟล์", { serviceId: svc.id });
      }
      const uniq = new Set<number>();
      for (const i of sel.fileIndexes) {
        if (!Number.isSafeInteger(i) || i < 0 || i >= files.length) {
          throw invalid("ลำดับไฟล์ของบริการเสริมไม่ถูกต้อง", {
            serviceId: svc.id,
            fileIndex: i,
          });
        }
        if (uniq.has(i)) {
          throw invalid("เลือกไฟล์ซ้ำในบริการเสริม", { serviceId: svc.id, fileIndex: i });
        }
        uniq.add(i);
      }
      selectedIndexes = [...uniq].sort((a, b) => a - b);
    }

    let targets: (number | null)[];
    if (svc.unit === "per_order") {
      targets = [null]; // charged once; a valid fileIndexes is accepted but not used
    } else {
      targets = selectedIndexes ?? files.map((_, i) => i);
    }

    for (const fileIndex of targets) {
      const quantity = fileIndex === null ? 1 : files[fileIndex].copies;
      const lineTotalSatang = svc.priceSatang === null ? null : svc.priceSatang * quantity;
      if (lineTotalSatang !== null) estimatedServicesSatang += lineTotalSatang;
      serviceLines.push({
        serviceId: svc.id,
        name: svc.name,
        unit: svc.unit,
        unitPriceSatang: svc.priceSatang,
        fileIndex,
        quantity,
        lineTotalSatang,
      });
    }
  }

  // Volume discount is judged on the whole order (CONTRACTS section 5).
  const requiresManualPrice = tiers.some((t) => totalPages >= t.minPages) || manualService;

  return {
    requiresManualPrice,
    estimatedPrintSatang,
    estimatedServicesSatang,
    serviceLines,
    totalPages,
    perFile,
    deliveryFeeSatang: fulfillment === "delivery" ? deliveryFeeSatang : 0,
  };
}

/** What a customer may see: when the shop must set the price, every amount is null (CLAUDE.md rule 7). */
export function customerVisible(e: Estimate): CustomerEstimate {
  if (!e.requiresManualPrice) {
    return {
      ...e,
      serviceLines: e.serviceLines.map((l) => ({ ...l })),
      perFile: e.perFile.map((f) => ({ ...f })),
    };
  }
  return {
    requiresManualPrice: true,
    estimatedPrintSatang: null,
    estimatedServicesSatang: null,
    serviceLines: e.serviceLines.map((l) => ({
      ...l,
      unitPriceSatang: null,
      lineTotalSatang: null,
    })),
    totalPages: e.totalPages,
    perFile: e.perFile.map((f) => ({ filePrice: null, pages: f.pages })),
    deliveryFeeSatang: e.deliveryFeeSatang,
  };
}
