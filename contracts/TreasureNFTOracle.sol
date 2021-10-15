// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import '@openzeppelin/contracts/access/Ownable.sol';

contract TreasureNFTOracle is Ownable {

    struct Price {
        uint256 price;
        address denomination;
    }

    /// _nftAddress => _tokenId => Price
    mapping(address => mapping(uint256 => Price)) public getPrice;

    event PriceUpdate(address indexed nftAddress, uint256 indexed tokenId, address paymentToken, uint256 pricePerItem);

    function reportSale(address _nftAddress, uint256 _tokenId, address _paymentToken, uint256 _pricePerItem) external onlyOwner {
        getPrice[_nftAddress][_tokenId] = Price(_pricePerItem, _paymentToken);
        emit PriceUpdate(_nftAddress, _tokenId, _paymentToken, _pricePerItem);
    }
}
