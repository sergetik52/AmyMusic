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
  console.log('\x1b[35m=========================================\x1b[0m');
  console.log('\x1b[1m\x1b[35m  AmyMusic 1-Click Release & Deploy  \x1b[0m');
  console.log('\x1b[35m=========================================\x1b[0m');

  const token = getGitHubToken();
  if (!token) {
    throw new Error('GitHub token not found. Please log in or set GH_TOKEN environment variable.');
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

  // 1. Build production web bundle
  console.log('\n📦 Step 1/5: Building production web frontend...');
  run('npm run build');

  // 2. Build Windows Electron Setup installer
  console.log('\n💻 Step 2/5: Packaging Windows Setup installer (.exe)...');
  run('npx electron-builder --win --x64');

  const fileName = `AmyMusic-${newVersion}-Setup.exe`;
  const setupFilePath = path.join(rootDir, 'release', fileName);

  if (!fs.existsSync(setupFilePath)) {
    throw new Error(`Compiled installer not found at ${setupFilePath}`);
  }

  // Copy installer to local downloads/
  const downloadsDir = path.join(rootDir, 'downloads');
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
  fs.copyFileSync(setupFilePath, path.join(downloadsDir, fileName));

  // 3. Upload installer to GitHub Releases
  console.log('\n🐙 Step 3/5: Uploading release asset to GitHub...');
  await uploadToGitHub(token, 'sergetik52', 'AmyMusic', `v${newVersion}`, setupFilePath, fileName);

  // 4. Commit and push git tag
  console.log('\n🏷️ Step 4/5: Pushing Git commit & release tag...');
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
  run('git push origin main --tags');

  // 5. Deploy web & backend to amymusic.ru server
  console.log('\n🌐 Step 5/5: Deploying to amymusic.ru production server...');
  run('node deploy.cjs');

  console.log('\n\x1b[32m=========================================\x1b[0m');
  console.log(`\x1b[1m\x1b[32m  🎉 RELEASE v${newVersion} DEPLOYED SUCCESSFULLY!  \x1b[0m`);
  console.log('\x1b[32m=========================================\x1b[0m');
}

main().catch((err) => {
  console.error('\n\x1b[31m❌ Release failed:\x1b[0m', err.message);
  process.exit(1);
});
