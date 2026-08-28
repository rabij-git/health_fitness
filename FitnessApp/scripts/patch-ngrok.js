// The ngrok binary @expo/ngrok bundles (v2.3.41) is no longer accepted by
// ngrok's backend for authenticated free accounts (ERR_NGROK_121 — minimum
// agent version 3.20.0 required). This swaps in a modern v3 binary we keep
// in tools/, after every npm install, so the fix survives reinstalls.
const fs = require('fs');
const path = require('path');

const platformBinaries = {
  'darwin-arm64': 'ngrok-v3-darwin-arm64',
};

const key = `${process.platform}-${process.arch}`;
const sourceName = platformBinaries[key];

if (!sourceName) {
  // No known replacement for this platform — leave the bundled binary as-is.
  process.exit(0);
}

const source = path.join(__dirname, '..', 'tools', sourceName);
const destDir = path.join(__dirname, '..', 'node_modules', '@expo', `ngrok-bin-${key}`);
const dest = path.join(destDir, 'ngrok');

if (!fs.existsSync(source)) {
  process.exit(0);
}
if (!fs.existsSync(destDir)) {
  // @expo/ngrok-bin for this platform isn't installed — nothing to patch.
  process.exit(0);
}

fs.copyFileSync(source, dest);
fs.chmodSync(dest, 0o755);
console.log(`[patch-ngrok] Replaced ${dest} with bundled ngrok v3 binary.`);

// The v3 agent strictly validates the tunnel-creation payload and rejects
// fields that belong to process/auth setup (authtoken, configPath, port) —
// Expo's AsyncNgrok.js passes those through to @expo/ngrok's connect(), and
// @expo/ngrok forwards the whole opts object unfiltered. Strip them out
// before the startTunnel() call. This edits node_modules directly so it
// must be re-applied after every install.
const ngrokIndexPath = path.join(__dirname, '..', 'node_modules', '@expo', 'ngrok', 'index.js');
if (fs.existsSync(ngrokIndexPath)) {
  const original = fs.readFileSync(ngrokIndexPath, 'utf8');
  const unpatchedMarker = 'const response = await ngrokClient.startTunnel(opts);';
  const patchedMarker = 'const response = await ngrokClient.startTunnel(tunnelOpts);';
  if (original.includes(unpatchedMarker)) {
    const patched = original.replace(
      unpatchedMarker,
      'const { authtoken, configPath, port, ...tunnelOpts } = opts;\n    ' + patchedMarker
    );
    fs.writeFileSync(ngrokIndexPath, patched);
    console.log('[patch-ngrok] Patched @expo/ngrok/index.js to strip non-tunnel fields before startTunnel().');
  } else if (original.includes(patchedMarker)) {
    console.log('[patch-ngrok] @expo/ngrok/index.js already patched.');
  } else {
    console.warn('[patch-ngrok] Could not find expected code in @expo/ngrok/index.js — skipping JS patch (package version may have changed).');
  }
}

// Expo's CLI forces its own globally-shared ngrok authtoken and a custom
// "*.exp.direct" hostname. That shared token is used by every Expo dev
// worldwide and now regularly collides under ngrok's stricter session
// limits ("tunnel already exists"); the custom hostname also isn't usable
// on a personal free-tier ngrok account anyway. Patch AsyncNgrok.js to drop
// the forced authtoken/configPath/hostname and just request a plain tunnel,
// which falls back to the user's own already-authenticated ~/.ngrok2/ngrok.yml.
const asyncNgrokPath = path.join(
  __dirname, '..', 'node_modules', 'expo', 'node_modules', '@expo', 'cli', 'build', 'src', 'start', 'server', 'AsyncNgrok.js'
);
if (fs.existsSync(asyncNgrokPath)) {
  const original = fs.readFileSync(asyncNgrokPath, 'utf8');
  const unpatchedMarker = `const configPath = _path().join((0, _UserSettings.getSettingsDirectory)(), 'ngrok.yml');
            debug('Global config path:', configPath);
            const urlProps = await this._getConnectionPropsAsync();
            const url = await instance.connect({
                ...urlProps,
                authtoken: NGROK_CONFIG.authToken,
                configPath,
                onStatusChange (status) {`;
  const patchedMarker = `const url = await instance.connect({
                onStatusChange (status) {`;
  if (original.includes(unpatchedMarker)) {
    const patched = original.replace(unpatchedMarker, patchedMarker);
    fs.writeFileSync(asyncNgrokPath, patched);
    console.log('[patch-ngrok] Patched AsyncNgrok.js to use the personal ngrok account instead of Expo\'s shared one.');
  } else if (original.includes(patchedMarker)) {
    console.log('[patch-ngrok] AsyncNgrok.js already patched.');
  } else {
    console.warn('[patch-ngrok] Could not find expected code in AsyncNgrok.js — skipping (Expo version may have changed).');
  }
}
