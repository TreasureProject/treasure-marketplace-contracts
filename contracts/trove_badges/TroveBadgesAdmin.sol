//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./TroveBadgesState.sol";

abstract contract TroveBadgesAdmin is Initializable, TroveBadgesState {

    function __TroveBadgesAdmin_init() internal initializer {
        TroveBadgesState.__TroveBadgesState_init();
    }
}