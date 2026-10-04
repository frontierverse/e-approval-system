import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAppUpdatesHarness, deferred, nodes, tick, textOf } from './helpers/mobile-app-updates-client.mjs';

const metadataKey = 'gyeoljaeon.app-updates.metadata.v1';
const updateB = { updateId: '22222222-2222-4222-8222-222222222222', createdAt: new Date('2026-10-04T01:00:00.000Z'), type: 'new', manifest: { id: '22222222-2222-4222-8222-222222222222', createdAt: '2026-10-04T01:00:00.000Z' } };
function setup(options: Record<string, unknown> = {}) {
  const h = createAppUpdatesHarness(options);
  const providerModule = h.load('providers/AppUpdatesProvider.tsx');
  const provider = h.mount(providerModule.AppUpdatesProvider, { children: 'unchanged-child' });
  const value = () => nodes(provider.tree).find(row => row.type?.context)!.props.value;
  const refresh = () => h.flush(provider);
  return { h, providerModule, provider, value, refresh, dispose() { h.dispose(); assert.equal(h.state.reloadCalls.length, 0, 'this feature never restarts an app, including ready/error transitions'); } };
}

function available(h: ReturnType<typeof createAppUpdatesHarness>) {
  h.state.native = { ...h.state.native, isStartupProcedureRunning: false, isUpdateAvailable: true, isUpdatePending: false, availableUpdate: updateB };
}
function ready(h: ReturnType<typeof createAppUpdatesHarness>) {
  h.state.native = { ...h.state.native, isStartupProcedureRunning: false, isChecking: false, isDownloading: false, isUpdateAvailable: true, isUpdatePending: true, availableUpdate: updateB, downloadedUpdate: updateB };
}

test('app updates observe native ON_LOAD without a second network request and preserve children', async () => {
  const s = setup();
  try {
    await s.refresh();
    assert.equal(s.value().enabled, true);
    assert.equal(s.h.state.checkCalls.length, 0);
    assert.equal(s.h.state.downloadCalls.length, 0);
    assert.equal(s.provider.tree.props.children, 'unchanged-child');
    assert.equal(s.value().current.updateId, s.h.state.native.currentlyRunning.updateId);
    assert.equal(s.value().current.publishedAt, '2026-10-01T00:00:00.000Z');
    assert.notEqual(s.value().observedAt, s.value().current.publishedAt);
  } finally { s.dispose(); }
});

test('app updates refuse manual duplicate work during a native startup check/download', async () => {
  const s = setup();
  try {
    s.h.state.native = { ...s.h.state.native, isStartupProcedureRunning: true, isChecking: true };
    await s.refresh();
    await Promise.all([s.value().check(), s.value().download()]);
    assert.equal(s.h.state.checkCalls.length, 0); assert.equal(s.h.state.downloadCalls.length, 0);
    assert.equal(s.value().busy, true);
    s.h.state.native = { ...s.h.state.native, isChecking: false, isDownloading: true, downloadProgress: 0.25 };
    await s.refresh(); await s.value().check();
    assert.equal(s.h.state.checkCalls.length, 0); assert.equal(s.value().phase, 'downloading'); assert.equal(s.value().progress, 0.25);
  } finally { s.dispose(); }
});

test('app updates accept finite native progress only while downloading and never infer ready from 100 percent', async () => {
  const s = setup();
  try {
    for (const [raw, expected] of [[undefined, null], [0, 0], [0.4, 0.4], [1, 1], [-0.01, null], [1.01, null], [Number.NaN, null], [Infinity, null], ['0.5', null]]) {
      s.h.state.native = { ...s.h.state.native, isDownloading: true, isUpdatePending: false, downloadProgress: raw };
      await s.refresh(); assert.equal(s.value().phase, 'downloading'); assert.equal(s.value().progress, expected);
    }
    s.h.state.native = { ...s.h.state.native, isDownloading: false, isUpdatePending: false, downloadProgress: 1 };
    await s.refresh(); assert.equal(s.value().progress, null); assert.notEqual(s.value().phase, 'ready');
  } finally { s.dispose(); }
});

