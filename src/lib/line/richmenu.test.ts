import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRichMenu, installRichMenu } from "./richmenu";

const LIFF = "1234567890-AbCdEfGh";

describe("buildRichMenu", () => {
  const menu = buildRichMenu(LIFF);

  it("is the 2500x1686 size the committed image has", () => {
    expect(menu.size).toEqual({ width: 2500, height: 1686 });
  });

  it("has the three buttons of the wireframe, each opening its LIFF page", () => {
    expect(menu.areas.map((a) => a.action.uri)).toEqual([
      `https://liff.line.me/${LIFF}/new`,
      `https://liff.line.me/${LIFF}/orders`,
      `https://liff.line.me/${LIFF}/chats`,
    ]);
    expect(menu.areas.every((a) => a.action.type === "uri")).toBe(true);
  });

  it("covers the whole image once: no gap, no overlap", () => {
    const covered = menu.areas.reduce((sum, a) => sum + a.bounds.width * a.bounds.height, 0);
    expect(covered).toBe(menu.size.width * menu.size.height);
    for (const { bounds: b } of menu.areas) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(menu.size.width);
      expect(b.y + b.height).toBeLessThanOrEqual(menu.size.height);
    }
  });

  it("is shown (not collapsed) when a chat opens, and has a chat bar label", () => {
    expect(menu.selected).toBe(true);
    expect(menu.chatBarText.length).toBeGreaterThan(0);
  });
});

describe("installRichMenu", () => {
  const TOKEN = "secret-token";
  const image = new Uint8Array([137, 80, 78, 71]); // PNG magic bytes are enough for the test

  /** A fake LINE: answers each request from a table keyed by "METHOD url". */
  function fakeLine(routes: Record<string, () => Response>) {
    const calls: { key: string; init: RequestInit }[] = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
      const key = `${init.method ?? "GET"} ${url}`;
      calls.push({ key, init });
      const route = routes[key];
      return route ? route() : new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return calls;
  }
  const ok =
    (body: unknown = {}) =>
    () =>
      new Response(JSON.stringify(body), { status: 200 });
  afterEach(() => vi.unstubAllGlobals());

  it("creates the menu, uploads the picture, then makes it the default for everyone", async () => {
    const calls = fakeLine({
      "GET https://api.line.me/v2/bot/user/all/richmenu": () => new Response("{}", { status: 404 }),
      "POST https://api.line.me/v2/bot/richmenu": ok({ richMenuId: "richmenu-new" }),
      "POST https://api-data.line.me/v2/bot/richmenu/richmenu-new/content": ok(),
      "POST https://api.line.me/v2/bot/user/all/richmenu/richmenu-new": ok(),
    });

    await expect(installRichMenu({ token: TOKEN, liffId: LIFF, image })).resolves.toBe(
      "richmenu-new",
    );

    expect(calls.map((c) => c.key)).toEqual([
      "GET https://api.line.me/v2/bot/user/all/richmenu",
      "POST https://api.line.me/v2/bot/richmenu",
      "POST https://api-data.line.me/v2/bot/richmenu/richmenu-new/content",
      "POST https://api.line.me/v2/bot/user/all/richmenu/richmenu-new",
    ]);
    const upload = calls[2].init;
    expect((upload.headers as Record<string, string>)["Content-Type"]).toBe("image/png");
    expect(
      calls.every(
        (c) => (c.init.headers as Record<string, string>).Authorization === `Bearer ${TOKEN}`,
      ),
    ).toBe(true);
  });

  it("removes the menu it replaced, so re-running does not pile up old menus", async () => {
    const calls = fakeLine({
      "GET https://api.line.me/v2/bot/user/all/richmenu": ok({ richMenuId: "richmenu-old" }),
      "POST https://api.line.me/v2/bot/richmenu": ok({ richMenuId: "richmenu-new" }),
      "POST https://api-data.line.me/v2/bot/richmenu/richmenu-new/content": ok(),
      "POST https://api.line.me/v2/bot/user/all/richmenu/richmenu-new": ok(),
      "DELETE https://api.line.me/v2/bot/richmenu/richmenu-old": ok(),
    });
    await installRichMenu({ token: TOKEN, liffId: LIFF, image });
    expect(calls.at(-1)?.key).toBe("DELETE https://api.line.me/v2/bot/richmenu/richmenu-old");
  });

  it("deletes the half-made menu and reports LINE's reason when the upload fails", async () => {
    const calls = fakeLine({
      "GET https://api.line.me/v2/bot/user/all/richmenu": () => new Response("{}", { status: 404 }),
      "POST https://api.line.me/v2/bot/richmenu": ok({ richMenuId: "richmenu-new" }),
      "POST https://api-data.line.me/v2/bot/richmenu/richmenu-new/content": () =>
        new Response('{"message":"image too large"}', { status: 400 }),
      "DELETE https://api.line.me/v2/bot/richmenu/richmenu-new": ok(),
    });
    const error = await installRichMenu({ token: TOKEN, liffId: LIFF, image }).catch(
      (e: Error) => e,
    );
    expect((error as Error).message).toContain("image too large");
    expect((error as Error).message).not.toContain(TOKEN);
    expect(calls.at(-1)?.key).toBe("DELETE https://api.line.me/v2/bot/richmenu/richmenu-new");
  });
});
