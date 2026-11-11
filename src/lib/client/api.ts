import { realApi, type Api } from "./real";

/**
 * What pages import: `import { api } from "@/lib/client/api"`.
 * NEXT_PUBLIC_USE_MOCK=true -> in-memory mock (sample data, ตัวอย่างสมมติ); anything else -> real API.
 * The name is written out in full so Next.js inlines it at build time.
 */
export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true";

/**
 * The mock is loaded on first use only, so with USE_MOCK=false its code and sample data are never
 * downloaded by the browser. Every API function is async, so the extra await changes nothing.
 */
function lazyMock(): Api {
  const load = () => import("./mock/server").then((m) => m.mockApi);
  return new Proxy({} as Api, {
    get:
      (_target, name: string) =>
      async (...args: unknown[]) => {
        const mock = await load();
        return (mock[name as keyof Api] as (...a: unknown[]) => unknown)(...args);
      },
  });
}

export const api: Api = USE_MOCK ? lazyMock() : realApi;

/** Mock-mode helpers (pretend to pay, new order ...). Loaded on demand, mock mode only. */
export async function loadMockDev() {
  return (await import("./mock/server")).mockDev;
}

export type { Api } from "./real";
export { ApiClientError, errorMessage, isApiClientError, setCustomerTokenProvider } from "./http";