test('app updates manual check and available download use one synchronous mutex', async () => {
  const s = setup(), check = deferred(), download = deferred();
  try {
    await s.refresh(); s.h.state.onCheck = () => check.promise; s.h.state.onDownload = () => download.promise;
    const first = s.value().check(); const capturedCheck = s.value().check;
    await Promise.all([capturedCheck(), s.value().download()]);
    assert.equal(s.h.state.checkCalls.length, 1); assert.equal(s.h.state.downloadCalls.length, 0);
    available(s.h); check.resolve({ isAvailable: true, manifest: updateB.manifest });
    await tick(); await s.refresh();
    assert.equal(s.h.state.downloadCalls.length, 1);
    await Promise.all([capturedCheck(), s.value().download()]); assert.equal(s.h.state.downloadCalls.length, 1);
    ready(s.h); download.resolve({ isNew: true, manifest: updateB.manifest }); await first; await s.refresh();
    assert.equal(s.value().phase, 'ready'); assert.equal(s.value().busy, false);
    assert.equal(s.value().downloaded.updateId, updateB.updateId);
  } finally { check.resolve({ isAvailable: false }); download.resolve({ isNew: false }); s.dispose(); }
});

test('app updates failed manual check reports a safe error and permits an explicit retry', async () => {
  const s = setup();
  try {
    await s.refresh(); s.h.state.onCheck = async () => { throw Error('synthetic signed-url=secret-token native-path'); };
    await s.value().check(); await s.refresh();
    assert.equal(s.value().phase, 'error'); assert.equal(s.value().busy, false);
    assert.ok(s.value().error); assert.doesNotMatch(s.value().error, /secret-token|native-path|signed-url/);
    s.h.state.onCheck = async () => ({ isAvailable: false });
    await s.value().check(); await s.refresh();
    assert.equal(s.h.state.checkCalls.length, 2); assert.equal(s.value().error, null);
    assert.notEqual(s.value().phase, 'error'); assert.equal(s.h.state.downloadCalls.length, 0);
  } finally { s.dispose(); }
});

test('app updates failed download retains availability for explicit download retry', async () => {
  const s = setup();
  try {
    await s.refresh(); available(s.h); await s.refresh();
    s.h.state.onDownload = async () => { throw Error('synthetic asset failure'); };
    await s.value().download(); await s.refresh();
    assert.equal(s.value().phase, 'error'); assert.equal(s.value().busy, false);
    assert.equal(s.value().available.updateId, updateB.updateId);
    s.h.state.onDownload = async () => { ready(s.h); return { isNew: true, manifest: updateB.manifest }; };
    await s.value().download(); await s.refresh();
    assert.equal(s.h.state.checkCalls.length, 0); assert.equal(s.h.state.downloadCalls.length, 2);
    assert.equal(s.value().phase, 'ready'); assert.equal(s.value().error, null);
  } finally { s.dispose(); }
});

test('app updates ready does not mark the downloaded bundle as already running on this device', async () => {
  const s = setup();
  try {
    await s.refresh(); const observed = s.value().observedAt;
    s.h.state.clock += 60_000; ready(s.h); await s.refresh();
    assert.equal(s.value().phase, 'ready'); assert.equal(s.value().current.updateId, '11111111-1111-4111-8111-111111111111');
    assert.equal(s.value().downloaded.updateId, updateB.updateId); assert.equal(s.value().observedAt, observed);
    assert.notEqual(s.value().current.publishedAt, s.value().downloaded.publishedAt);
    assert.ok(s.value().lastDownloadedAt);
  } finally { s.dispose(); }
});

