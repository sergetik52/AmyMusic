const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const rootDir = path.resolve(__dirname, '..');
const pkgPath = path.join(rootDir, 'package.json');
const backendPkgPath = path.join(rootDir, 'backend', 'package.json');

function getGitHubToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN.trim();
  try {
    const out = execSync('echo url=https://github.com/sergetik52/AmyMusic.git | git credential fill', { encoding: 'utf8' });
    const match = out.match(/password=(.+)/);
    if (match && match[1]) return match[1].trim();
  } catch (e) {}
  return null;
}

function run(cmd, opts = {}) {
  console.log(`\n\x1b[36m▶ Executing:\x1b[0m ${cmd}`);
  execSync(cmd, { cwd: rootDir, stdio: 'inherit', ...opts });
}

function requestApi(token, method, apiPath, bodyData, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'AmyMusic-Release-Automation',
      'Accept': 'application/vnd.github.v3+json',
      ...customHeaders
    };
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }

    const req = https.request({
      host: 'api.github.com',
      path: apiPath,
      method,
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (bodyData) {
      req.write(Buffer.isBuffer(bodyData) ? bodyData : JSON.stringify(bodyData));
    }
    req.end();
  });
}

async function uploadToGitHub(token, owner, repo, tag, filePath, fileName) {
  console.log(`\n\x1b[33m🚀 Uploading ${fileName} to GitHub Release ${tag}...\x1b[0m`);
  
  let release;
  const getRes = await requestApi(token, 'GET', `/repos/${owner}/${repo}/releases/tags/${tag}`);
  if (getRes.status === 200 && getRes.data.id) {
    release = getRes.data;
  } else {
    const createRes = await requestApi(token, 'POST', `/repos/${owner}/${repo}/releases`, {
      tag_name: tag,
      name: `AmyMusic ${tag}`,
      body: `Official Release ${tag} of AmyMusic with 1-click auto-updater.`,
      draft: false,
      prerelease: false
    });
    release = createRes.data;
  }

  if (!release || !release.id) {
    console.error('Release Object Error:', release);
    throw new Error('Could not create or fetch release on GitHub.');
  }

  // Delete duplicate asset if exists
  const existingAsset = release.assets?.find(a => a.name === fileName);
  if (existingAsset) {
    await requestApi(token, 'DELETE', `/repos/${owner}/${repo}/releases/assets/${existingAsset.id}`);
  }

  const stats = fs.statSync(filePath);
  const uploadPath = `/repos/${owner}/${repo}/releases/${release.id}/assets?name=${fileName}`;
  const fileStream = fs.createReadStream(filePath);

  return new Promise((resolve, reject) => {
    const req = https.request({
      host: 'uploads.github.com',
      path: uploadPath,
      method: 'POST',
      headers: {
        'User-Agent': 'AmyMusic-Release-Automation',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': stats.size
      }
    }, (res) => {
      let responseText = '';
      res.on('data', chunk => {
        responseText += chunk;
        process.stdout.write('.');
      });
      res.on('end', () => {
        console.log('\n\x1b[32m✓ GitHub Upload Complete!\x1b[0m Status:', res.statusCode);
        resolve(res.statusCode);
      });
    });
    req.on('error', reject);
    fileStream.pipe(req);
  });
}

