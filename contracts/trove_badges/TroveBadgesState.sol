//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ITroveBadges.sol";
import "../shared/ERC1155BaseUpgradeable.sol";
import "../shared/UtilitiesUpgradeable.sol";

abstract contract TroveBadgesState is Initializable, ITroveBadges, ERC1155BaseUpgradeable {
    error BadgeAlreadyClaimed(address _claimer, uint256 _tokenId);

    function __TroveBadgesState_init() internal initializer {
        ERC1155BaseUpgradeable.__ERC1155BaseUpgradeable_init();
    }
}