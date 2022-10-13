// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

struct ClaimInfo {
    address claimer;
    address badgeAddress;
    uint256 badgeId;
}

interface ITroveClaimer {
    function claim(
        ClaimInfo calldata _claimInfo,
        bytes memory _verificationSig
    ) external;
}