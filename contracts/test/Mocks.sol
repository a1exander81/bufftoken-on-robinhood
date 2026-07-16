// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockBuffcat is ERC20 {
    constructor() ERC20("BuffCat", "BUFFCAT") { _mint(msg.sender, 1e27); }
    function mint(address to, uint256 a) external { _mint(to, a); }
}

contract MockUsdg is ERC20 {
    constructor() ERC20("USDG", "USDG") { _mint(msg.sender, 1e27); }
    function mint(address to, uint256 a) external { _mint(to, a); }
}

// Fee-on-transfer hostile token: takes 10% on every transfer
contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("Fee", "FEE") { _mint(msg.sender, 1e27); }
    function mint(address to, uint256 a) external { _mint(to, a); }
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 10;
            super._update(from, address(0xdead), fee);
            super._update(from, to, value - fee);
        } else {
            super._update(from, to, value);
        }
    }
}

// Mock Chainlink aggregator (ETH/USD) — controllable for tests
contract MockAggregator {
    int256 public answer;
    uint8 public decimals;
    uint256 public updatedAt;
    uint256 public startedAt;
    int256 public seqStatus; // 0 = up

    constructor(int256 _answer, uint8 _decimals) {
        answer = _answer; decimals = _decimals;
        updatedAt = block.timestamp; startedAt = block.timestamp;
    }
    function setAnswer(int256 a) external { answer = a; updatedAt = block.timestamp; }
    function setUpdatedAt(uint256 t) external { updatedAt = t; }
    function setSeqStatus(int256 s) external { seqStatus = s; }
    function setStartedAt(uint256 t) external { startedAt = t; }

    function latestRoundData() external view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (1, answer, startedAt, updatedAt, 1);
    }
}

// Sequencer uptime feed mock: answer 0 = up, 1 = down; startedAt = when it came up
contract MockSequencer {
    int256 public status;      // 0 up
    uint256 public startedAt;
    constructor() { status = 0; startedAt = block.timestamp > 7200 ? block.timestamp - 7200 : 0; }
    function setStatus(int256 s) external { status = s; }
    function setStartedAt(uint256 t) external { startedAt = t; }
    function decimals() external pure returns (uint8) { return 0; }
    function latestRoundData() external view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (1, status, startedAt, block.timestamp, 1);
    }
}
