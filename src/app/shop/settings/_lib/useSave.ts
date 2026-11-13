"use client";
import { useRef, useState } from "react";
import { useToast } from "@/components/ui";
import { errorsFrom, type FieldErrors } from "./forms";

export function useSave() {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const lock = useRef(false);
  const toast = useToast();
  async function run(
    work: () => Promise<void>,
    message = "บันทึกแล้ว",
    pathMap?: (path: string) => string,
  ) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setErrors({});
    try {
      await work();
      toast(message, "success");
      return true;
    } catch (error) {
      const fields = errorsFrom(error, pathMap);
      setErrors(fields);
      toast(fields._form ?? "กรุณาตรวจสอบข้อมูลที่กรอก", "error");
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, errors, run, clearErrors: () => setErrors({}) };
}