async function main() {
  delete process.env.HTTP_PROXY;
  delete process.env.HTTPS_PROXY;
  delete process.env.http_proxy;
  delete process.env.https_proxy;

  console.log('\x1b[35m=========================================\x1b[0m');
  console.log('\x1b[1m\x1b[35m  AmyMusic 1-Click Release & Deploy  \x1b[0m');
  console.log('\x1b[35m=========================================\x1b[0m');

  const token = getGitHubToken();
  if (!token) {
    console.log('\x1b[33m⚠️ GH_TOKEN not found in environment or git credentials.\x1b[0m');
    console.log('\x1b[33m  (Skipping GitHub Releases asset upload. The setup installer will be deployed directly to amymusic.ru)\x1b[0m');
  }

  // Read current version
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const versionParts = pkg.version.split('.').map(Number);
  
  // Custom version argument or patch bump
  const argVersion = process.argv[2];
  let newVersion = pkg.version;

  if (argVersion && argVersion.includes('.')) {
    newVersion = argVersion.trim();
  } else {
    versionParts[2] += 1;
    newVersion = versionParts.join('.');
  }

  console.log(`\n📌 Current Version: \x1b[33mv${pkg.version}\x1b[0m`);
  console.log(`📌 New Version:     \x1b[32mv${newVersion}\x1b[0m`);

  // Update root package.json & backend package.json
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  if (fs.existsSync(backendPkgPath)) {
    const backendPkg = JSON.parse(fs.readFileSync(backendPkgPath, 'utf8'));
    backendPkg.version = newVersion;
    fs.writeFileSync(backendPkgPath, JSON.stringify(backendPkg, null, 2) + '\n', 'utf8');
  }

  // 1 & 2. Build production web bundle & Tauri Desktop App (.exe)
  console.log('\n📦 Step 1-2/5: Building production web frontend & Tauri Windows Setup installer (.exe)...');
  try {
    execSync('taskkill /F /IM AmyMusic.exe /T 2>nul', { stdio: 'ignore' });
  } catch {}
  
  // Update tauri.conf.json & Cargo.toml version
  const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
  if (fs.existsSync(tauriConfPath)) {
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
    tauriConf.version = newVersion;
    fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');
  }

  const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
  if (fs.existsSync(cargoTomlPath)) {
    try {
      let cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
      cargoToml = cargoToml.replace(/^version\s*=\s*"[^"]+"/m, `version = "${newVersion}"`);
      fs.writeFileSync(cargoTomlPath, cargoToml, 'utf8');
    } catch (e) {
      console.log('Note: Cargo.toml version update skipped or already updated:', e.message);
    }
  }

  run('npm run tauri:build');

  const downloadsDir = path.join(rootDir, 'downloads');
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

  const filesToUpload = [];

  const nsisDir = path.join(rootDir, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
  if (fs.existsSync(nsisDir)) {
    const setupFile = fs.readdirSync(nsisDir).find(f => f.endsWith('.exe') && !f.endsWith('-uninstaller.exe'));
    if (setupFile) {
      const setupFilePath = path.join(nsisDir, setupFile);
      const setupFileName = `AmyMusic-${newVersion}-Setup.exe`;
      fs.copyFileSync(setupFilePath, path.join(downloadsDir, setupFileName));
      console.log(`✓ Copied ${setupFileName} to downloads/`);
      filesToUpload.push({ path: setupFilePath, name: setupFileName });
    }
  }

  const standaloneExePath = path.join(rootDir, 'src-tauri', 'target', 'release', 'AmyMusic.exe');
  if (fs.existsSync(standaloneExePath)) {
    const standaloneFileName = `AmyMusic-${newVersion}-Portable.exe`;
    fs.copyFileSync(standaloneExePath, path.join(downloadsDir, standaloneFileName));
    fs.copyFileSync(standaloneExePath, path.join(rootDir, 'AmyMusic.exe'));
    console.log(`✓ Copied ${standaloneFileName} to downloads/ and root directory`);
    filesToUpload.push({ path: standaloneExePath, name: standaloneFileName });
  }

  if (filesToUpload.length === 0) {
    throw new Error('No compiled .exe files found to release!');
  }

  // 3. Upload installer / exe to GitHub Releases (if token available)
  if (token) {
    console.log('\n🐙 Step 3/5: Uploading release asset(s) to GitHub...');
    for (const item of filesToUpload) {
      try {
        await uploadToGitHub(token, 'sergetik52', 'AmyMusic', `v${newVersion}`, item.path, item.name);
      } catch (ghErr) {
        console.error(`⚠️ Failed to upload ${item.name} to GitHub Releases:`, ghErr.message);
      }
    }
  } else {
    console.log('\n🐙 Step 3/5: Skipping GitHub upload (no token provided)...');
  }

  // 4. Local auto-commit, tag and push
  console.log('\n🏷️ Step 4/5: Creating local Git commit, release tag & pushing to GitHub...');
  try {
    run('git add .');
    try {
      run(`git commit -m "Release v${newVersion}"`);
    } catch (e) {
      console.log('No new git changes to commit.');
    }
    try {
      run(`git tag -a v${newVersion} -m "Release v${newVersion}"`);
    } catch (e) {
      console.log(`Tag v${newVersion} already exists locally.`);
    }
    try {
      run('git push origin main');
      run(`git push origin v${newVersion}`);
    } catch (e) {
      console.log('⚠️ Failed to push to remote git repository:', e.message);
    }
  } catch (gitErr) {
    console.log('⚠️ Git commit skipped or git error:', gitErr.message);
  }

  // 5. Deploy web & backend to amymusic.ru server (Skipped - no server)
  console.log('\n🌐 Step 5/5: Skipping deploy to amymusic.ru (no server)...');
  // run('node deploy.cjs');

  console.log('\n\x1b[32m=========================================\x1b[0m');
  console.log(`\x1b[1m\x1b[32m  🎉 RELEASE v${newVersion} COMPLETED SUCCESSFULLY!  \x1b[0m`);
  console.log('\x1b[32m=========================================\x1b[0m');
}

main().catch((err) => {
  console.error('\n\x1b[31m❌ Release failed:\x1b[0m', err.message);
  process.exit(1);
});
