const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const conn = new Client();

const serverConfig = {
  host: '185.199.158.106',
  port: 22,
  username: 'root',
  password: 'KAtZkSNJ'
};

console.log('📦 Step 1: Building production Web Frontend bundle locally (npm run build)...');
try {
  execSync('npm run build', { cwd: __dirname, stdio: 'inherit' });
  console.log('✅ Local build successful!');
} catch (buildError) {
  console.error('❌ Build failed:', buildError.message);
  process.exit(1);
}

const COMMANDS = [
  'mkdir -p /var/www/amymusic/backend /var/www/amymusic/dist /var/www/amymusic/downloads /etc/nginx/sites-available /etc/nginx/sites-enabled',
  'apt-get update && apt-get install -y nginx certbot python3-certbot-nginx',
  'npm install -g pm2'
];

conn.on('ready', () => {
  console.log('🚀 SSH Connected to server 185.199.158.106');
  
  let cmdIndex = 0;
  
  const runNextCmd = () => {
    if (cmdIndex >= COMMANDS.length) {
      console.log('✅ Base server environment ready. Uploading files...');
      uploadAll();
      return;
    }
    
    const cmd = COMMANDS[cmdIndex];
    console.log(`Executing: ${cmd}`);
    
    conn.exec(cmd, (err, stream) => {
      if (err) throw err;
      stream.on('close', () => {
        cmdIndex++;
        runNextCmd();
      }).on('data', (data) => {
        process.stdout.write(data);
      }).stderr.on('data', (data) => {
        process.stderr.write(data);
      });
    });
  };

  runNextCmd();

  async function uploadDir(sftp, localDir, remoteDir) {
    await new Promise((resolve) => sftp.mkdir(remoteDir, () => resolve()));
    const entries = fs.readdirSync(localDir);
    for (const entry of entries) {
      const localPath = path.join(localDir, entry);
      const remotePath = `${remoteDir}/${entry}`;
      const stat = fs.statSync(localPath);
      if (stat.isDirectory()) {
        await uploadDir(sftp, localPath, remotePath);
      } else {
        await new Promise((resolve, reject) => {
          sftp.fastPut(localPath, remotePath, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    }
  }

  const uploadAll = () => {
    conn.sftp(async (err, sftp) => {
      if (err) throw err;

      try {
        console.log('📤 Uploading backend files...');
        const rootPkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
        const backendPkgPath = path.join(__dirname, 'backend', 'package.json');
        if (fs.existsSync(backendPkgPath)) {
          const backendPkg = JSON.parse(fs.readFileSync(backendPkgPath, 'utf8'));
          backendPkg.version = rootPkg.version;
          fs.writeFileSync(backendPkgPath, JSON.stringify(backendPkg, null, 2), 'utf8');
        }
        const backendDir = path.join(__dirname, 'backend');
        const backendFiles = ['server.js', 'db.js', 'package.json'];
        for (const file of backendFiles) {
          const localFile = path.join(backendDir, file);
          const remoteFile = `/var/www/amymusic/backend/${file}`;
          if (fs.existsSync(localFile)) {
            await new Promise((resolve, reject) => {
              sftp.fastPut(localFile, remoteFile, (e) => e ? reject(e) : resolve());
            });
            console.log(`  ✓ Uploaded backend/${file}`);
          }
        }

        console.log('📤 Uploading compiled web frontend dist/ bundle...');
        const distDir = path.join(__dirname, 'dist');
        await uploadDir(sftp, distDir, '/var/www/amymusic/dist');
        console.log('  ✓ Uploaded dist/ successfully');

        const downloadsDir = path.join(__dirname, 'downloads');
        if (fs.existsSync(downloadsDir)) {
          console.log('📤 Uploading setup downloads folder...');
          await uploadDir(sftp, downloadsDir, '/var/www/amymusic/downloads');
          console.log('  ✓ Uploaded downloads/ successfully');
        }

        console.log('⚙️ Configuring Nginx & SSL for amymusic.ru...');
        setupNginxAndStart();
      } catch (uploadError) {
        console.error('❌ SFTP Upload error:', uploadError);
        conn.end();
      }
    });
  };

  const setupNginxAndStart = () => {
    const vpnXrayConfig = `map $ssl_preread_server_name $vpn_backend {
    amymusic.ru 127.0.0.1:8443;
    www.amymusic.ru 127.0.0.1:8443;
    185.199.158.106 127.0.0.1:8443;
    www.mozilla.org 127.0.0.1:14443;
    www.google.com 127.0.0.1:14444;
    www.cloudflare.com 127.0.0.1:14445;
    default 127.0.0.1:8443;
}

server {
    listen 443;
    proxy_pass $vpn_backend;
    ssl_preread on;
}
`;

    const nginxConfig = `server {
    listen 80;
    listen 127.0.0.1:8443 ssl;
    server_name amymusic.ru www.amymusic.ru 185.199.158.106;

    ssl_certificate /etc/letsencrypt/live/amymusic.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/amymusic.ru/privkey.pem;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
`;
    
    // Remote script to configure Nginx site & start PM2
    const remoteScript = `
cat << 'EOF' > /etc/nginx/stream-conf.d/vpn-xray.conf
${vpnXrayConfig}
EOF

cat << 'EOF' > /etc/nginx/sites-available/amymusic.conf
${nginxConfig}
EOF

ln -sf /etc/nginx/sites-available/amymusic.conf /etc/nginx/sites-enabled/amymusic.conf
rm -f /etc/nginx/sites-enabled/default
pkill -9 nginx || true
sleep 1
systemctl restart nginx || true

cd /var/www/amymusic/backend && npm install && pm2 restart amymusic-backend || pm2 start server.js --name "amymusic-backend" && pm2 save
`;

    conn.exec(remoteScript, (err, stream) => {
      if (err) throw err;
      stream.on('close', () => {
        console.log('\n🎉 ALL DONE! AmyMusic Web application is deployed and live!');
        console.log('🌐 Web Domain URL: http://amymusic.ru (or https://amymusic.ru)');
        console.log('🌐 Direct IP: http://185.199.158.106');
        conn.end();
      }).on('data', (data) => {
        process.stdout.write(data);
      }).stderr.on('data', (data) => {
        process.stderr.write(data);
      });
    });
  };

}).connect(serverConfig);
