# Memory Palace — Mobile

React Native (Expo SDK 58) port of the web app in [`../frontend`](../frontend). The flow is the same: Sign In / Create Account → choose a saved study set or upload a PDF → explore the Storywood forest and castle. The app runs in landscape only.

## Run it

```sh
npm install
cp .env.example .env.local   # then set EXPO_PUBLIC_API_BASE_URL
npx expo start
```

- **Expo Go** (quickest): scan the QR code with Expo Go on a phone. Everything works except sound, because Expo Go does not include the native audio module, so the game is silent there.
- **Development build** (with sound): `npx expo run:android` or `npx expo run:ios`. You need Android Studio's SDK or Xcode, or build in the cloud with `npx eas-cli@latest build --profile development`.

### Backend URL

Set `EXPO_PUBLIC_API_BASE_URL` in `.env.local`, then restart `expo start` with `--clear` so the new value is bundled.

| Where the app runs | URL to use |
|---|---|
| Phone | the ngrok URL, or your computer's LAN IP (e.g. `http://192.168.1.20:8000`) |
| Android emulator | `http://10.0.2.2:<port>` (the emulator's alias for your computer) |
| iOS simulator | `http://127.0.0.1:<port>` |

`.env` (committed) sets `EXPO_PUBLIC_USE_RN_FETCH=1`. This makes the app use React Native's built-in `fetch`, which can upload a picked PDF by its file URI. Expo's default `fetch` cannot read the document picker's file and fails the upload. Don't remove it.

## Controls

| | |
|---|---|
| Left thumb | Floating analog joystick: walk anywhere on the left side; push to the rim to sprint |
| Right thumb | Drag anywhere on the right side to look around |
| ✦ button | Appears near a story item, guardian, princess or the bridge (Study / Face / Speak / Return / Bridge) |
| Jump button | Jump |
| Pause (top bar) or Android back | Pause menu; back also closes dialogs |

Guardians start their challenge automatically when you walk up to them, as on the web.

## How it is built

- **Same 3D world.** `src/forestScene.js`, `forestLayout.js`, `dragonModel.js`, `storybookProps.js`, `forestGoblin.js`, `magicEffects.js`, `scenePrimitives.js`, `palaceArchitecture.js`, `swordProp.js`, `sceneResources.js` and `walkFeel.js` are unchanged copies of the web files. They run on `expo-gl` through `src/glRenderer.js`.
- **Same game and backend logic.** `src/game/*` and `src/api/*` are copies of the web files, with mobile changes only where needed:
  - `api/config.js` reads `EXPO_PUBLIC_*` variables.
  - `api/profilePdf.js` validates picked files by URI.
  - `api/client.js` uploads by URI.
  - `playerMotion.js` scales speed by how far the stick is pushed.
- **Touch input.** `src/touchControls.js` replaces the web keyboard/mouse controller.
- **UI.** Everything in `src/ui/` is React Native components styled with the web app's storybook palette:
  - `GameView` replaces `RoomExperience`.
  - `ForestJourney`, `PalaceDialog`, `CharacterSpeech`, `BackendGame` and `PdfLanding` replace their web counterparts.
- **Sound.** `audio/storyAudio.js` is the web synth, running on `react-native-audio-api` (development builds only).
- **Styling.** NativeWind (Tailwind) is set up for utility classes; sizes scale with the screen's short edge (`useScreen` in `ui/theme.js`). Use the `Tap` component instead of `Pressable`: NativeWind's transform drops `Pressable`'s function-style `style` prop.
- **Performance.** On screens denser than 2× the 3D view renders at 2× and is upscaled, and shadow maps are capped at 1024 px.

## Known limits

- Requires OpenGL ES 3 (nearly every phone from the last decade). Otherwise a message is shown instead of the 3D world.
- Sound is silent in Expo Go.
- Tested on an Android 15 emulator (software GPU, so low frame rate) against the backend in fake-question mode. Not yet tested on iOS, on physical devices, or with two thumbs at once.