test('app updates same running ID retains its first device observation across a cold restart', async () => {
  const disk = new Map<string, string>(), first = setup({ disk });
  let observed: string;
  try { await first.refresh(); observed = first.value().observedAt; assert.ok(observed); assert.ok(disk.has(metadataKey)); }
  finally { first.dispose(); }
  const second = setup({ disk });
  try {
    second.h.state.clock += 3_600_000; await second.refresh();
    assert.equal(second.value().observedAt, observed!);
    assert.equal(second.value().current.publishedAt, '2026-10-01T00:00:00.000Z');
    for (const call of second.h.state.storageCalls.filter(v => v.operation === 'set')) assert.doesNotMatch(call.value, /actorId|authToken|signedUrl|fileUri/);
  } finally { second.dispose(); }
});

test('app updates a different running ID receives a new observation rather than a copied publication date', async () => {
  const disk = new Map<string, string>(), first = setup({ disk });
  try { await first.refresh(); } finally { first.dispose(); }
  const h = createAppUpdatesHarness({ disk }); h.state.clock += 86_400_000;
  h.state.native = { ...h.state.native, currentlyRunning: { ...h.state.native.currentlyRunning, updateId: updateB.updateId, createdAt: updateB.createdAt } };
  const provider = h.mount(h.load('providers/AppUpdatesProvider.tsx').AppUpdatesProvider, { children: null });
  try {
    await h.flush(provider); const value = nodes(provider.tree).find(row => row.type?.context)!.props.value;
    assert.equal(value.observedAt, new Date(h.state.clock).toISOString());
    assert.equal(value.current.publishedAt, updateB.createdAt.toISOString()); assert.notEqual(value.observedAt, value.current.publishedAt);
  } finally { h.dispose(); assert.equal(h.state.reloadCalls.length, 0); }
});

test('app updates storage errors keep native update actions usable without exposing native details', async () => {
  const s = setup();
  try {
    s.h.state.onStorage = async () => { throw Error('file:///native-private-path secret-token'); };
    await s.refresh(); assert.ok(s.value().storageError);
    assert.doesNotMatch(s.value().storageError, /native-private-path|secret-token/);
    s.h.state.onCheck = async () => ({ isAvailable: false }); await s.value().check(); await s.refresh();
    assert.equal(s.h.state.checkCalls.length, 1); assert.equal(s.value().busy, false);
  } finally { s.dispose(); }
});

test('app updates malformed saved metadata cannot become a fabricated device application time', async () => {
  const disk = new Map([[metadataKey, '{"observedAt":"not-a-date","secret":"ignored"}']]), s = setup({ disk });
  try {
    await s.refresh(); assert.notEqual(s.value().observedAt, 'not-a-date');
    assert.equal(s.value().current.updateId, s.h.state.native.currentlyRunning.updateId);
    assert.equal(s.value().current.publishedAt, '2026-10-01T00:00:00.000Z');
  } finally { s.dispose(); }
});

test('app updates unmount rejects captured callbacks and never follows a late check with a download', async () => {
  const s = setup(), held = deferred();
  try {
    await s.refresh(); s.h.state.onCheck = () => held.promise;
    const captured = s.value(), request = captured.check(); assert.equal(s.h.state.checkCalls.length, 1);
    s.provider.unmount(); held.resolve({ isAvailable: true, manifest: updateB.manifest }); await request; await tick();
    await Promise.all([captured.check(), captured.download()]);
    assert.equal(s.h.state.checkCalls.length, 1); assert.equal(s.h.state.downloadCalls.length, 0);
    assert.equal([...s.h.state.listeners.values()].reduce((sum, rows) => sum + rows.size, 0), 0);
  } finally { held.resolve({ isAvailable: false }); s.dispose(); }
});

test('app updates held storage read after unmount cannot start a new device metadata write', async () => {
  const h = createAppUpdatesHarness(), held = deferred();
  h.state.onStorage = call => call.operation === 'get' ? held.promise : call.apply();
  const provider = h.mount(h.load('providers/AppUpdatesProvider.tsx').AppUpdatesProvider, { children: null });
  try {
    await tick(); provider.unmount(); held.resolve(null); await tick();
    assert.equal(h.state.storageCalls.filter(v => v.operation === 'set').length, 0);
  } finally { held.resolve(null); h.dispose(); assert.equal(h.state.reloadCalls.length, 0); }
});

