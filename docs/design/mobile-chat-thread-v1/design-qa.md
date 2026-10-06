# 직원 대화방 v1 design QA

final result: passed

## Visual truth and normalization

Claude task: https://claude.ai/cowork/cse_019QmmgaB7zLPe4E3LvQLRnB?artifact=82497355-1c7d-45ce-933b-9e3b90d2ed7a
Version 25, page 12 “직원 대화방 v1”, 50 artboards. Source was acquired from rendered DOM, stylesheet and authored DOM-script reads. The original component ZIP download did not complete; no ZIP download or original source-file acquisition is claimed. Metadata: `docs/design/mobile-chat-thread-v1/source.json`.

Actual implementation: Expo SDK57 app, `/chat/[peerId]`, tested through localhost synthetic API at 8915 and actual Metro at 8916. QA infrastructure and synthetic fixtures remain outside the release tree. No production employee, message, file, account, or database was used in UI tests.

Source visual truth: `output/design/claude-mobile-chat-thread-2026-10-06/source/reference-light-bottom.jpg`, `reference-file.jpg`, `reference-SmallDark.jpg`, `reference-Desktop.jpg`. Implementation: the adjacent `app-main-light-390.jpg`, `app-file-light-390.jpg`, `app-many-dark-360.jpg`, `app-many-light-1366.jpg`.

Main: source and app pixels 390×844, CSS device 390×844, density1. Both use the same six synthetic messages, names, file size, times, read states, light theme, and bottom-follow state. The original source scroll offset24 was restored after fonts loaded. App-owned viewport excludes top47 and bottom34 of the device infrastructure; no status bar or home indicator was recreated in production.

Small dark: pixels/CSS360×800, density1, source/app use the same eight source-derived synthetic messages including long staff metadata, long words, emoji, multiple file types, and a deleted attachment. Desktop: pixels/CSS1366×768, density1, same eight messages and bottom-follow state.

200% equivalent: 180×380 logical app content scaled2 inside360×800 device with24/16 infrastructure insets. This tests browser zoom/reflow, not native fontScale2. Native fontScale2 semantic/action behavior is separately tested in the production-module harness; native pixel layout and physical keyboard are unverified.

## Combined evidence

Full-view comparisons (source left, implementation right):

- `docs/design/mobile-chat-thread-v1/comparison-main-full.png`
- `docs/design/mobile-chat-thread-v1/comparison-small-dark.png`
- `docs/design/mobile-chat-thread-v1/comparison-desktop.png`
- `docs/design/mobile-chat-thread-v1/comparison-file-full.png`

Focused comparisons:

- `docs/design/mobile-chat-thread-v1/comparison-main-focused.png`: file name/size/state, timestamp/read status and fixed composer.
- `docs/design/mobile-chat-thread-v1/comparison-file-focused.png`: sheet title, description, file summary and actions.

The file comparison intentionally contrasts the Android mock with a web app: Android has its existing additional share action; web retains its existing download flow. That extra action and different native safe-area treatment are platform constraints, not missing implementation. Android/iOS action branching and receipt guards were tested through actual production logic. The 200% unknown state screenshot uses text-only sending whereas the source variant includes a selected file; it is used for action visibility and response-safety validation, not a pixel fidelity score.

## Findings and iteration history

No actionable P0/P1/P2 remains in the tested web scope.

