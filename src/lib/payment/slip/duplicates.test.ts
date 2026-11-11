import { describe, expect, it } from "vitest";
import { mapSlipPersistenceError } from "./duplicates";

describe("payment slip persistence errors (simulated PostgreSQL errors, not live DB)", () => {
  it.each([
    { code: "23505", constraint: "payments_slip_ref_key" },
    {
      code: "23505",
      message: 'duplicate key value violates unique constraint "payments_slip_ref_key"',
    },
  ])("maps only the existing slip_ref unique constraint to 409", (error) => {
    expect(mapSlipPersistenceError(error)).toMatchObject({
      code: "PAYMENT_DUPLICATE_SLIP",
      status: 409,
    });
  });
  it.each([
    null,
    {},
    { code: "23505", constraint: "payments_one_verified_per_order" },
    { code: "23505", constraint: "another_key" },
    { code: "23505", message: "Key (id)=(payments_slip_ref_key) already exists." },
    { code: "42501", constraint: "payments_slip_ref_key" },
  ])("does not misreport unrelated DB errors %j", (error) => {
    expect(mapSlipPersistenceError(error)).toMatchObject({ code: "INTERNAL", status: 500 });
  });
  it("never includes raw database details in the response", () => {
    const mapped = mapSlipPersistenceError({
      code: "23505",
      constraint: "payments_slip_ref_key",
      message: "private-data",
    });
    expect(JSON.stringify(mapped.toBody())).not.toContain("private-data");
  });
});
