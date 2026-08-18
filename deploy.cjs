const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();

const serverConfig = {
  host: '185.199.158.106',
  port: 22,
  username: 'root',
  password: 'KAtZkSNJ'
};

const COMMANDS = [
  'curl -fsSL https://deb.nodesource.com/setup_20.x | bash -',
  'apt-get install -y nodejs',
  'npm install -g pm2',
  'mkdir -p /var/www/amymusic/backend'
];

conn.on('ready', () => {
  console.log('Client :: ready');
  
  let cmdIndex = 0;
  
  const runNextCmd = () => {
    if (cmdIndex >= COMMANDS.length) {
      console.log('All setup commands executed. Starting SFTP upload...');
      uploadFiles();
      return;
    }
    
    const cmd = COMMANDS[cmdIndex];
    console.log(`Executing: ${cmd}`);
    
    conn.exec(cmd, (err, stream) => {
      if (err) throw err;
      stream.on('close', (code, signal) => {
        console.log(`Command closed with code ${code}`);
        cmdIndex++;
        runNextCmd();
      }).on('data', (data) => {
        console.log('STDOUT: ' + data);
      }).stderr.on('data', (data) => {
        console.log('STDERR: ' + data);
      });
    });
  };

  runNextCmd();
  
  const uploadFiles = () => {
    conn.sftp((err, sftp) => {
      if (err) throw err;
      
      const backendDir = path.join(__dirname, 'backend');
      const filesToUpload = ['server.js', 'db.js', 'package.json'];
      
      let uploadIndex = 0;
      const uploadNext = () => {
        if (uploadIndex >= filesToUpload.length) {
          console.log('All files uploaded. Running npm install on server...');
          runNpmInstall();
          return;
        }
        
        const file = filesToUpload[uploadIndex];
        const localFile = path.join(backendDir, file);
        const remoteFile = `/var/www/amymusic/backend/${file}`;
        
        console.log(`Uploading ${file}...`);
        sftp.fastPut(localFile, remoteFile, (err) => {
          if (err) throw err;
          console.log(`Successfully uploaded ${file}`);
          uploadIndex++;
          uploadNext();
        });
      };
      
      uploadNext();
    });
  };

  const runNpmInstall = () => {
    const cmd = 'cd /var/www/amymusic/backend && npm install && pm2 start server.js --name "amymusic-backend" && pm2 save';
    console.log(`Executing: ${cmd}`);
    conn.exec(cmd, (err, stream) => {
      if (err) throw err;
      stream.on('close', (code, signal) => {
        console.log(`Final setup closed with code ${code}`);
        conn.end();
      }).on('data', (data) => {
        console.log('STDOUT: ' + data);
      }).stderr.on('data', (data) => {
        console.log('STDERR: ' + data);
      });
    });
  };

}).connect(serverConfig);