1. [P2, fixed] Initial multiline input rendered about67px instead of44px and reduced visible conversation area. `comparison-initial-main.png` records the initial state. Fix: start at44px, grow from actual content size to135px, preserve multiline input. Post-fix: `comparison-main-full.png` and focused composer show44px input and visible controls.
2. [P2, fixed] File size/state was aligned beneath the icon instead of the filename. Fix: use a20px icon beside a filename/metadata column. Post-fix: main/file focused comparisons. Deleted originals use secondary text, explicitly say download unavailable, and offer no download affordance.
3. Desktop source measurements showed a760px inner column and560px maximum bubble. The implementation uses a full-width background/header/composer with those content caps. Post-fix composition is shown in `comparison-desktop.png`.
4. [P2, fixed] At200%, the original retry button ended at313.5 logical px inside a composer scroll area ending274px. Most of the action was clipped. Fix: at width<320 or native fontScale≥1.3, pin retry and discard outside the composer scroll and omit disabled lower-priority file/count controls. Post-fix `app-unknown-zoom200-light-360.jpg` and `zoom200-metrics.json`: retry280–324px, discard332–376px, both within380px and outside the upper scroll. Actual same-request retry clears input only after validated success.
5. [P1, fixed] Old private filename error feedback could remain rendered during background/fresh access checking. Fix: mask feedback by screen focus and foreground render epoch, clear old feedback on fresh validation. Regression test verifies removal from the rendered tree, while preserving local input for a successful return.

## Required fidelity surfaces

- Fonts/typography: source Noto Sans KR400/500/700; production keeps the existing platform system fonts used by the rest of the Expo app. This intentional platform constraint changes glyph width/antialiasing and some line breaks (one outgoing paragraph is one line instead of two). Body15/22.5, title16/21.6, metadata12/16.8, full copy, paragraph breaks and text selection are preserved; long staff metadata is capped at two lines with full accessible identity. Font-family differences are documented, not called pixel-identical.
- Spacing/layout: compact52px header,12px row gaps,16px message margins,16px bubbles with directional4px corners,82% mobile bubble cap,760/560px desktop caps,44px composer actions and48px file-panel actions. KeyboardScreen remains the native overlap owner. Composer upper area scrolls independently of persistent actions.
- Colors/tokens: shared HomeTheme light/dark tokens; sent accentSoft, received surface, neutral deleted state, warning dangerSoft. Warning outline uses secondary instead of the low-contrast controlBorder on pink; focused primary uses contrasting text border. Palette precheck and actual production-style tests cover contrasting foregrounds/borders. Light/dark captures remain readable.
- Images/assets: no raster artwork, avatars or illustrations in the source. Existing Feather icons are used; no generated image, custom drawing or fake device chrome was introduced. File-text versus the source's plain file glyph is a minor existing-library choice.
- Copy/content: full synthetic body/name/file/time/read states preserved, own-only read labels, explicit file action, disabled empty send, same-transmission retry, receipt deletion warning and inactive-worker explanation. No online status, typing indicator, message deletion, or preview-interior redesign was added.

## Interaction and state checks

Actual browser: profile→chat→thread navigation; six-message main; eight-message dark/desktop; empty conversation; fresh loading masks private content and composer; fresh failure differs from empty; dirty back shows confirmation and cancel preserves input; file modal focuses close, Tab wraps within it, Escape closes and returns focus to file action; ambiguous send retains read-only input and disables normal send, same-send retry succeeds without duplicate message;200% retry/discard remain visible. Browser console: no app-origin errors; one unrelated wallet-extension ethereum injection error was observed and excluded, without changing browser settings.

Automated:7 new production regression/presentation checks plus existing chat/file/session/core coverage. Full local suite2242 total,2211 pass,0 fail,31 PostgreSQL-dependent skips. Root/mobile lint and typecheck and root webpack production build passed. PostgreSQL-dependent checks must pass in CI before merge. Export verification329 Android/328 iOS feature gates passes and rejects all synthetic URLs/fixtures. Installed runtime fingerprints are unchanged. Export success is not a substitute for visual QA.

## Remaining verification gaps / accepted constraints

Physical iOS/Android device, native keyboard with fontScale2, OS picker/save/share surfaces, actual screenreader speech and installed-update application remain unverified. File preview interior is the next design task and retains its existing route/registry/security guards. Platform system typography and platform-specific native confirmation/saving controls are intentional. No remaining actionable layout, privacy, or workflow defect was observed in the tested web scope.
