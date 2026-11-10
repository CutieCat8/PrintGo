import { mockApi } from "./mock/server";
import { realApi, type Api } from "./real";

/**
 * What pages import: `import { api } from "@/lib/client/api"`.
 * NEXT_PUBLIC_USE_MOCK=true -> in-memory mock (sample data, ตัวอย่างสมมติ); anything else -> real API.
 * The name is written out in full so Next.js inlines it at build time.
 */
export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true";

export const api: Api = USE_MOCK ? mockApi : realApi;

export type { Api } from "./real";
export { ApiClientError, errorMessage, isApiClientError, setCustomerTokenProvider } from "./http";
