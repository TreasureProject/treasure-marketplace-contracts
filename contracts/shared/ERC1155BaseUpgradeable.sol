//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/StringsUpgradeable.sol";

import "./UtilitiesUpgradeable.sol";

abstract contract ERC1155BaseUpgradeable is Initializable, ERC1155Upgradeable, UtilitiesUpgradeable {
    using StringsUpgradeable for uint256;

    string internal _uri;

    function __ERC1155BaseUpgradeable_init() internal initializer {
        ERC1155Upgradeable.__ERC1155_init("");
        __Utilities_init();
    }

    function uri(uint256 _typeId)
        public
        view
        override
        returns (string memory)
    {
        return bytes(_uri).length > 0 ? string(abi.encodePacked(_uri, _typeId.toString(), '.json')) : _uri;
    }

    function setUri(string calldata uri_)
        external
        whenNotPaused
        requiresEitherRole(ADMIN_ROLE, OWNER_ROLE)
    {
        _uri = uri_;
    }

    function supportsInterface(bytes4 _interfaceId)
        public
        view
        override(UtilitiesUpgradeable, ERC1155Upgradeable)
        returns (bool)
    {
        return
            ERC1155Upgradeable.supportsInterface(_interfaceId) ||
            UtilitiesUpgradeable.supportsInterface(_interfaceId);
    }
}