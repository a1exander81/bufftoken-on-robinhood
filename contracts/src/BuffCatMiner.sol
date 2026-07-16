// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title BuffCatMiner — lock BUFFCAT, earn ETH/USDG/featured dividends
/// @notice Principal (BUFFCAT) is always returned in full. Dividends come from
///         ETH platform fees, distributed via an O(1) accumulator (never loops
///         over users). Featured-pair rewards are snapshot-gated and opt-in.
/// @dev Solvency invariant: BUFFCAT balance >= totalPrincipal always holds,
///      because principal is never spent. ETH dividends never exceed fees in.
contract BuffCatMiner is ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------
    // Immutable config
    // ---------------------------------------------------------------
    IERC20 public immutable buffcat;

    address public immutable buybackWallet;   // 25%
    address public immutable platformWallet;  // 15%
    address public immutable ecoWallet;       // 20%
    // dividends (40%) stay in-contract

    uint16 public constant BUYBACK_BPS  = 2500;
    uint16 public constant DIVIDEND_BPS = 4000;
    uint16 public constant PLATFORM_BPS = 1500;
    uint16 public constant ECO_BPS      = 2000;
    uint16 public constant BPS = 10000;

    uint16 public constant EARLY_EXIT_BPS = 1000;      // 10% penalty on principal
    // early-exit penalty split (of the 10%): 70% stayers / 15% platform / 15% buyback
    uint16 public constant PEN_STAYERS_BPS  = 7000;
    uint16 public constant PEN_PLATFORM_BPS = 1500;
    uint16 public constant PEN_BUYBACK_BPS  = 1500;
    uint16 public constant COMPOUND_FEE_BPS = 200;     // 2% on compounded amount (in BUFFCAT)
    uint16 public constant FEATURED_BONUS_BPS = 13000; // 1.3x hashpower for featured choosers
    uint256 public constant MIN_HOLD = 24 hours;       // before any dividend accrues

    // Flat ETH platform fee (like the reference ReflectionToken's hook fee).
    // No oracle needed: fixed amount, owner-adjustable within hard caps.
    uint256 public buyFeeWei = 0.003 ether;             // ~$5 at launch price
    uint256 public constant MAX_BUY_FEE = 0.05 ether;   // owner can't exceed
    uint256 public constant MIN_BUY_FEE = 0.0005 ether; // owner can't go below
    uint256 public constant MAX_LOCK = 30_000_000 * 1e18; // TVL control cap

    // Tier durations & multipliers (bps of 10000 = 1.0x)
    // 0 Tourist 1d, 1 GymTrial 3d, 2 Member 7d, 3 Beast 30d,
    // 4 DiamondPaws 365d, 5 Chad 3650d, 6 Ascended 36500d
    uint32[7] public TIER_DURATION = [
        uint32(1 days), 3 days, 7 days, 30 days, 365 days, 3650 days, 36500 days
    ];
    uint16[7] public TIER_MULT_BPS = [
        uint16(10000), 12500, 16000, 22000, 35000, 50000, 60000
    ];

    enum Choice { ETH, USDG, FEATURED }

    // ---------------------------------------------------------------
    // Reward accumulators (Batog O(1) — scaled by 1e18)
    // ---------------------------------------------------------------
    uint256 private constant ACC = 1e18;
    uint256 public accEthPerShare;   // ETH dividends per hashpower unit
    uint256 public accBuffPerShare;  // BUFFCAT (from early-exit penalties) per hashpower
    uint256 public totalHashpower;   // sum of all active positions' hashpower

    IERC20 public usdgToken;         // set once by owner
    uint256 public accUsdgPerShare;

    // Featured campaign
    IERC20 public featuredToken;
    uint256 public accFeaturedPerShare;
    uint64  public featuredWeekStart; // snapshot boundary
    uint256 public featuredHashpower; // hashpower ELIGIBLE for current campaign
    uint256 public featuredPending;   // featured hashpower locked THIS campaign (eligible next)

    // ---------------------------------------------------------------
    // Positions
    // ---------------------------------------------------------------
    struct Position {
        uint128 principal;     // BUFFCAT locked
        uint128 hashpower;     // principal * tierMult (* featuredBonus if FEATURED)
        uint64  lockTime;      // when locked
        uint64  unlockTime;    // when it matures
        uint8   tier;
        uint8   choice;        // Choice enum
        bool    active;
        // reward debts (what's already been accounted)
        uint256 ethDebt;
        uint256 usdgDebt;
        uint256 featDebt;
        uint256 buffDebt;
    }

    mapping(address => Position[]) public positions;
    uint256 public totalPrincipal; // sum of all active principal (solvency check)

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------
    event Locked(address indexed user, uint256 posId, uint256 principal, uint8 tier, uint8 choice);
    event Claimed(address indexed user, uint256 ethAmt, uint256 usdgAmt, uint256 featAmt);
    event Unlocked(address indexed user, uint256 posId, uint256 principal, bool early);
    event Compounded(address indexed user, uint256 posId, uint256 added);
    event FeaturedSet(address indexed token, uint64 weekStart);
    event DividendFunded(uint256 ethAmount);
    event UsdgDividendFunded(uint256 amount);
    event FeaturedFunded(uint256 amount);
    event BuyFeeUpdated(uint256 newFeeWei);

    // ---------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------
    error BadWallet();
    error ZeroAmount();
    error BadTier();
    error NoFee();
    error NotYours();
    error Inactive();
    error NotMatured();
    error NothingToClaim();
    error FeaturedNotSet();
    error USDGAlreadySet();
    error Overflow();

    function _u128(uint256 x) internal pure returns (uint128) {
        if (x > type(uint128).max) revert Overflow();
        return uint128(x);
    }

    constructor(
        address _buffcat,
        address _buyback,
        address _platform,
        address _eco,
        address _ownerAddr
    ) Ownable(_ownerAddr) {
        if (_buffcat == address(0) || _buyback == address(0) ||
            _platform == address(0) || _eco == address(0)) revert BadWallet();
        buffcat = IERC20(_buffcat);
        buybackWallet = _buyback;
        platformWallet = _platform;
        ecoWallet = _eco;
    }


    // ===============================================================
    // Internal: ETH fee split (CEI, no loops)
    // ===============================================================
    function _splitEthFee(uint256 amount) internal {
        if (amount == 0) return;
        uint256 toDiv  = (amount * DIVIDEND_BPS) / BPS;
        uint256 toBuy  = (amount * BUYBACK_BPS)  / BPS;
        uint256 toPlat = (amount * PLATFORM_BPS) / BPS;
        uint256 toEco  = amount - toDiv - toBuy - toPlat; // remainder = eco (no dust)

        // dividend slice stays in-contract, added to accumulator
        if (totalHashpower > 0 && toDiv > 0) {
            accEthPerShare += (toDiv * ACC) / totalHashpower;
        }
        // send the other three out (CEI: state already updated)
        if (toBuy > 0)  { (bool a,) = buybackWallet.call{value: toBuy}("");   require(a); }
        if (toPlat > 0) { (bool b,) = platformWallet.call{value: toPlat}(""); require(b); }
        if (toEco > 0)  { (bool c,) = ecoWallet.call{value: toEco}("");       require(c); }
    }

    // ===============================================================
    // Lock (buy miners)
    // ===============================================================
    function lock(uint256 amount, uint8 tier, uint8 choice)
        external payable nonReentrant whenNotPaused
    {
        if (amount == 0) revert ZeroAmount();
        if (amount > MAX_LOCK) revert BadTier(); // TVL control cap
        if (tier >= 7) revert BadTier();
        if (choice > uint8(Choice.FEATURED)) revert BadTier();
        uint256 feeWei = buyFeeWei;
        if (msg.value < feeWei) revert NoFee();

        // measure actual received (fee-on-transfer safe)
        uint256 balBefore = buffcat.balanceOf(address(this));
        buffcat.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = buffcat.balanceOf(address(this)) - balBefore;
        if (received == 0) revert ZeroAmount();

        uint256 hp = (received * TIER_MULT_BPS[tier]) / BPS;
        bool isFeat = (choice == uint8(Choice.FEATURED));
        if (isFeat) hp = (hp * FEATURED_BONUS_BPS) / BPS;

        Position memory pos;
        pos.principal = _u128(received);
        pos.hashpower = _u128(hp);
        pos.lockTime  = uint64(block.timestamp);
        pos.unlockTime = uint64(block.timestamp + TIER_DURATION[tier]);
        pos.tier = tier;
        pos.choice = choice;
        pos.active = true;
        // set debts so they only earn on FUTURE distributions
        pos.ethDebt  = (hp * accEthPerShare) / ACC;
        pos.usdgDebt = (hp * accUsdgPerShare) / ACC;
        pos.buffDebt = (hp * accBuffPerShare) / ACC;
        // featured: new featured locks go to PENDING (eligible next campaign).
        // featDebt starts at current acc so they don't claim past distributions.
        if (isFeat) {
            pos.featDebt = (hp * accFeaturedPerShare) / ACC;
        } else {
            pos.featDebt = type(uint256).max; // non-featured: never earns featured
        }

        positions[msg.sender].push(pos);
        totalHashpower += hp;
        totalPrincipal += received;
        if (isFeat) featuredPending += hp; // becomes eligible at next setFeatured

        _splitEthFee(feeWei);
        // refund any overpayment
        uint256 excess = msg.value - feeWei;
        if (excess > 0) { (bool ok,) = msg.sender.call{value: excess}(""); require(ok); }
        emit Locked(msg.sender, positions[msg.sender].length - 1, received, tier, choice);
    }

    // ===============================================================
    // Pending rewards (view, O(1))
    // ===============================================================
    function _pendingEth(Position storage p) internal view returns (uint256) {
        if (!p.active) return 0;
        if (block.timestamp < p.lockTime + MIN_HOLD) return 0;
        uint256 acc = (uint256(p.hashpower) * accEthPerShare) / ACC;
        return acc > p.ethDebt ? acc - p.ethDebt : 0;
    }
    function _pendingUsdg(Position storage p) internal view returns (uint256) {
        if (!p.active) return 0;
        if (block.timestamp < p.lockTime + MIN_HOLD) return 0;
        uint256 acc = (uint256(p.hashpower) * accUsdgPerShare) / ACC;
        return acc > p.usdgDebt ? acc - p.usdgDebt : 0;
    }
    function _pendingBuff(Position storage p) internal view returns (uint256) {
        if (!p.active) return 0;
        if (block.timestamp < p.lockTime + MIN_HOLD) return 0;
        uint256 acc = (uint256(p.hashpower) * accBuffPerShare) / ACC;
        return acc > p.buffDebt ? acc - p.buffDebt : 0;
    }
    function _pendingFeat(Position storage p) internal view returns (uint256) {
        if (!p.active || p.featDebt == type(uint256).max) return 0;
        if (block.timestamp < p.lockTime + MIN_HOLD) return 0;
        // must have been locked BEFORE the current campaign's snapshot
        if (featuredWeekStart == 0 || uint256(p.lockTime) >= featuredWeekStart) return 0;
        uint256 acc = (uint256(p.hashpower) * accFeaturedPerShare) / ACC;
        return acc > p.featDebt ? acc - p.featDebt : 0;
    }

    function pendingRewards(address user, uint256 posId)
        external view returns (uint256 eth, uint256 usdg, uint256 feat)
    {
        Position storage p = positions[user][posId];
        return (_pendingEth(p), _pendingUsdg(p), _pendingFeat(p));
    }

    // ===============================================================
    // Claim (per position) — pays only the chosen asset
    // ===============================================================
    function claim(uint256 posId) public nonReentrant {
        Position storage p = positions[msg.sender][posId];
        if (!p.active) revert Inactive();

        uint256 eth = _pendingEth(p);
        uint256 usdg = _pendingUsdg(p);
        uint256 feat = _pendingFeat(p);
        uint256 buff = _pendingBuff(p);

        // update debts (effects before interactions)
        p.ethDebt  = (uint256(p.hashpower) * accEthPerShare) / ACC;
        p.usdgDebt = (uint256(p.hashpower) * accUsdgPerShare) / ACC;
        p.buffDebt = (uint256(p.hashpower) * accBuffPerShare) / ACC;
        if (p.featDebt != type(uint256).max) {
            p.featDebt = (uint256(p.hashpower) * accFeaturedPerShare) / ACC;
        }

        Choice c = Choice(p.choice);
        uint256 paidEth; uint256 paidUsdg; uint256 paidFeat;
        if (c == Choice.ETH) {
            if (eth == 0) revert NothingToClaim();
            paidEth = eth;
            (bool ok,) = msg.sender.call{value: eth}(""); require(ok);
        } else if (c == Choice.USDG) {
            if (usdg == 0) revert NothingToClaim();
            paidUsdg = usdg;
            usdgToken.safeTransfer(msg.sender, usdg);
        } else {
            if (feat == 0) revert NothingToClaim();
            paidFeat = feat;
            featuredToken.safeTransfer(msg.sender, feat);
        }
        // BUFFCAT penalty-bonus paid to ALL stayers regardless of choice
        if (buff > 0) buffcat.safeTransfer(msg.sender, buff);
        emit Claimed(msg.sender, paidEth, paidUsdg, paidFeat);
    }

        // ===============================================================
    // Unlock (withdraw principal)
    // ===============================================================
    function unlock(uint256 posId) external nonReentrant {
        Position storage p = positions[msg.sender][posId];
        if (!p.active) revert Inactive();

        uint256 principal = p.principal;
        uint256 hp = p.hashpower;
        bool early = block.timestamp < p.unlockTime;

        // effects: deactivate + remove hashpower
        p.active = false;
        totalHashpower -= hp;
        totalPrincipal -= principal;
        if (p.choice == uint8(Choice.FEATURED)) {
            // remove from eligible if promoted, else from pending
            if (uint256(p.lockTime) < featuredWeekStart && featuredWeekStart != 0) {
                if (featuredHashpower >= hp) featuredHashpower -= hp;
            } else {
                if (featuredPending >= hp) featuredPending -= hp;
            }
        }

        uint256 payout = principal;
        if (early) {
            uint256 penalty = (principal * EARLY_EXIT_BPS) / BPS;
            payout = principal - penalty;

            uint256 toStay = (penalty * PEN_STAYERS_BPS) / BPS;
            uint256 toPlat = (penalty * PEN_PLATFORM_BPS) / BPS;
            uint256 toBuy  = penalty - toStay - toPlat; // remainder = buyback (no dust)

            // stayer share -> BUFFCAT accumulator (this position's hashpower already
            // removed above, so it does NOT pay itself)
            if (totalHashpower > 0 && toStay > 0) {
                accBuffPerShare += (toStay * ACC) / totalHashpower;
            } else {
                // no stayers left: fold stayer share into buyback
                toBuy += toStay;
            }
            // platform + buyback shares transferred out
            if (toPlat > 0) buffcat.safeTransfer(platformWallet, toPlat);
            if (toBuy > 0)  buffcat.safeTransfer(buybackWallet, toBuy);
        }
        buffcat.safeTransfer(msg.sender, payout);
        emit Unlocked(msg.sender, posId, payout, early);
    }

    // ===============================================================
    // Compound (re-lock ETH dividends? No—dividends are ETH; compound BUFFCAT)
    // Compound adds claimable-as-hashpower with 2% fee. Only for ETH/USDG choosers
    // it credits mining power directly (no swap). Implemented as: user adds more
    // BUFFCAT to an existing position at 2% fee instead of 4%.
    // ===============================================================
    function compound(uint256 posId, uint256 addAmount)
        external nonReentrant whenNotPaused
    {
        Position storage p = positions[msg.sender][posId];
        if (!p.active) revert Inactive();
        if (addAmount == 0) revert ZeroAmount();

        uint256 balBefore = buffcat.balanceOf(address(this));
        buffcat.safeTransferFrom(msg.sender, address(this), addAmount);
        uint256 received = buffcat.balanceOf(address(this)) - balBefore;

        uint256 fee = (received * COMPOUND_FEE_BPS) / BPS;
        uint256 net = received - fee;
        if (fee > 0) buffcat.safeTransfer(buybackWallet, fee); // compound fee -> buyback

        // recompute hashpower delta
        uint256 addHp = (net * TIER_MULT_BPS[p.tier]) / BPS;
        if (p.choice == uint8(Choice.FEATURED)) addHp = (addHp * FEATURED_BONUS_BPS) / BPS;

        // Preserve already-earned dividends: increase debt by ONLY the new
        // hashpower's current value, so existing pending stays intact.
        p.ethDebt  += (addHp * accEthPerShare) / ACC;
        p.usdgDebt += (addHp * accUsdgPerShare) / ACC;
        if (p.featDebt != type(uint256).max) {
            p.featDebt += (addHp * accFeaturedPerShare) / ACC;
        }
        p.buffDebt += (addHp * accBuffPerShare) / ACC;

        p.principal = _u128(uint256(p.principal) + net);
        p.hashpower = _u128(uint256(p.hashpower) + addHp);
        totalPrincipal += net;
        totalHashpower += addHp;
        if (p.choice == uint8(Choice.FEATURED)) featuredPending += addHp;
        emit Compounded(msg.sender, posId, net);
    }

    // ===============================================================
    // Owner: fund dividends, set USDG, set featured, sweep penalties
    // ===============================================================
    function fundEthDividends() external payable onlyOwner {
        if (msg.value == 0) revert ZeroAmount();
        if (totalHashpower > 0) accEthPerShare += (msg.value * ACC) / totalHashpower;
        emit DividendFunded(msg.value);
    }

    function setUsdg(address _usdg) external onlyOwner {
        if (address(usdgToken) != address(0)) revert USDGAlreadySet();
        usdgToken = IERC20(_usdg);
    }

    function fundUsdgDividends(uint256 amount) external onlyOwner {
        if (totalHashpower > 0) accUsdgPerShare += (amount * ACC) / totalHashpower;
        usdgToken.safeTransferFrom(msg.sender, address(this), amount);
        emit UsdgDividendFunded(amount);
    }

    function setFeatured(address token, uint64 weekStart) external onlyOwner {
        featuredToken = IERC20(token);
        featuredWeekStart = weekStart;
        // promote everyone who locked featured before now into the eligible set.
        // O(1): move the pending bucket into eligible. New locks after this go
        // to pending again (eligible only at the NEXT campaign).
        featuredHashpower += featuredPending;
        featuredPending = 0;
        emit FeaturedSet(token, weekStart);
    }

    function fundFeatured(uint256 amount) external onlyOwner {
        if (featuredHashpower == 0) revert FeaturedNotSet();
        accFeaturedPerShare += (amount * ACC) / featuredHashpower;
        featuredToken.safeTransferFrom(msg.sender, address(this), amount);
        emit FeaturedFunded(amount);
    }

    function setBuyFee(uint256 newFeeWei) external onlyOwner {
        if (newFeeWei > MAX_BUY_FEE || newFeeWei < MIN_BUY_FEE) revert Overflow();
        buyFeeWei = newFeeWei;
        emit BuyFeeUpdated(newFeeWei);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function positionCount(address user) external view returns (uint256) {
        return positions[user].length;
    }

    receive() external payable {}
}
