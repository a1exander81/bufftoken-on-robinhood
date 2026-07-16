(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Config — fill MINER_ADDRESS in after running contracts/scripts/deploy.js
  // ---------------------------------------------------------------------
  const BUFFCAT_TOKEN_ADDRESS = "0xD80aFe3Be875a14155FDd96D39669A6734E12036";
  // Empty = dashboard runs in preview mode. Set this to the BuffCatMiner
  // address printed by contracts/scripts/deploy.js — do NOT reuse the old
  // NeiroMiner deployment (0xE88403a8...) — it is bound to the old token.
  const MINER_ADDRESS = "";
  const ROBINHOOD_CHAIN_ID = "0x1237";
  const ROBINHOOD_CHAIN_PARAMS = {
    chainId: ROBINHOOD_CHAIN_ID,
    chainName: "Robinhood Chain",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
    blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
  };

  const BPS_DENOM = 10000;
  // Flat ETH lock fee (NOT a % of BUFFCAT). Read live from the contract's
  // buyFeeWei() getter; that ETH is split 25/40/15/20 inside the contract.
  const DEFAULT_BUY_FEE_ETH = 0.003;          // mirrors contract initializer (~$5)
  let   buyFeeEthValue = DEFAULT_BUY_FEE_ETH;  // number, for display
  let   buyFeeWei = null;                       // BigNumber, for msg.value
  let   selectedChoice = 0;                     // dividend asset: 0=ETH 1=USDG 2=FEATURED (real selector = TODO)
  const WITHDRAW_FEE_BPS = 300;
  const EARLY_EXIT_FEE_BPS = 1000;
  // 7 tiers, values copied directly from BuffCatMiner.sol (TIER_DURATION / TIER_MULT_BPS)
  const TIER_LABELS = ["1 Day", "3 Days", "1 Week", "1 Month", "1 Year", "10 Years", "100 Years"];
  const TIER_DURATION_SEC = [86400, 3*86400, 7*86400, 30*86400, 365*86400, 3650*86400, 36500*86400];
  const TIER_MULT_BPS = [10000, 12500, 16000, 22000, 35000, 50000, 60000];

  const MINER_ABI = [
    "function lock(uint256 amount, uint8 tier, uint8 choice) payable",
    "function buyFeeWei() view returns (uint256)",
    "function claim(uint256 posId)",
    "function unlock(uint256 posId)",
    "function positions(address,uint256) view returns (uint128 principal, uint128 hashpower, uint64 lockTime, uint64 unlockTime, uint8 tier, uint8 choice, bool active, uint256 ethDebt, uint256 usdgDebt, uint256 featDebt, uint256 buffDebt)",
    "function positionCount(address) view returns (uint256)",
    "function pendingRewards(address,uint256) view returns (uint256 eth, uint256 usdg, uint256 feat)",
    "function usdgToken() view returns (address)",
    "function featuredToken() view returns (address)",
    "function totalHashpower() view returns (uint256)",
    "function totalPrincipal() view returns (uint256)",
    "function paused() view returns (bool)",
  ];
  const TOKEN_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function approve(address,uint256) returns (bool)",
    "function allowance(address,address) view returns (uint256)",
  ];

  const el = (id) => document.getElementById(id);
  const connectBtns = Array.from(document.querySelectorAll("[data-connect-wallet]"));
  const buyBtn = el("buyBtn");
  const amountInput = el("buyAmount");
  const maxBtn = el("maxBtn");
  const tierPicker = el("tierPicker");
  const positionsList = el("positionsList");
  const notDeployedBanner = el("notDeployedBanner");
  const contractAddrEl = el("contractAddr");

  const provider = window.ethereum ? new ethers.providers.Web3Provider(window.ethereum, "any") : null;
  let signer = null;
  let userAddress = null;
  let tokenDecimals = 18;
  let selectedTier = 0;

  const hasContract = MINER_ADDRESS && MINER_ADDRESS.length === 42;

  function fmt(bnOrNum, decimals) {
    try {
      return parseFloat(ethers.utils.formatUnits(bnOrNum, decimals ?? tokenDecimals)).toLocaleString(undefined, {
        maximumFractionDigits: 4,
      });
    } catch (e) {
      return "0.00";
    }
  }

  function formatAddress(address) {
    if (!address) return "Not connected";
    return `${address.slice(0, 4)}…${address.slice(-4)}`;
  }

  function setConnectLabel(label) {
    connectBtns.forEach((b) => (b.textContent = label));
  }

  if (hasContract && contractAddrEl) {
    contractAddrEl.textContent = MINER_ADDRESS;
  }
  if (notDeployedBanner && hasContract) {
    notDeployedBanner.classList.add("hidden");
  }

  // ---------------------------------------------------------------------
  // Chain + wallet
  // ---------------------------------------------------------------------
  async function ensureRobinhoodChain() {
    if (!window.ethereum || !provider) return false;
    try {
      const network = await provider.getNetwork();
      if (network.chainId === 4663) return true;
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ROBINHOOD_CHAIN_ID }] });
      return true;
    } catch (err) {
      try {
        await window.ethereum.request({ method: "wallet_addEthereumChain", params: [ROBINHOOD_CHAIN_PARAMS] });
        return true;
      } catch (addErr) {
        console.error("Robinhood chain setup failed", addErr);
        return false;
      }
    }
  }

  async function connectWallet() {
    if (!window.ethereum) {
      alert("No EVM wallet found. Install MetaMask, Rabby, or another compatible wallet.");
      return;
    }
    try {
      await provider.send("eth_requestAccounts", []);
      await ensureRobinhoodChain();
      signer = provider.getSigner();
      userAddress = await signer.getAddress();
      setConnectLabel(formatAddress(userAddress));
      el("statWallet").textContent = formatAddress(userAddress);
      await refreshAll();
    } catch (err) {
      console.error("Wallet connect failed", err);
    }
  }

  connectBtns.forEach((b) => b.addEventListener("click", connectWallet));
  if (window.ethereum) {
    window.ethereum.on("accountsChanged", () => window.location.reload());
    window.ethereum.on("chainChanged", () => window.location.reload());
  }

  function minerContract(withSigner) {
    if (!hasContract) return null;
    return new ethers.Contract(MINER_ADDRESS, MINER_ABI, withSigner ? signer : provider);
  }
  function tokenContract(withSigner) {
    return new ethers.Contract(BUFFCAT_TOKEN_ADDRESS, TOKEN_ABI, withSigner ? signer : provider);
  }

  // ---------------------------------------------------------------------
  // Tier picker + live buy breakdown
  // ---------------------------------------------------------------------
  function renderTierButtons() {
    if (!tierPicker) return;
    Array.from(tierPicker.querySelectorAll(".mine-tier")).forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedTier = parseInt(btn.dataset.tier, 10);
        Array.from(tierPicker.querySelectorAll(".mine-tier")).forEach((b) => b.classList.toggle("active", b === btn));
        updateBreakdown();
      });
    });
  }

  async function loadBuyFee() {
    if (!hasContract) { buyFeeWei = null; buyFeeEthValue = DEFAULT_BUY_FEE_ETH; return updateBreakdown(); }
    try {
      buyFeeWei = await minerContract(false).buyFeeWei();
      buyFeeEthValue = parseFloat(ethers.utils.formatEther(buyFeeWei));
    } catch (_) { buyFeeWei = null; buyFeeEthValue = DEFAULT_BUY_FEE_ETH; }
    updateBreakdown();
  }

  function updateBreakdown() {
    const raw = parseFloat(amountInput.value || "0");
    const amount = isFinite(raw) && raw > 0 ? raw : 0;
    // Fee is a FLAT ETH amount (buyFeeWei), paid on top of the lock — it is NOT
    // skimmed from the BUFFCAT you lock. 100% of `amount` is principal, returned
    // at unlock. The ETH fee is split 25/40/15/20 inside the contract.
    const principal = amount;
    const hashpower = (principal * TIER_MULT_BPS[selectedTier]) / BPS_DENOM;

    el("bdFee").textContent = buyFeeEthValue.toFixed(4) + " ETH";
    el("bdPrincipal").textContent = principal.toFixed(4);
    el("bdHashpower").textContent = hashpower.toFixed(4);
    // NOTE: bdLp / bdOwner / bdEco rows in mining.html no longer map to reality —
    // there is no token-side LP/eco skim. Update or remove those rows.
  }

  if (amountInput) amountInput.addEventListener("input", updateBreakdown);
  renderTierButtons();
  updateBreakdown();

  if (maxBtn) {
    maxBtn.addEventListener("click", async () => {
      if (!userAddress) return connectWallet();
      const bal = await tokenContract(false).balanceOf(userAddress);
      amountInput.value = ethers.utils.formatUnits(bal, tokenDecimals);
      updateBreakdown();
    });
  }

  // ---------------------------------------------------------------------
  // Buy
  // ---------------------------------------------------------------------
  async function refreshBuyButton() {
    if (!userAddress) {
      buyBtn.textContent = "Connect wallet to buy";
      buyBtn.disabled = false;
      return;
    }
    if (!hasContract) {
      buyBtn.textContent = "Mining contract coming soon";
      buyBtn.disabled = true;
      return;
    }
    try {
      const paused = await minerContract(false).paused();
      if (paused) {
        buyBtn.textContent = "New miners paused";
        buyBtn.disabled = true;
        return;
      }
    } catch (e) {
      /* ignore — fall through */
    }
    buyBtn.textContent = "Buy miners";
    buyBtn.disabled = false;
  }

  if (buyBtn) {
    buyBtn.addEventListener("click", async () => {
      if (!userAddress) return connectWallet();
      if (!hasContract) return;
      const raw = amountInput.value;
      const amount = parseFloat(raw || "0");
      if (!(amount > 0)) return;

      try {
        const amountWei = ethers.utils.parseUnits(raw, tokenDecimals);
        const token = tokenContract(true);
        const allowance = await token.allowance(userAddress, MINER_ADDRESS);
        if (allowance.lt(amountWei)) {
          buyBtn.textContent = "Approving…";
          buyBtn.disabled = true;
          const tx = await token.approve(MINER_ADDRESS, ethers.constants.MaxUint256);
          await tx.wait();
        }
        buyBtn.textContent = "Confirm in wallet…";
        const miner = minerContract(true);
        const feeWei = await minerContract(false).buyFeeWei();
        // contract fn is lock(amount, tier, choice); choice 0=ETH 1=USDG 2=FEATURED
        const tx2 = await miner.lock(amountWei, selectedTier, selectedChoice, { value: feeWei });
        buyBtn.textContent = "Buying…";
        await tx2.wait();
        amountInput.value = "";
        updateBreakdown();
        await refreshAll();
      } catch (err) {
        console.error("Buy failed", err);
        alert(err?.reason || err?.message || "Transaction failed.");
      } finally {
        await refreshBuyButton();
      }
    });
  }

  // Claiming is now per-position: the contract's claim(posId) pays out
  // whichever asset (ETH / USDG / Featured) that specific position's holder
  // chose at lock time. See the per-card Claim button inside renderPositions().

  // ---------------------------------------------------------------------
  // Positions list
  // ---------------------------------------------------------------------
  function countdown(unlockTime) {
    const now = Math.floor(Date.now() / 1000);
    const diff = unlockTime - now;
    if (diff <= 0) return "Matured";
    const d = Math.floor(diff / 86400);
    const h = Math.floor((diff % 86400) / 3600);
    const m = Math.floor((diff % 3600) / 60);
    if (d > 0) return `${d}d ${h}h left`;
    if (h > 0) return `${h}h ${m}m left`;
    return `${m}m left`;
  }

  const CHOICE_LABELS = ["ETH", "USDG", "Featured"];
  let usdgDecimals = null;
  let featuredDecimals = null;

  async function fetchTokenDecimals(addr) {
    if (!addr || addr === ethers.constants.AddressZero) return 18;
    try {
      const c = new ethers.Contract(addr, ["function decimals() view returns (uint8)"], provider);
      return await c.decimals();
    } catch (_) {
      return 18; // unresolved — treated as 18, flag for manual verification
    }
  }

  function formatChoiceAmount(choiceIdx, pendEth, pendUsdg, pendFeat) {
    if (choiceIdx === 0) return `${ethers.utils.formatEther(pendEth)} ETH`;
    if (choiceIdx === 1) return `${ethers.utils.formatUnits(pendUsdg, usdgDecimals ?? 18)} USDG`;
    return `${ethers.utils.formatUnits(pendFeat, featuredDecimals ?? 18)} Featured`;
  }

  async function renderPositions() {
    if (!positionsList) return;
    if (!userAddress) {
      positionsList.innerHTML = `<div class="mine-empty">Connect your wallet to see your miner positions.</div>`;
      return;
    }
    if (!hasContract) {
      positionsList.innerHTML = `<div class="mine-empty">Mining contract isn't deployed on this build yet.</div>`;
      return;
    }
    try {
      const miner = minerContract(false);
      const len = (await miner.positionCount(userAddress)).toNumber();
      if (len === 0) {
        positionsList.innerHTML = `<div class="mine-empty">No miners yet — buy your first one above.</div>`;
        return;
      }

      const rawPositions = [];
      for (let i = 0; i < len; i++) rawPositions.push(await miner.positions(userAddress, i));

      // Resolve USDG/Featured decimals once, lazily, only if some active position needs them.
      const needsUsdg = rawPositions.some((p) => p.active && p.choice === 1);
      const needsFeatured = rawPositions.some((p) => p.active && p.choice === 2);
      if (needsUsdg && usdgDecimals === null) {
        try { usdgDecimals = await fetchTokenDecimals(await miner.usdgToken()); } catch (_) { usdgDecimals = 18; }
      }
      if (needsFeatured && featuredDecimals === null) {
        try { featuredDecimals = await fetchTokenDecimals(await miner.featuredToken()); } catch (_) { featuredDecimals = 18; }
      }

      const rows = [];
      for (let i = 0; i < len; i++) {
        const pos = rawPositions[i];
        if (!pos.active) continue;
        const unlockTime = pos.unlockTime.toNumber ? pos.unlockTime.toNumber() : Number(pos.unlockTime);
        const matured = Math.floor(Date.now() / 1000) >= unlockTime;

        let pendingLine = "Pending: —";
        try {
          const [pendEth, pendUsdg, pendFeat] = await miner.pendingRewards(userAddress, i);
          pendingLine = `Pending: ${formatChoiceAmount(pos.choice, pendEth, pendUsdg, pendFeat)}`;
        } catch (err) {
          console.error("pendingRewards read failed", err);
        }

        rows.push(`
          <div class="mine-position">
            <div class="pp-main">
              <div class="pp-amount">${fmt(pos.principal)} $BUFFCAT</div>
              <div class="pp-meta">${TIER_LABELS[pos.tier]} · hashpower ${fmt(pos.hashpower)} · ${countdown(unlockTime)}</div>
              <div class="pp-meta">${pendingLine} (${CHOICE_LABELS[pos.choice]}) · + any BUFFCAT penalty-bonus, revealed on claim</div>
            </div>
            <div class="pp-status ${matured ? "matured" : "locked"}">${matured ? "Matured" : "Locked"}</div>
            <div class="pp-actions">
              <button data-claim="${i}">Claim ${CHOICE_LABELS[pos.choice]}</button>
              <button data-unlock="${i}" data-early="${!matured}">${matured ? "Unlock" : "Unlock early (−10%)"}</button>
            </div>
          </div>
        `);
      }
      positionsList.innerHTML = rows.length
        ? rows.join("")
        : `<div class="mine-empty">No active miners — buy your first one above.</div>`;

      Array.from(positionsList.querySelectorAll("[data-claim]")).forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = parseInt(btn.dataset.claim, 10);
          try {
            btn.disabled = true;
            btn.textContent = "Confirm in wallet…";
            const tx = await minerContract(true).claim(id);
            await tx.wait();
            await refreshAll();
          } catch (err) {
            console.error("Claim failed", err);
            alert(err?.reason || err?.message || "Transaction failed.");
            await renderPositions();
          }
        });
      });

      Array.from(positionsList.querySelectorAll("[data-unlock]")).forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = parseInt(btn.dataset.unlock, 10);
          const early = btn.dataset.early === "true";
          if (early && !confirm("This position hasn't matured yet. Unlocking now costs a 10% early-exit penalty. Continue?")) {
            return;
          }
          try {
            btn.disabled = true;
            btn.textContent = "Confirm in wallet…";
            const tx = await minerContract(true).unlock(id);
            await tx.wait();
            await refreshAll();
          } catch (err) {
            console.error("Unlock failed", err);
            alert(err?.reason || err?.message || "Transaction failed.");
            await renderPositions();
          }
        });
      });
    } catch (err) {
      console.error("renderPositions failed", err);
      positionsList.innerHTML = `<div class="mine-empty">Couldn't load your positions. Check you're on Robinhood Chain.</div>`;
    }
  }

  // ---------------------------------------------------------------------
  // Stats strip
  // ---------------------------------------------------------------------
  async function refreshStats() {
    if (!hasContract) {
      el("statTVL").textContent = "—";
      el("statHashpower").textContent = "—";
      el("statLockFee").textContent = "—";
      return;
    }
    try {
      const miner = minerContract(false);
      // The contract has no pooled/continuous "reward rate" — it pays ETH,
      // USDG, and a featured token via a per-position accumulator. Showing
      // the flat lock fee here instead: a real, globally-readable number.
      const [tvl, hashpower, feeWei] = await Promise.all([
        miner.totalPrincipal(),
        miner.totalHashpower(),
        miner.buyFeeWei(),
      ]);
      el("statTVL").textContent = `${fmt(tvl)} $BUFFCAT`;
      el("statHashpower").textContent = fmt(hashpower);
      el("statLockFee").textContent = `${ethers.utils.formatEther(feeWei)} ETH`;
    } catch (err) {
      console.error("refreshStats failed", err);
    }
  }

  async function refreshAll() {
    if (userAddress && hasContract) {
      try {
        tokenDecimals = await tokenContract(false).decimals();
        const bal = await tokenContract(false).balanceOf(userAddress);
        el("statWallet").textContent = `${formatAddress(userAddress)} · ${fmt(bal)} $BUFFCAT`;
      } catch (e) {
        /* ignore */
      }
    }
    await Promise.all([refreshStats(), loadBuyFee(), renderPositions(), refreshBuyButton()]);
  }

  refreshStats();
  loadBuyFee();
  refreshBuyButton();
  renderPositions();

  // Keep countdowns fresh without re-hitting the chain every tick.
  setInterval(() => {
    if (userAddress && hasContract) renderPositions();
  }, 60000);
})();
