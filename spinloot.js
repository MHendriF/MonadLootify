const fs = require('fs');
const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const config = {
  spinInterval: 5000,
  maxSpins: 100,
  tokenPath: './token.txt',
  quantity: 5,
  price: 5,
  logResults: true
};

function getWalletFromUser() {
  return new Promise((resolve) => {
    rl.question('Enter your wallet address: ', (wallet) => {
      if (wallet && wallet.length >= 40 && wallet.startsWith('0x')) {
        resolve(wallet);
      } else {
        console.log('Invalid wallet! Must start with "0x" and have appropriate length.');
        resolve(getWalletFromUser());
      }
    });
  });
}

async function getToken() {
  try {
    return fs.readFileSync(config.tokenPath, 'utf8').trim();
  } catch (error) {
    console.error('Error reading token file:', error.message);
    process.exit(1);
  }
}

function logToFile(data, filename = 'spin_results.json') {
  try {
    fs.appendFileSync(filename, JSON.stringify(data, null, 2) + ',\n');
  } catch (error) {
    console.error('Error logging to file:', error.message);
  }
}

function processSpinResults(results) {
  if (!Array.isArray(results)) {
    console.log('Unexpected response format, not an array');
    return {
      success: false,
      items: []
    };
  }

  const processedItems = results.map(item => {
    return {
      index: item.index,
      name: item.prize?.name || item.lootName || 'Unknown Item',
      price: item.prize?.price || 0,
      quickSellPrice: item.quickSellPrice || 0,
      rarity: item.highlight ? (item.highlightRare ? 'Legendary' : 'Rare') : 'Common',
      sold: item.sold ? 'Auto-sold' : 'Kept',
      timestamp: new Date(item.timestamp).toLocaleString()
    };
  });

  return {
    success: true,
    items: processedItems
  };
}

async function spinBox(token, wallet) {
  try {
    const response = await axios({
      url: "https://1vpveb4uje.execute-api.us-east-2.amazonaws.com/loot/open/solana/monad-box1",
      method: "POST",
      headers: {
        "accept": "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.5",
        "authorization": `Bearer ${token}`,
        "content-type": "application/json",
        "priority": "u=1, i",
        "sec-ch-ua": "\"Chromium\";v=\"134\", \"Not:A-Brand\";v=\"24\", \"Brave\";v=\"134\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
        "sec-gpc": "1",
        "Referer": "https://beta.lootify.xyz/",
        "Referrer-Policy": "strict-origin-when-cross-origin"
      },
      data: {
        "network": "solana",
        "slug": "monad-box1",
        "access_token": token,
        "wallet": wallet,
        "qnt": config.quantity,
        "price": config.price
      }
    });

    if (Array.isArray(response.data)) {
      if (config.logResults) {
        logToFile(response.data, 'raw_spin_results.json');
      }
      return processSpinResults(response.data);
    } else {
      return { 
        success: false, 
        message: response.data.message || 'Unknown error format' 
      };
    }
  } catch (error) {
    console.error('Error spinning box:', error.message);
    return { 
      success: false, 
      message: error.response?.data?.message || `Request failed: ${error.message}` 
    };
  }
}

async function checkAccount(token, wallet) {
  try {
    const response = await axios({
      url: `https://1vpveb4uje.execute-api.us-east-2.amazonaws.com/account/${wallet}?full=false&code=4ri65117e8w`,
      method: "GET",
      headers: {
        "accept": "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.5",
        "priority": "u=1, i",
        "sec-ch-ua": "\"Chromium\";v=\"134\", \"Not:A-Brand\";v=\"24\", \"Brave\";v=\"134\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
        "sec-gpc": "1",
        "Referer": "https://beta.lootify.xyz/",
        "Referrer-Policy": "strict-origin-when-cross-origin"
      }
    });

    if (config.logResults) {
      logToFile(response.data, 'account_updates.json');
    }
    
    return response.data;
  } catch (error) {
    console.error('Error checking account:', error.message);
    return null;
  }
}

function formatJewels(jewelsStr) {
  if (!jewelsStr) return '0';
  const jewelsNum = parseFloat(jewelsStr) / 1000000000000000;
  return jewelsNum.toFixed(5);
}

function displayBanner() {
  console.log('==================================================');
  console.log('      Auto Spin Box Lootify - Airdrop Insider     ');
  console.log('==================================================');
}

