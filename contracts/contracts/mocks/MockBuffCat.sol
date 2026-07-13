// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Simple mintable ERC20 standing in for $BUFFCAT in tests.
contract MockBuffCat is ERC20 {
    constructor() ERC20("Mock Buff Cat", "mBUFFCAT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
