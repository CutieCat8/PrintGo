/**
 * The menu pinned to the bottom of the PrintGo chat (wireframe: a big "order" button over
 * "status" and "chat with shop"). The picture is scripts/assets/richmenu.png; the three tap
 * areas below must match it. Each button opens a LIFF page.
 */
const WIDTH = 2500;
const HEIGHT = 1686;
const HALF_W = WIDTH / 2;
const TOP_H = 843;

const open = (liffId: string, path: string, label: string) => ({
  type: "uri" as const,
  label,
  uri: `https://liff.line.me/${liffId}${path}`,
});

export function buildRichMenu(liffId: string) {
  return {
    size: { width: WIDTH, height: HEIGHT },
    selected: true,
    name: "PrintGo main menu",
    chatBarText: "เมนู",
    areas: [
      {
        bounds: { x: 0, y: 0, width: WIDTH, height: TOP_H },
        action: open(liffId, "/new", "สั่งปริ้น"),
      },
      {
        bounds: { x: 0, y: TOP_H, width: HALF_W, height: HEIGHT - TOP_H },
        action: open(liffId, "/orders", "สถานะงาน"),
      },
      {
        bounds: { x: HALF_W, y: TOP_H, width: HALF_W, height: HEIGHT - TOP_H },
        action: open(liffId, "/chats", "คุยกับร้าน"),
      },
    ],
  };
}

const API = "https://api.line.me/v2/bot";
const API_DATA = "https://api-data.line.me/v2/bot"; // the picture goes to a different host

/**
 * Puts the menu on the LINE account: create it, upload the picture, make it the default for all
 * users. If a step fails, the half-made menu is deleted. The menu it replaces is deleted too, so
 * running the script again does not leave old menus behind. Returns the new richMenuId.
 */
export async function installRichMenu(opts: { token: string; liffId: string; image: Uint8Array }) {
  const auth = { Authorization: `Bearer ${opts.token}` };
  const call = async (
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: BodyInit,
  ) => {
    const res = await fetch(url, { method, headers: { ...auth, ...headers }, body });
    if (!res.ok)
      throw new Error(
        `LINE ${method} ${url.replace(/^https:\/\/[^/]+/, "")} answered ${res.status}: ${(await res.text()).slice(0, 300)}`,
      );
    return res;
  };

  const previous = await fetch(`${API}/user/all/richmenu`, { headers: auth })
    .then((r) => (r.ok ? (r.json() as Promise<{ richMenuId?: string }>) : {}))
    .then((b) => ("richMenuId" in b ? b.richMenuId : undefined));

  const created = await call(
    "POST",
    `${API}/richmenu`,
    { "Content-Type": "application/json" },
    JSON.stringify(buildRichMenu(opts.liffId)),
  );
  const { richMenuId } = (await created.json()) as { richMenuId: string };

  try {
    await call(
      "POST",
      `${API_DATA}/richmenu/${richMenuId}/content`,
      { "Content-Type": "image/png" },
      opts.image as BodyInit,
    );
    await call("POST", `${API}/user/all/richmenu/${richMenuId}`, {});
  } catch (error) {
    await call("DELETE", `${API}/richmenu/${richMenuId}`, {}).catch(() => {}); // best effort
    throw error;
  }

  if (previous) await call("DELETE", `${API}/richmenu/${previous}`, {}).catch(() => {});
  return richMenuId;
}
