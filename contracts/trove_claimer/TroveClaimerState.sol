//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ITroveClaimer, ClaimInfo} from "./ITroveClaimer.sol";
import {ITroveBadges} from "../trove_badges/ITroveBadges.sol";
import {UtilitiesUpgradeable, Initializable} from "../shared/UtilitiesUpgradeable.sol";

abstract contract TroveClaimerState is Initializable, ITroveClaimer, UtilitiesUpgradeable {
    error NotRecipient();
    error InvalidBadge(address _badgeCollection, uint256 _badgeId);
    error InvalidSignature(address _signer);
    error BadgeAlreadyClaimed(address _claimer, address _badgeCollection, uint256 _badgeId);

    bytes32 public constant CLAIMINFO_TYPE_HASH
        = keccak256("ClaimInfo(address _claimer,address _badgeAddress,uint256 _badgeId)");

    address public validator;
    ITroveBadges public troveBadgeCollection;

    // badge collection address -> badgeId -> enabled status
    mapping(address => mapping(uint256 => bool)) public badgeToEnabledStatus;

    // user address -> badge_address -> badge_id -> isClaimed
    mapping(address => mapping(address => mapping(uint256 => bool))) public userToBadgeToHasClaimed;

    function __TroveClaimerState_init() internal initializer {
        __Utilities_init();
    }
}