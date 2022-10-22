//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {TroveClaimerState, ClaimInfo, Initializable, ITroveBadges} from "./TroveClaimerState.sol";

abstract contract TroveClaimerAdmin is Initializable, TroveClaimerState {

    function __TroveClaimerAdmin_init() internal initializer {
        __TroveClaimerState_init();
    }

    function setTroveBadges(address _badgeAddress) external requiresEitherRole(ADMIN_ROLE, OWNER_ROLE) {
        troveBadgeCollection = ITroveBadges(_badgeAddress);
    }

    function setValidator(address _validator) external requiresEitherRole(ADMIN_ROLE, OWNER_ROLE) {
        validator = _validator;
    }

    function setBadgeStatus(address _badgeAddress, uint256 _badgeId, bool enabled) external requiresEitherRole(ADMIN_ROLE, OWNER_ROLE) {
        badgeToEnabledStatus[_badgeAddress][_badgeId] = enabled;
    }
}