for (const [name, options] of [['web', { os: 'web' }], ['development', { development: true }], ['disabled native module', {}]]) {
  test(`app updates ${name} never calls unsupported native update APIs`, async () => {
    const h = createAppUpdatesHarness(options); if (name === 'disabled native module') h.state.updatesEnabled = false;
    const provider = h.mount(h.load('providers/AppUpdatesProvider.tsx').AppUpdatesProvider, { children: null });
    try {
      await h.flush(provider); const value = nodes(provider.tree).find(row => row.type?.context)!.props.value;
      await Promise.all([value.check(), value.download()]);
      assert.equal(value.enabled, false); assert.equal(value.phase, 'disabled'); assert.equal(value.busy, false);
      assert.equal(h.state.checkCalls.length, 0); assert.equal(h.state.downloadCalls.length, 0); assert.equal(h.state.storageCalls.length, 0);
    } finally { h.dispose(); assert.equal(h.state.reloadCalls.length, 0); }
  });
}


test('app updates native startup failures are sanitized and explicit check suppresses the resolved old error', async () => {
  const s = setup();
  try {
    s.h.state.native = { ...s.h.state.native, downloadError: Error('signed asset URL secret-token') };
    await s.refresh(); assert.equal(s.value().phase, 'error'); assert.doesNotMatch(s.value().error, /secret-token|signed asset/);
    await s.value().check(); await s.refresh();
    assert.equal(s.h.state.checkCalls.length, 1); assert.equal(s.value().error, null); assert.equal(s.value().phase, 'idle');
  } finally { s.dispose(); }
});

test('app updates rollback preparation is not represented as a newly running downloaded bundle', async () => {
  const s = setup();
  try {
    await s.refresh(); const observed = s.value().observedAt;
    s.h.state.onCheck = async () => ({ isAvailable: false, isRollBackToEmbedded: true });
    s.h.state.onDownload = async () => ({ isNew: false, isRollBackToEmbedded: true });
    await s.value().check(); await s.refresh();
    assert.equal(s.h.state.checkCalls.length, 1); assert.equal(s.h.state.downloadCalls.length, 1);
    assert.equal(s.value().phase, 'ready'); assert.equal(s.value().downloaded.rollback, true);
    assert.equal(s.value().downloaded.updateId, null); assert.equal(s.value().current.embedded, false);
    assert.equal(s.value().current.updateId, '11111111-1111-4111-8111-111111111111'); assert.equal(s.value().observedAt, observed);
  } finally { s.dispose(); }
});

test('app updates ordered metadata writes cannot let an earlier OS acknowledgement overwrite the latest download time', async () => {
  const s = setup(), held = deferred();
  try {
    await s.refresh(); let stopped = false;
    s.h.state.onStorage = async call => {
      if (call.operation === 'set' && !stopped) { stopped = true; await held.promise; }
      return call.apply();
    };
    s.h.state.clock += 60_000;
    s.h.state.native = { ...s.h.state.native, lastCheckForUpdateTimeSinceRestart: new Date(s.h.state.clock) };
    await s.refresh(); assert.equal(stopped, true);
    s.h.state.clock += 60_000; ready(s.h); await s.refresh();
    const latest = s.value().lastDownloadedAt; assert.equal(latest, new Date(s.h.state.clock).toISOString());
    held.resolve(); await s.refresh();
    const metadata = JSON.parse(s.h.state.disk.get(metadataKey)!);
    assert.equal(metadata.lastDownloadedAt, latest); assert.equal(metadata.downloadedKey, updateB.updateId);
    assert.equal(metadata.observedAt, '2026-10-04T12:00:00.000Z');
    for (const call of s.h.state.storageCalls.filter(v => v.operation === 'set')) {
      assert.equal(call.options.keychainAccessible, 'synthetic-this-device-only');
      assert.equal(call.options.requireAuthentication, false); assert.equal(call.options.keychainService, 'gyeoljaeon.app-updates');
    }
  } finally { held.resolve(); s.dispose(); }
});

