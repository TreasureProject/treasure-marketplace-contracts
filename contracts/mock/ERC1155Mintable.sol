// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import '@openzeppelin/contracts/token/ERC1155/presets/ERC1155PresetMinterPauser.sol';

contract ERC1155Mintable is ERC1155PresetMinterPauser("uri/") {
    function mint(address to, uint256 id, uint256 amount) public {
        _setupRole(MINTER_ROLE, msg.sender);
        _mint(to, id, amount, "");
    }
}
