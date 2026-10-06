import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppUpdatesHarness, nodes, textOf, tick } from "./helpers/mobile-app-updates-client.mjs";

test("public app links work without a session and never include account data in their URLs", async () => {
  for (const os of ["android", "ios", "web"]) {
    const h = createAppUpdatesHarness({ os });
    try {
      h.state.sessionToken = null;
      const screen = h.mount(h.load("components/public-app-links.tsx").PublicAppLinks);
      const links = nodes(screen.tree).filter(row => row.props?.accessibilityRole === "link");
      assert.deepEqual(links.map(row => row.props.accessibilityLabel), ["개인정보처리방침", "앱 지원"]);
      for (const link of links) { link.props.onPress(); await tick(); }
      assert.deepEqual(h.state.openedUrls, ["https://www.bajaul.com/mobile-app/privacy", "https://www.bajaul.com/mobile-app/support"]);
      assert.equal(h.state.routes.length, 0);
    } finally { h.dispose(); }
  }
});

test("a browser-opening failure preserves a selectable public address for recovery", async () => {
  const h = createAppUpdatesHarness();
  try {
    h.state.onOpenURL = async () => { throw new Error("browser unavailable"); };
    const screen = h.mount(h.load("components/public-app-links.tsx").PublicAppLinks);
    nodes(screen.tree).find(row => row.props?.accessibilityLabel === "개인정보처리방침")!.props.onPress();
    await tick(); screen.update();
    const feedback = nodes(screen.tree).find(row => row.props?.accessibilityRole === "alert")!;
    assert.equal(feedback.props.selectable, true);
    assert.match(textOf(feedback), /https:\/\/www\.bajaul\.com\/mobile-app\/privacy/);
    assert.doesNotMatch(textOf(feedback), /synthetic-token/);
  } finally { h.dispose(); }
});