test('app updates metadata read with unknown keys or identity/time contradictions is not trusted', async () => {
  const seed = setup(), disk = seed.h.state.disk;
  try { await seed.refresh(); } finally { seed.dispose(); }
  const saved = JSON.parse(disk.get(metadataKey)!);
  for (const invalid of [
    { ...saved, extra: 'not-a-verified-field', observedAt: '2001-01-01T00:00:00.000Z' },
    { ...saved, version: 2, observedAt: '2001-01-01T00:00:00.000Z' },
    { ...saved, currentKey: null, observedAt: '2001-01-01T00:00:00.000Z' },
    { ...saved, downloadedKey: 'orphan-key', lastDownloadedAt: null, observedAt: '2001-01-01T00:00:00.000Z' },
  ]) {
    const s = setup({ disk: new Map([[metadataKey, JSON.stringify(invalid)]]) });
    try { await s.refresh(); assert.equal(s.value().observedAt, '2026-10-04T12:00:00.000Z'); }
    finally { s.dispose(); }
  }
});

test('app updates footer observes the actual provider and only opens a status screen', async () => {
  const s = setup();
  try {
    await s.refresh(); ready(s.h); await s.refresh();
    const footer = s.h.mount(s.h.load('components/app-update-status.tsx').AppUpdateStatus, {});
    assert.match(textOf(footer.tree), /다운로드 완료.*적용 대기/);
    const link = nodes(footer.tree).find(row => row.type === 'TextAction')!;
    assert.equal(link.props.accessibilityLabel, '앱 업데이트 상태 보기'); link.props.onPress();
    assert.deepEqual(s.h.state.routes, ['/app-updates']);
    assert.equal(s.h.state.checkCalls.length, 0); assert.equal(s.h.state.downloadCalls.length, 0);
    s.h.state.pathname = '/app-updates'; footer.update(); assert.equal(footer.tree, null);
  } finally { s.dispose(); }
});

test('app updates actual progress leaf distinguishes unknown from 0 and finishing from applied', async () => {
  const s = setup();
  try {
    const ui = s.h.load('components/app-update-status.tsx');
    const unknown = s.h.mount(ui.AppUpdateProgress, { progress: null });
    assert.ok(nodes(unknown.tree).some(row => row.type === 'ActivityIndicator'));
    assert.equal(nodes(unknown.tree).filter(row => row.props?.accessibilityRole === 'progressbar').length, 0);
    const zero = s.h.mount(ui.AppUpdateProgress, { progress: 0 });
    assert.deepEqual(zero.tree.props.accessibilityValue, { min: 0, max: 100, now: 0 });
    assert.deepEqual(s.h.mount(ui.AppUpdateProgress, { progress: 0.429 }).tree.props.accessibilityValue, { min: 0, max: 100, now: 42 });
    assert.match(ui.appUpdateTitle('downloading', 1), /100%.*마무리/);
    assert.doesNotMatch(ui.appUpdateTitle('downloading', 1), /적용 완료/);
    assert.equal(ui.formatAppUpdateTime(null), '확인 기록 없음'); assert.equal(ui.formatAppUpdateTime('invalid'), '확인 기록 없음');
    assert.notEqual(ui.formatAppUpdateTime('2026-10-04T03:00:00.000Z'), ui.formatAppUpdateTime('2026-10-04T04:00:00.000Z'));
  } finally { s.dispose(); }
});

test('app updates ready page explains a manual cold restart and has no reload/download action', async () => {
  const s = setup();
  try {
    await s.refresh(); ready(s.h); await s.refresh();
    const page = s.h.mount(s.h.load('app/app-updates.tsx').default, {}), text = textOf(page.tree);
    assert.match(text, /작성 중인 내용을 저장한 뒤 앱을 완전히 종료/);
    assert.match(text, /다음 실행에서 적용/);
    assert.match(text, /현재 적용된 업데이트/); assert.match(text, /게시 시각/); assert.match(text, /이 기기에서 적용 확인/);
    assert.match(text, /실제 설치 시각과 다를 수/);
    assert.equal(nodes(page.tree).filter(row => ['PrimaryButton', 'TextAction'].includes(row.type)).length, 0);
    assert.match(text, /앱 버전 1\.0\.5/);
  } finally { s.dispose(); }
});

