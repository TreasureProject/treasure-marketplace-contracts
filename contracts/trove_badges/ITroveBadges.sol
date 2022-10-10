// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";

interface ITroveBadges is IERC1155Upgradeable {

    function adminMint(address _to, uint256 _id) external;
}