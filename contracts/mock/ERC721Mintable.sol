// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import '@openzeppelin/contracts/token/ERC721/presets/ERC721PresetMinterPauserAutoId.sol';

contract ERC721Mintable is ERC721PresetMinterPauserAutoId("name", "symbol", "uri/") {
    event CoverageFix();
    function mint(address to) public override {
        emit CoverageFix(); // Workaround for https://github.com/NomicFoundation/hardhat/issues/2466
        _setupRole(MINTER_ROLE, msg.sender);
        emit CoverageFix(); // Workaround for https://github.com/NomicFoundation/hardhat/issues/2466
        super.mint(to);
    }
}