test('app updates actual page manual retry routes to check or download while busy disables the action', async () => {
  const s = setup(), held = deferred();
  try {
    await s.refresh(); const page = s.h.mount(s.h.load('app/app-updates.tsx').default, {});
    const button = () => nodes(page.tree).find(row => row.type === 'PrimaryButton')!;
    assert.equal(button().props.title, '업데이트 확인');
    s.h.state.onCheck = () => held.promise; button().props.onPress(); await tick(); await s.refresh(); page.update();
    assert.equal(button().props.disabled, true); assert.match(button().props.title, /확인 중/);
    held.reject(Error('synthetic failure')); await tick(); await s.refresh(); page.update();
    assert.equal(button().props.disabled, false); assert.equal(button().props.title, '업데이트 다시 확인');
    available(s.h); await s.refresh(); page.update(); assert.equal(button().props.title, '다운로드 다시 시도');
    s.h.state.onDownload = async () => { ready(s.h); return { isNew: true, manifest: updateB.manifest }; };
    button().props.onPress(); await tick(); await s.refresh(); page.update();
    assert.equal(s.h.state.checkCalls.length, 1); assert.equal(s.h.state.downloadCalls.length, 1); assert.equal(s.value().phase, 'ready');
    assert.equal(nodes(page.tree).filter(row => row.type === 'PrimaryButton').length, 0);
  } finally { held.resolve({ isAvailable: false }); s.dispose(); }
});

test('app updates disabled footer is hidden and disabled page offers no native controls', async () => {
  const s = setup({ os: 'web' });
  try {
    await s.refresh(); assert.equal(s.h.mount(s.h.load('components/app-update-status.tsx').AppUpdateStatus, {}).tree, null);
    const page = s.h.mount(s.h.load('app/app-updates.tsx').default, {});
    assert.match(textOf(page.tree), /웹·개발 화면에서는 앱 업데이트를 확인하거나 다운로드하지 않습니다/);
    assert.equal(nodes(page.tree).filter(row => ['PrimaryButton', 'TextAction'].includes(row.type)).length, 0);
  } finally { s.dispose(); }
});

test('app updates prepared manual download synchronously blocks an older captured check before React commits ready', async () => {
  const s = setup();
  try {
    await s.refresh(); available(s.h); await s.refresh();
    const captured = s.value();
    s.h.state.onDownload = async () => ({ isNew: true, manifest: updateB.manifest });
    await captured.download(); // Native useUpdates event and React rerender have not happened yet.
    await Promise.all([captured.check(), captured.download()]);
    assert.equal(s.h.state.downloadCalls.length, 1); assert.equal(s.h.state.checkCalls.length, 0);
    await s.refresh(); assert.equal(s.value().phase, 'ready');
  } finally { s.dispose(); }
});


test('app updates ignore stale native update objects after their availability and pending flags clear', async () => {
  const s = setup();
  try {
    s.h.state.native = { ...s.h.state.native, availableUpdate: updateB, downloadedUpdate: updateB, isUpdateAvailable: false, isUpdatePending: false };
    await s.refresh();
    assert.equal(s.value().available, null); assert.equal(s.value().downloaded, null);
    assert.equal(s.value().phase, 'idle'); assert.equal(s.value().lastDownloadedAt, null);
    await s.value().download(); assert.equal(s.h.state.downloadCalls.length, 0);
    const page = s.h.mount(s.h.load('app/app-updates.tsx').default, {});
    assert.equal(nodes(page.tree).find(row => row.type === 'PrimaryButton')!.props.title, '업데이트 확인');
    assert.doesNotMatch(textOf(page.tree), /다음 실행에서 적용/);
  } finally { s.dispose(); }
});

