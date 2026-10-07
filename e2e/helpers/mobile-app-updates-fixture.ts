import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// Real update provider, page and footer; only native ports are synthetic. No
// employee API is called and reload never restarts the browser during QA.
export async function startMobileAppUpdatesFixture() {
  const root = process.cwd(), mobile = path.join(root, 'mobile');
  const requireMobile = createRequire(path.join(mobile, 'package.json'));
  const ports: Record<string, string> = {
    'react-native': `import React, { useSyncExternalStore } from 'react'; import * as Web from 'react-native-web';
      export * from 'react-native-web';
      export const Platform = { ...Web.Platform, OS: 'android' };
      export const AppState = { currentState: 'active' };
      export const AccessibilityInfo = { sendAccessibilityEvent: target => target?.focus() };
      export const useColorScheme = () => useSyncExternalStore(callback => {
        const match = matchMedia('(prefers-color-scheme: dark)'); match.addEventListener('change', callback);
        return () => match.removeEventListener('change', callback);
      }, () => matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      export const useWindowDimensions = () => ({ ...Web.useWindowDimensions(), fontScale: Number(new URLSearchParams(location.search).get('fontScale') || 1) });
      export function Text({ style, ...props }) {
        const scale = Number(new URLSearchParams(location.search).get('fontScale') || 1), flat = Web.StyleSheet.flatten(style) || {};
        return React.createElement(Web.Text, { ...props, style: [flat, scale !== 1 && { fontSize: (flat.fontSize || 14) * scale, lineHeight: (flat.lineHeight || (flat.fontSize || 14) * 1.3) * scale }] });
      }`,
    'expo-router': `import { useEffect } from 'react'; export const Stack = { Screen: () => null };
      export const router = { canGoBack: () => false, back: () => window.qa.navigation.push('back'), replace: route => window.qa.navigation.push(route), push: route => window.qa.navigation.push(route) };
      export const usePathname = () => new URLSearchParams(location.search).get('screen') === 'footer' ? '/profile' : '/app-updates';
      export const useFocusEffect = callback => useEffect(callback, [callback]);`,
    'expo-updates': `import { useSyncExternalStore } from 'react';
      export const isEnabled = true;
      export const useUpdates = () => useSyncExternalStore(callback => { window.qa.listeners.add(callback); return () => window.qa.listeners.delete(callback); }, () => window.qa.native);
      export async function checkForUpdateAsync() { return { isAvailable: false }; }
      export async function fetchUpdateAsync() { return { isNew: false }; }
      export async function reloadAsync() { window.qa.reloads++; if (new URLSearchParams(location.search).has('error')) throw Error('synthetic native failure'); return new Promise(() => {}); }`,
    'expo-secure-store': `const disk = new Map(); export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 'qa';
      export const isAvailableAsync = async () => true; export const getItemAsync = async key => disk.get(key) || null; export const setItemAsync = async (key, value) => { disk.set(key, value); };`,
    'expo-constants': `export default { expoConfig: { version: '1.0.5' } };`,
    '@/lib/session': `export const useSession = () => ({ token: 'synthetic-session' });`,
    'react-native-safe-area-context': `import React from 'react'; import { View } from 'react-native-web';
      export const useSafeAreaInsets = () => ({ top: 0, bottom: 16, left: 0, right: 0 });
      export function SafeAreaView({ edges, ...props }) { return React.createElement(View, props); }`,
    '@expo/vector-icons': `import React from 'react';
      export function Feather({ name, size, color }) { const paths = {
        'check-circle': [React.createElement('path', { key: 1, d: 'M22 11.08V12a10 10 0 1 1-5.93-9.14' }), React.createElement('polyline', { key: 2, points: '22 4 12 14.01 9 11.01' })],
        'chevron-left': React.createElement('polyline', { points: '15 18 9 12 15 6' }),
        'clock': [React.createElement('circle', { key: 1, cx: 12, cy: 12, r: 10 }), React.createElement('polyline', { key: 2, points: '12 6 12 12 16 14' })],
        'alert-circle': [React.createElement('circle', { key: 1, cx: 12, cy: 12, r: 10 }), React.createElement('path', { key: 2, d: 'M12 8v4m0 4h.01' })]
      }; return React.createElement('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, style: { flexShrink: 0 } }, paths[name] || React.createElement('circle', { cx: 12, cy: 12, r: 8 })); }
      export const Ionicons = Feather;`,
  };
  const bundle = await build({
    stdin: { loader: 'tsx', resolveDir: mobile, contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { View, Text } from 'react-native';
      import { AppUpdatesProvider } from './src/providers/AppUpdatesProvider'; import Screen from './src/app/app-updates';
      import { AppUpdateStatus } from './src/components/app-update-status'; import { setAppUpdateBlocker, beginAppUpdateRequest } from './src/lib/app-update-safety';
      const params = new URLSearchParams(location.search), downloaded = { updateId: '22222222-2222-4222-8222-222222222222', createdAt: new Date('2026-10-07T00:00:00Z'), type: 'new' };
      window.qa = { reloads: 0, navigation: [], listeners: new Set(), native: {
        currentlyRunning: { updateId: '11111111-1111-4111-8111-111111111111', runtimeVersion: 'synthetic-runtime', createdAt: new Date('2026-10-06T00:00:00Z'), isEmbeddedLaunch: false },
        isUpdatePending: true, isUpdateAvailable: true, availableUpdate: downloaded, downloadedUpdate: downloaded, isChecking: false, isDownloading: false, isStartupProcedureRunning: false, isRestarting: false
      } };
      const key = Symbol(); if (params.has('dirty')) setAppUpdateBlocker(key, true);
      if (params.has('request')) window.qa.finishRequest = beginAppUpdateRequest('POST');
      window.qa.setDirty = value => setAppUpdateBlocker(key, value);
      window.qa.setNative = value => { window.qa.native = { ...window.qa.native, ...value }; for (const listener of window.qa.listeners) listener(); };
      const footer = params.get('screen') === 'footer';
      createRoot(document.getElementById('root')).render(<AppUpdatesProvider>{footer ? <View style={{ flex: 1 }}><View style={{ flex: 1, padding: 16 }}><Text>업무 화면</Text></View><AppUpdateStatus /></View> : <Screen />}</AppUpdatesProvider>);` },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', logLevel: 'silent',
    define: { __DEV__: 'false', 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'isolated-native-update-ports', setup(plugin) {
      plugin.onResolve({ filter: /^(react(?:\/.*)?|react-dom(?:\/.*)?|react-native-web)$/ }, args => ({ path: requireMobile.resolve(args.path) }));
      plugin.onResolve({ filter: /.*/ }, args => {
        if (Object.hasOwn(ports, args.path)) return { path: args.path, namespace: 'native-update-qa' };
        if (args.path.startsWith('@/')) { const base = path.join(mobile, 'src', args.path.slice(2)); const extension = ['.ts', '.tsx'].find(value => existsSync(base + value)); if (extension) return { path: base + extension }; }
      });
      plugin.onLoad({ filter: /.*/, namespace: 'native-update-qa' }, args => ({ contents: ports[args.path], loader: 'tsx', resolveDir: mobile }));
    } }],
  });
  const server = createServer((request, response) => {
    if (request.url === '/fixture.js') { response.writeHead(200, { 'Content-Type': 'text/javascript' }); response.end(bundle.outputFiles[0].contents); }
    else if (request.url?.startsWith('/api/')) { response.writeHead(405); response.end('Employee APIs disabled'); }
    else { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>앱 업데이트 검수</title><style>html,body,#root{margin:0;width:100%;height:100%;overflow:hidden}#root{display:flex}*{box-sizing:border-box}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw Error('Fixture did not start');
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }) };
}
