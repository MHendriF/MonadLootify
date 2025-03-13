const fs = require('fs');
const { Worker } = require('worker_threads');

// Konfigurasi bot
const config = {
  spinInterval: 5000,
  maxSpins: 100,
  tokenPath: './token.txt',
  walletPath: './wallet.txt',
  proxyPath: './proxy.txt',
  quantity: 5,
  price: 5,
  logResults: true,
};

// Fungsi untuk membaca baris dari file
function readFileLines(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return data
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    process.exit(1);
  }
}

// Fungsi utama untuk menjalankan bot
function runBot() {
  console.log(
    'Starting Auto Spin Bot with multiple wallets, tokens, and proxies in parallel threads...'
  );

  // Baca wallets, tokens, dan proxies
  const wallets = readFileLines(config.walletPath);
  const tokens = readFileLines(config.tokenPath);
  const proxies = readFileLines(config.proxyPath);

  // Validasi jumlah token dan wallet
  if (wallets.length !== tokens.length) {
    console.error(
      'Number of wallets and tokens do not match. Please ensure each wallet has a corresponding token.'
    );
    process.exit(1);
  }

  // Pastikan ada cukup proxy untuk wallet
  if (wallets.length > proxies.length) {
    console.error(
      'Not enough proxies for all wallets. Please add more proxies.'
    );
    process.exit(1);
  }

  console.log(
    `Loaded ${wallets.length} wallets, ${tokens.length} tokens, and ${proxies.length} proxies.`
  );

  // Jalankan thread untuk setiap wallet
  wallets.forEach((wallet, index) => {
    const token = tokens[index];
    const proxy = proxies[index % proxies.length]; // Gunakan proxy dalam mode round-robin

    console.log(`
Processing wallet: ${wallet}
Using token: ${token.substring(0, 10)}... (partial token shown)
Using proxy: ${proxy}`);

    // Buat worker thread baru untuk wallet ini
    const worker = new Worker('./worker.js', {
      workerData: {
        wallet,
        token,
        proxy,
        config,
      },
    });

    // Tangani pesan dari worker
    worker.on('message', (message) => {
      console.log(`[${wallet}] ${message}`);
    });

    // Tangani error dari worker
    worker.on('error', (error) => {
      console.error(`[${wallet}] Worker error:`, error.message);
    });

    // Tangani exit dari worker
    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`[${wallet}] Worker stopped with exit code ${code}`);
      } else {
        console.log(`[${wallet}] Worker completed successfully.`);
      }
    });
  });
}

// Jalankan bot
runBot();
