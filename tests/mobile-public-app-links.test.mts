import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createAppUpdatesHarness, nodes, textOf } from "./helpers/mobile-app-updates-client.mjs";
import { buildMobilePublicInformation, mobilePublicInformationPath, mobilePublicInformationSource } from "../scripts/mobile-public-information.mjs";

test("public links open local public routes without a session, browser or network", () => {
  for (const os of ["android", "ios", "web"]) {
    const h = createAppUpdatesHarness({ os });
    try {
      h.state.sessionToken = null;
      h.state.onOpenURL = async () => { throw Error("No browser installed"); };
      const screen = h.mount(h.load("components/public-app-links.tsx").PublicAppLinks);
      const links = nodes(screen.tree).filter(row => row.props?.accessibilityRole === "link");
      assert.deepEqual(links.map(row => row.props.accessibilityLabel), ["개인정보처리방침", "앱 지원"]);
      for (const link of links) link.props.onPress();
      assert.deepEqual(h.state.routes, ["/public-information/privacy", "/public-information/support"]);
      assert.deepEqual(h.state.openedUrls, []);
      assert.deepEqual(h.state.fetchCalls, []);
    } finally { h.dispose(); }
  }
});

test("bundled public content stays identical to the published page sources", () => {
  assert.equal(readFileSync(mobilePublicInformationPath, "utf8"), mobilePublicInformationSource(),
    "Run node scripts/mobile-public-information.mjs when changing public pages");
  const content = buildMobilePublicInformation();
  assert.equal(content.privacy.sections.length, 8);
  assert.equal(content.support.sections.length, 2);
  assert.ok(content.privacy.sections.find(section => section.title.startsWith("7.")).blocks.some(block => block.text.includes("artemismars2@gmail.com")));
  assert.ok(content.support.sections[0].blocks.some(block => block.text.includes("artemismars2@gmail.com")));
});

test("both public screens render complete offline content and return to the prior screen", () => {
  for (const page of ["privacy", "support"]) {
    const h = createAppUpdatesHarness();
    try {
      h.state.sessionToken = null;
      const screen = h.mount(h.load("components/public-app-information-screen.tsx").PublicAppInformationScreen, { page });
      const content = buildMobilePublicInformation()[page], text = textOf(screen.tree);
      for (const block of [...content.intro, ...content.sections.flatMap(section => section.blocks)]) {
        assert.ok(text.includes(block.text), "Missing published text: " + block.text);
        if (block.href) assert.ok(text.includes(block.href));
      }
      assert.ok(text.includes(content.url));
      assert.deepEqual(h.state.openedUrls, []);
      assert.deepEqual(h.state.fetchCalls, []);
      const back = nodes(screen.tree).find(row => row.props?.accessibilityLabel === "이전 화면으로");
      h.state.canGoBack = true; back.props.onPress();
      assert.deepEqual(h.state.navigation, [{ kind: "back" }]);
      h.state.canGoBack = false; back.props.onPress();
      assert.deepEqual(h.state.navigation[1], { kind: "replace", path: "/" });
    } finally { h.dispose(); }
  }
});
