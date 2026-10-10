# InterAI 1.3.2

InterAI now opens a compact, dark, always-on-top bar. Drag the top bar to move it. Resize it from a window edge or the lower-right corner. The interviewer’s live transcription appears first; the answer streams underneath.

## Start on your Mac

1. Extract this ZIP.
2. Open the `InterAI` folder and double-click `Start-InterAI.command`.
3. Save your OpenAI API key and paste your resume/background into Setup.
4. Select **Open session**, then click **Connect**.

If Terminal is preferred, with this ZIP in Downloads:

```bash
cd ~/Downloads
unzip -q InterAI-1.3.2-source.zip -d InterAI
cd ~/Downloads/InterAI/InterAI
npm install && npm start
```

Node.js 22 or later is required. When macOS asks, allow system audio recording for InterAI, then quit and reopen the app.

## Interview bar

InterAI listens to system audio for interviewer questions. Automatic answers are on by default. **Enter anywhere in the bar** answers the current live or most recent interviewer transcript. You can type a different question in the optional input first; Shift+Enter adds a line. The microphone is optional and only adds your spoken answers as context. It never triggers answers.

Drag the header to reposition the bar. Resize from its edges or lower-right corner. Use Pause to disconnect audio and resume later; Clear removes the current conversation; Setup changes your profile and answer style.

## Create a Mac installer

Double-click `Build-InterAI-DMG.command`, or run in the app folder:

```bash
npm install
npm test
npm run dist:mac
```

The Apple Silicon installer appears in `dist/InterAI-1.3.2-arm64.dmg`. The ZIP provides source and does not include a prebuilt or notarized DMG. Creating the DMG requires a Mac. Apple Developer credentials are required for signing and notarization.

## Create a Windows installer

The Windows installer is built by GitHub Actions on a Windows runner:

1. Push this source to the InterAI GitHub repository.
2. In GitHub, open **Actions** and run **Build InterAI for Windows** to build and download a test installer.
3. To publish an installer on the repository's Releases page, create and push a tag such as `v1.3.2-win`. The workflow builds `InterAI-Setup-1.3.2-x64.exe` and attaches it to that release.

The installer targets 64-bit Windows. System audio uses Windows loopback capture; microphone context is optional.

## Audio and privacy

Audio is streamed to OpenAI for transcription. Transcripts and your supplied resume/job context are sent to OpenAI to detect questions and prepare answers. API charges apply. InterAI stores the API key using the operating system’s secure storage and saves your profile locally. Session transcript memory clears when the window closes.

This version implements a compact, movable, resizable conversation bar with live transcription and streaming responses. It does not include OCR, screenshots, voice output, or a vector database. Screen-sharing behavior varies by Mac and meeting app; no invisibility guarantee is made.

## Tests

Run `npm test` for 20 automated tests covering the audio gate, stream handling, question triggers, microphone isolation, follow-up context, and answer cancellation. The UI was also exercised in a browser with simulated audio and mocked API responses. The live OpenAI service and actual Mac permissions must be tested on your device.