test('app updates first observed nonembedded update shows a dismissible application confirmation only once per running ID', async () => {
  const disk = new Map<string, string>(), first = setup({ disk });
  try {
    assert.equal(first.value().appliedNotice, false, 'no notice is inferred before the OS metadata read finishes');
    await first.refresh(); assert.equal(first.value().phase, 'idle'); assert.equal(first.value().appliedNotice, true);
    const footer = first.h.mount(first.h.load('components/app-update-status.tsx').AppUpdateStatus, {});
    assert.match(textOf(footer.tree), /현재 업데이트 적용 확인/);
    assert.doesNotMatch(textOf(footer.tree), /설치 완료|방금 설치/);
    nodes(footer.tree).find(row => row.type === 'TextAction' && row.props.label === '닫기')!.props.onPress();
    await first.refresh(); footer.update();
    assert.equal(first.value().appliedNotice, false); assert.equal(footer.tree, null);
  } finally { first.dispose(); }
  const second = setup({ disk });
  try {
    second.h.state.clock += 60_000; await second.refresh();
    assert.equal(second.value().appliedNotice, false);
    assert.equal(second.h.mount(second.h.load('components/app-update-status.tsx').AppUpdateStatus, {}).tree, null);
  } finally { second.dispose(); }
});

test('app updates embedded launch does not fabricate an applied OTA notice and a later running ID does', async () => {
  const disk = new Map<string, string>(), h = createAppUpdatesHarness({ disk });
  h.state.native = { ...h.state.native, currentlyRunning: { ...h.state.native.currentlyRunning, updateId: null, isEmbeddedLaunch: true } };
  const provider = h.mount(h.load('providers/AppUpdatesProvider.tsx').AppUpdatesProvider, { children: null });
  try {
    await h.flush(provider); assert.equal(nodes(provider.tree).find(row => row.type?.context)!.props.value.appliedNotice, false);
    assert.equal(h.mount(h.load('components/app-update-status.tsx').AppUpdateStatus, {}).tree, null);
  } finally { h.dispose(); assert.equal(h.state.reloadCalls.length, 0); }
  const next = setup({ disk });
  try { await next.refresh(); assert.equal(next.value().appliedNotice, true); }
  finally { next.dispose(); }
});

test('app updates loading footer preserves progress without a route action before navigation is ready', async () => {
  const s = setup();
  try {
    s.h.state.native = { ...s.h.state.native, isDownloading: true, downloadProgress: 0.4 };
    await s.refresh();
    const footer = s.h.mount(s.h.load('components/app-update-status.tsx').AppUpdateStatus, { canNavigate: false });
    assert.match(textOf(footer.tree), /다운로드 40%/);
    assert.ok(nodes(footer.tree).some(row => row.type === 'ActivityIndicator'));
    assert.equal(nodes(footer.tree).filter(row => row.type === 'TextAction').length, 0);
    assert.deepEqual(s.h.state.routes, []);
    ready(s.h); await s.refresh(); footer.update();
    assert.match(textOf(footer.tree), /다운로드 완료.*적용 대기/);
    assert.equal(nodes(footer.tree).filter(row => row.type === 'TextAction').length, 0);
  } finally { s.dispose(); }
});

