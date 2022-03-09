// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import '@openzeppelin/contracts/token/ERC1155/presets/ERC1155PresetMinterPauser.sol';

contract ERC1155Mintable is ERC1155PresetMinterPauser("uri/") {
    event CoverageFix();
    function mint(address to, uint256 id, uint256 amount) public {
        emit CoverageFix(); // Workaround for https://github.com/NomicFoundation/hardhat/issues/2466
        _setupRole(MINTER_ROLE, msg.sender);
        emit CoverageFix(); // Workaround for https://github.com/NomicFoundation/hardhat/issues/2466
        _mint(to, id, amount, "");
    }
}
