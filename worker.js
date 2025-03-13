const { parentPort, workerData } = require('worker_threads');
const axios = require('axios');
const fs = require('fs');

// Ambil data dari main thread
const { wallet, token, proxy, config } = workerData;

// Format proxy untuk Axios
function formatProxy(proxyString) {
  const [userPass, hostPort] = proxyString.split('@');
  const [username, password] = userPass.split(':');
  const [host, port] = hostPort.split(':');
  return {
    protocol: 'http',
    host,
    port: parseInt(port),
    auth: { username, password },
  };
}

// Buat Axios instance dengan proxy
function createAxiosInstance(proxy) {
  const axiosInstance = axios.create({
    proxy: false, // Nonaktifkan proxy default Axios
    httpsAgent: new (require('https-proxy-agent'))(proxy),
  });
  return axiosInstance;
}

// Fungsi untuk mencatat ke file
function logToFile(data, filename = 'spin_results.json') {
  try {
    fs.appendFileSync(filename, JSON.stringify(data, null, 2) + ',\n');
  } catch (error) {
    parentPort.postMessage(`Error logging to file: ${error.message}`);
  }
}

// Fungsi untuk memproses hasil spin
function processSpinResults(results) {
  if (!Array.isArray(results)) {
    parentPort.postMessage('Unexpected response format, not an array');
    return { success: false, items: [] };
  }

  const processedItems = results.map((item) => ({
    index: item.index,
    name: item.prize?.name || item.lootName || 'Unknown Item',
    price: item.prize?.price || 0,
    quickSellPrice: item.quickSellPrice || 0,
    rarity: item.highlight
      ? item.highlightRare
        ? 'Legendary'
        : 'Rare'
      : 'Common',
    sold: item.sold ? 'Auto-sold' : 'Kept',
    timestamp: new Date(item.timestamp).toLocaleString(),
  }));

  return { success: true, items: processedItems };
}

// Fungsi utama untuk menjalankan spin
async function spinBox(token, wallet, axiosInstance) {
  try {
    const response = await axiosInstance({
      url: 'https://1vpveb4uje.execute-api.us-east-2.amazonaws.com/loot/open/solana/monad-box1',
      method: 'POST',
      headers: {
        accept: 'application/json, text/plain, */*',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      data: {
        network: 'solana',
        slug: 'monad-box1',
        access_token: token,
        wallet: wallet,
        qnt: config.quantity,
        price: config.price,
      },
    });

    if (Array.isArray(response.data)) {
      if (config.logResults) {
        logToFile(response.data, 'raw_spin_results.json');
      }
      return processSpinResults(response.data);
    } else {
      return {
        success: false,
        message: response.data.message || 'Unknown error format',
      };
    }
  } catch (error) {
    parentPort.postMessage(`Error spinning box: ${error.message}`);
    return {
      success: false,
      message:
        error.response?.data?.message || `Request failed: ${error.message}`,
    };
  }
}

// Fungsi utama worker
(async () => {
  const proxy = formatProxy(workerData.proxy);
  const axiosInstance = createAxiosInstance(proxy);

  let spinCount = 0;
  let successfulSpins = 0;
  let totalItemsReceived = 0;
  let rarityCount = { Common: 0, Rare: 0, Legendary: 0 };
  let totalSpent = 0;
  let totalEarned = 0;

  while (spinCount < config.maxSpins) {
    spinCount++;
    parentPort.postMessage(`[Spin #${spinCount}] Attempting to spin box...`);

    const spinResult = await spinBox(token, wallet, axiosInstance);
    if (spinResult) {
      if (spinResult.success) {
        successfulSpins++;
        parentPort.postMessage(
          `✅ Spin successful! Received ${spinResult.items.length} items.`
        );
        spinResult.items.forEach((item) => {
          totalItemsReceived++;
          rarityCount[item.rarity] = (rarityCount[item.rarity] || 0) + 1;
          totalSpent += config.price;
          totalEarned += item.quickSellPrice || 0;
        });
      } else {
        parentPort.postMessage(
          `❌ Spin failed: ${spinResult.message || 'Unknown error'}`
        );
        if (
          spinResult.message &&
          spinResult.message.includes('Request failed')
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, config.spinInterval * 2)
          );
        }
        if (
          spinResult.message &&
          spinResult.message.toLowerCase().includes('balance')
        ) {
          parentPort.postMessage(
            'Insufficient balance detected. Stopping bot.'
          );
          break;
        }
      }
    }

    parentPort.postMessage(
      `Waiting ${config.spinInterval / 1000} seconds before next spin...`
    );
    await new Promise((resolve) => setTimeout(resolve, config.spinInterval));
  }

  parentPort.postMessage(`
===== Wallet Report for ${wallet} =====
Total spin attempts: ${spinCount}
Successful spins: ${successfulSpins}
Failed spins: ${spinCount - successfulSpins}
Total items received: ${totalItemsReceived}
Rarity breakdown: ${JSON.stringify(rarityCount)}
Total spent: ${totalSpent}
Total earned (from auto-sell): ${totalEarned}
Profit/Loss: ${totalEarned - totalSpent}`);
})();
