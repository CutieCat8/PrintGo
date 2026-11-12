// Minimal declarations for the approved qrcode package's server-side PNG API.
declare module "qrcode" {
  export function toDataURL(
    text: string,
    options: { type: "image/png"; errorCorrectionLevel: "M"; margin: number; width: number },
  ): Promise<string>;
}