function stubAppShell(h: ReturnType<typeof createAppUpdatesHarness>) {
  const session = { user: { id: 'synthetic-actor', name: '합성 직원', positionName: '직원' }, loading: false, signOut: async () => {} };
  const notifications = {
    notificationOpenError: null, retryNotificationOpen: async () => {}, dismissNotificationOpenError: () => {},
    pushStatus: { enabled: true }, pushLoading: false, pushPending: false, pushError: null, pushMessage: null, pushNeedsSettings: false,
    enablePush: async () => {}, disablePush: async () => {}, retryPushRegistration: async () => {}, refreshPushStatus: async () => {}, openPushSettings: async () => {},
  };
  Object.assign(h.mocks, {
    '@/lib/session': { SessionProvider: 'SessionProvider', useSession: () => session },
    '@/lib/notifications': { NotificationsProvider: 'NotificationsProvider', useNotifications: () => notifications },
    '@/lib/chat-provider': { ChatProvider: 'ChatProvider', useChat: () => ({ unreadCount: null, error: null, isCurrentAccount: () => true }) },
    '@/components/youth-provider': { YouthProvider: 'YouthProvider', useYouth: () => ({ isCurrentAccount: () => true }) },
    '@/providers/ResourceProvider': { ResourceProvider: 'ResourceProvider', useResources: () => ({ isCurrentAccount: () => true }) },
    '@/providers/LunchCafeProvider': { LunchCafeProvider: 'LunchCafeProvider', useLunchCafe: () => ({ isCurrentAccount: () => true }) },
    '@/providers/DraftRecoveryProvider': { DraftRecoveryProvider: 'DraftRecoveryProvider' },
    '@/components/daily-report-back-button': { DailyReportBackButton: 'DailyReportBackButton' },
    'expo-status-bar': { StatusBar: 'StatusBar' },
  });
  Object.assign(h.mocks['expo-router'], { Stack: Object.assign(function Stack() {}, { Screen: 'Stack.Screen', Protected: 'Stack.Protected' }) });
  return { session, notifications };
}

test('app updates actual profile entry opens the common status route without triggering update APIs', async () => {
  const s = setup();
  try {
    stubAppShell(s.h); await s.refresh();
    const profile = s.h.mount(s.h.load('app/(tabs)/profile.tsx').default, {});
    const entry = nodes(profile.tree).find(row => row.type === 'TextAction' && row.props.label === '앱 업데이트')!;
    assert.ok(entry); entry.props.onPress();
    assert.deepEqual(s.h.state.routes, ['/app-updates']);
    assert.equal(s.h.state.checkCalls.length, 0); assert.equal(s.h.state.downloadCalls.length, 0);
    assert.ok(nodes(profile.tree).some(row => row.type === 'TextAction' && row.props.label === '계정·도장 설정'));
    assert.ok(nodes(profile.tree).some(row => row.type === 'TextAction' && row.props.label === '이 기기 알림 끄기'));
  } finally { s.dispose(); }
});

test('app updates actual root registers a common route and keeps loading navigation disabled without remounting children', async () => {
  const s = setup();
  try {
    const { session } = stubAppShell(s.h); await s.refresh();
    const layout = s.h.load('app/_layout.tsx', 'Navigation');
    const root = s.h.mount(layout.default, {});
    assert.equal(root.tree.type, s.providerModule.AppUpdatesProvider);
    assert.equal(nodes(root.tree).filter(row => row.type === s.providerModule.AppUpdatesProvider).length, 1);
    assert.ok(nodes(root.tree).some(row => row.type === 'SessionProvider'));
    assert.ok(nodes(root.tree).some(row => row.type === 'DraftRecoveryProvider'));
    const navigation = s.h.mount(layout.QAExposed, {});
    const stack = nodes(navigation.tree).find(row => row.type === s.h.mocks['expo-router'].Stack)!;
    assert.ok(nodes(stack.props.children).some(row => row.type === 'Stack.Screen' && row.props.name === 'app-updates'));
    assert.equal(nodes(stack.props.children).filter(row => row.type === 'Stack.Protected').flatMap(nodes).filter(row => row.type === 'Stack.Screen' && row.props.name === 'app-updates').length, 0);
    session.user = null; navigation.update();
    assert.ok(nodes(navigation.tree).some(row => row.type === 'Stack.Screen' && row.props.name === 'app-updates'));
    session.loading = true; navigation.update();
    const loadingStatus = nodes(navigation.tree).find(row => row.type === s.h.load('components/app-update-status.tsx').AppUpdateStatus)!;
    assert.equal(loadingStatus.props.canNavigate, false);
    assert.equal(nodes(navigation.tree).filter(row => row.type === 'Stack.Screen').length, 0);
    assert.deepEqual(s.h.state.routes, []);
  } finally { s.dispose(); }
});
