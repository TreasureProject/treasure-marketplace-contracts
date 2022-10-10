//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./TroveBadgesAdmin.sol";

contract TroveBadges is Initializable, TroveBadgesAdmin {

    function initialize() external initializer {
        TroveBadgesAdmin.__TroveBadgesAdmin_init();
    }

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    )
        internal
        override
    {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);

        require(hasRole(ADMIN_ROLE, msg.sender) || hasRole(OWNER_ROLE, msg.sender),
            "TroveBadges: Only admin or owner can transfer TroveBadges");
    }

    function adminMint(address _to, uint256 _id)
        external
        override
        whenNotPaused
        
    { // requiresEitherRole(ADMIN_ROLE, OWNER_ROLE) removed for testnet
        if(balanceOf(_to, _id) > 0) {
            revert BadgeAlreadyClaimed(_to, _id);
        }

        _mint(_to, _id, 1, "");
    }
}