async function runBot() {
  displayBanner();
  console.log('Starting Auto Spin Bot...');
  
  const wallet = await getWalletFromUser();
  console.log(`Wallet in use: ${wallet}`);
  
  const token = await getToken();
  if (!token) {
    console.error('Invalid token. Please check token.txt file.');
    rl.close();
    return;
  }
  
  console.log('Token loaded successfully.');
  console.log(`Configuration: ${config.quantity} boxes per request, ${config.maxSpins} max total spin attempts`);
  
  let spinCount = 0;
  let successfulSpins = 0;
  let totalItemsReceived = 0;
  let rarityCount = { Common: 0, Rare: 0, Legendary: 0 };
  let totalSpent = 0;
  let totalEarned = 0;
  
  const initialAccount = await checkAccount(token, wallet);
  if (initialAccount) {
    console.log('Account information:');
    console.log(`- Wallet: ${wallet}`);
    console.log(`- Jewels balance: ${formatJewels(initialAccount.jewels)}`);
    console.log(`- Total spent: ${initialAccount.totalSpent || 0}`);
    console.log(`- Multiplier: ${initialAccount.multiplier || 1}`);
    console.log(`- Auto sell: ${initialAccount.autoSell ? 'Enabled' : 'Disabled'}`);
  } else {
    console.log('Could not retrieve initial account info. Continuing anyway...');
  }
  
  if (config.logResults) {
    fs.writeFileSync('raw_spin_results.json', '[\n');
    fs.writeFileSync('account_updates.json', '[\n');
    fs.writeFileSync('spin_summary.txt', 'Spin Bot Summary Log\n' +
      `Started at: ${new Date().toLocaleString()}\n` +
      `Wallet: ${wallet}\n\n`);
  }
  
  while (spinCount < config.maxSpins) {
    spinCount++;
    console.log(`\n[Spin #${spinCount}] Attempting to spin box...`);
    
    const spinResult = await spinBox(token, wallet);
    
    if (spinResult) {
      if (spinResult.success) {
        successfulSpins++;
        console.log(`✅ Spin successful! Received ${spinResult.items.length} items.`);
        
        if (spinResult.items && spinResult.items.length > 0) {
          console.log(`Items received:`);
          
          spinResult.items.forEach((item, index) => {
            totalItemsReceived++;
            
            if (item.rarity) {
              rarityCount[item.rarity] = (rarityCount[item.rarity] || 0) + 1;
            }
            
            totalSpent += config.price;
            totalEarned += item.quickSellPrice || 0;
            
            console.log(`  ${index + 1}. ${item.name} (${item.rarity}) - Value: ${item.price} - ${item.sold}`);
          });
          
          if (config.logResults) {
            const spinSummary = `Spin #${spinCount} - ${new Date().toLocaleString()}\n` +
              `Items: ${spinResult.items.length}\n` +
              `Rarities: ${JSON.stringify(spinResult.items.map(i => i.rarity))}\n` +
              `Values: ${JSON.stringify(spinResult.items.map(i => i.price))}\n\n`;
            
            fs.appendFileSync('spin_summary.txt', spinSummary);
          }
        }
      } else {
        console.log(`❌ Spin failed: ${spinResult.message || 'Unknown error'}`);
        
        if (spinResult.message && spinResult.message.includes('Request failed')) {
          console.log('Network issue detected. Waiting longer before next attempt...');
          await new Promise(resolve => setTimeout(resolve, config.spinInterval * 2));
        }
        
        if (spinResult.message && spinResult.message.toLowerCase().includes('balance')) {
          console.log('Insufficient balance detected. Stopping bot.');
          break;
        }
      }
    }
    
    if (spinCount % 5 === 0 || spinCount === 1) {
      const accountInfo = await checkAccount(token, wallet);
      if (accountInfo) {
        console.log(`\nAccount update:`);
        console.log(`- Current jewels: ${formatJewels(accountInfo.jewels)}`);
        console.log(`- Total spent: ${accountInfo.totalSpent || 0}`);
        console.log(`- Season level: ${accountInfo.seasonInfo?.level || 1}`);
        console.log(`- Season XP: ${accountInfo.seasonInfo?.xp || 0}`);
      }
    }
    
    console.log(`Waiting ${config.spinInterval/1000} seconds before next spin...`);
    await new Promise(resolve => setTimeout(resolve, config.spinInterval));
  }
  
  if (config.logResults) {
    fs.appendFileSync('raw_spin_results.json', '{}]\n');
    fs.appendFileSync('account_updates.json', '{}]\n');
  }
  
  displayBanner();
  console.log('Spin Bot Report');
  console.log(`Total spin attempts: ${spinCount}`);
  console.log(`Successful spins: ${successfulSpins}`);
  console.log(`Failed spins: ${spinCount - successfulSpins}`);
  console.log(`Total items received: ${totalItemsReceived}`);
  console.log(`Rarity breakdown: ${JSON.stringify(rarityCount)}`);
  console.log(`Total spent: ${totalSpent}`);
  console.log(`Total earned (from auto-sell): ${totalEarned}`);
  console.log(`Profit/Loss: ${totalEarned - totalSpent}`);
  
  const finalAccount = await checkAccount(token, wallet);
  if (finalAccount) {
    console.log(`Final jewels balance: ${formatJewels(finalAccount.jewels)}`);
    console.log(`Season progress: Level ${finalAccount.seasonInfo?.level || 1} (${finalAccount.seasonInfo?.xp || 0} XP)`);
  }
  
  if (config.logResults) {
    const finalSummary = `\n===== Final Report =====\n` +
      `Completed at: ${new Date().toLocaleString()}\n` +
      `Total spin attempts: ${spinCount}\n` +
      `Successful spins: ${successfulSpins}\n` +
      `Total items received: ${totalItemsReceived}\n` +
      `Rarity breakdown: ${JSON.stringify(rarityCount)}\n` +
      `Total spent: ${totalSpent}\n` +
      `Total earned: ${totalEarned}\n` +
      `Profit/Loss: ${totalEarned - totalSpent}\n`;
    
    fs.appendFileSync('spin_summary.txt', finalSummary);
  }
  
  console.log('Bot completed its run.');
  rl.close();
}

runBot().catch(error => {
  console.error('Fatal error in bot execution:', error);
  fs.appendFileSync('error_log.txt', `${new Date().toLocaleString()} - Error: ${error.message}\n${error.stack}\n\n`);
});