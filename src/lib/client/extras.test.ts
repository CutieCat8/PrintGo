import { describe, expect, it } from "vitest";
import { matchService, servicesForExtras, shopExtras, wantedExtras } from "./extras";

const svc = (id: string, name: string, unit: "per_set" | "per_order" = "per_set") => ({
  id,
  name,
  unit,
  priceSatang: 1000,
});

const services = [
  svc("s1", "เย็บมุม", "per_order"),
  svc("s2", "ปกใส + ปกหลัง"),
  svc("s3", "เข้าเล่มสันกาว"),
];

describe("extras", () => {
  it("matches a wish to the shop's service by name", () => {
    expect(matchService(services, "clear_cover")?.id).toBe("s2");
    expect(matchService(services, "binding")?.id).toBe("s3");
    expect(matchService(services, "punch")).toBeNull();
  });

  it("lists wishes in catalogue order without repeats", () => {
    expect(
      wantedExtras([{ extras: ["binding"] }, { extras: ["clear_cover", "binding"] }, {}]),
    ).toEqual(["clear_cover", "binding"]);
  });

  it("splits what the shop has and does not have", () => {
    expect(shopExtras(services, ["clear_cover", "punch"])).toEqual({
      has: ["clear_cover"],
      missing: ["punch"],
    });
  });

  it("pre-selects per-set services for the files that asked, per-order once", () => {
    const files = [
      { extras: ["clear_cover" as const, "staple" as const] },
      { extras: [] },
      { extras: ["staple" as const] },
    ];
    expect(servicesForExtras(services, files)).toEqual([
      { serviceId: "s2", fileIndexes: [0] },
      { serviceId: "s1" },
    ]);
  });

  it("a per-set service every file wants is sent without fileIndexes (API default)", () => {
    const files = [{ extras: ["binding" as const] }, { extras: ["binding" as const] }];
    expect(servicesForExtras(services, files)).toEqual([{ serviceId: "s3" }]);
  });

  it("wishes the shop cannot do are skipped", () => {
    expect(servicesForExtras(services, [{ extras: ["punch" as const] }])).toEqual([]);
  });
});

describe("extras name matching", () => {
  it("tells stapling from binding that also says เย็บ", () => {
    const list = [svc("b", "เย็บเล่ม"), svc("m", "เย็บมุม", "per_order")];
    expect(matchService(list, "staple")?.id).toBe("m");
    expect(matchService(list, "binding")?.id).toBe("b");
  });

  it("understands common other names", () => {
    expect(matchService([svc("x", "ปก PVC")], "clear_cover")?.id).toBe("x");
    expect(matchService([svc("y", "แม็กมุมซ้าย")], "staple")?.id).toBe("y");
  });
});
