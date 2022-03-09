// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract ERC20Mintable is ERC20("name", "symbol") {
    event CoverageFix();
    function mint(address _to, uint256 _amount) public {
        _mint(_to, _amount);
        emit CoverageFix(); // Workaround for https://github.com/NomicFoundation/hardhat/issues/2466
    }
}
