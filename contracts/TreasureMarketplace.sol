// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/interfaces/IERC165Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

contract TreasureMarketplace is OwnableUpgradeable, PausableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    bytes4 private constant INTERFACE_ID_ERC721 = 0x80ac58cd;
    bytes4 private constant INTERFACE_ID_ERC1155 = 0xd9b67a26;
    uint256 public constant BASIS_POINTS = 10000;

    address public paymentToken;

    uint256 public fee;
    address public feeReceipient;

    struct Listing {
        uint256 quantity;
        uint256 pricePerItem;
        uint256 expirationTime;
    }

    //  _nftAddress => _tokenId => _owner
    mapping(address => mapping(uint256 => mapping(address => Listing))) public listings;
    mapping(address => bool) public nftWhitelist;

    event UpdateFee(uint256 fee);
    event UpdateFeeRecipient(address feeRecipient);
    event UpdateOracle(address oracle);
    event UpdatePaymentToken(address paymentToken);

    event NftWhitelistAdd(address nft);
    event NftWhitelistRemove(address nft);

    event ItemListed(
        address seller,
        address nftAddress,
        uint256 tokenId,
        uint256 quantity,
        uint256 pricePerItem,
        uint256 expirationTime
    );

    event ItemUpdated(
        address seller,
        address nftAddress,
        uint256 tokenId,
        uint256 quantity,
        uint256 pricePerItem,
        uint256 expirationTime
    );

    event ItemSold(
        address seller,
        address buyer,
        address nftAddress,
        uint256 tokenId,
        uint256 quantity,
        uint256 pricePerItem
    );

    event ItemCanceled(address seller, address nftAddress, uint256 tokenId);

    modifier isListed(
        address _nftAddress,
        uint256 _tokenId,
        address _owner
    ) {
        Listing memory listing = listings[_nftAddress][_tokenId][_owner];
        require(listing.quantity > 0, "not listed item");
        _;
    }

    modifier notListed(
        address _nftAddress,
        uint256 _tokenId,
        address _owner
    ) {
        Listing memory listing = listings[_nftAddress][_tokenId][_owner];
        require(listing.quantity == 0, "already listed");
        _;
    }

    modifier validListing(
        address _nftAddress,
        uint256 _tokenId,
        address _owner
    ) {
        Listing memory listedItem = listings[_nftAddress][_tokenId][_owner];
        if (IERC165Upgradeable(_nftAddress).supportsInterface(INTERFACE_ID_ERC721)) {
            IERC721Upgradeable nft = IERC721Upgradeable(_nftAddress);
            require(nft.ownerOf(_tokenId) == _owner, "not owning item");
        } else if (IERC165Upgradeable(_nftAddress).supportsInterface(INTERFACE_ID_ERC1155)) {
            IERC1155Upgradeable nft = IERC1155Upgradeable(_nftAddress);
            require(nft.balanceOf(_owner, _tokenId) >= listedItem.quantity, "not owning item");
        } else {
            revert("invalid nft address");
        }
        require(listedItem.expirationTime >= block.timestamp, "listing expired");
        require(listedItem.quantity > 0, "listing quantity invalid");
        require(listedItem.pricePerItem > 0, "listing price invalid");
        _;
    }

    modifier onlyWhitelisted(address nft) {
        require(nftWhitelist[nft], "nft not whitelisted");
        _;
    }

    function init(uint256 _fee, address _feeRecipient, address _paymentToken) external initializer {
        __Ownable_init_unchained();
        __Pausable_init_unchained();
        __ReentrancyGuard_init_unchained();

        setFee(_fee);
        setFeeRecipient(_feeRecipient);
        setPaymentToken(_paymentToken);
    }

    function createListing(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _quantity,
        uint256 _pricePerItem,
        uint256 _expirationTime
    )
        external
        whenNotPaused
        notListed(_nftAddress, _tokenId, _msgSender())
        onlyWhitelisted(_nftAddress)
    {
        if (_expirationTime == 0) _expirationTime = type(uint256).max;
        require(_expirationTime > block.timestamp, "invalid expiration time");
        require(_pricePerItem > 0, "cannot sell for 0");

        if (IERC165Upgradeable(_nftAddress).supportsInterface(INTERFACE_ID_ERC721)) {
            IERC721Upgradeable nft = IERC721Upgradeable(_nftAddress);
            require(nft.ownerOf(_tokenId) == _msgSender(), "not owning item");
            require(nft.isApprovedForAll(_msgSender(), address(this)), "item not approved");
            require(_quantity == 1, "cannot list multiple ERC721");
        } else if (IERC165Upgradeable(_nftAddress).supportsInterface(INTERFACE_ID_ERC1155)) {
            IERC1155Upgradeable nft = IERC1155Upgradeable(_nftAddress);
            require(nft.balanceOf(_msgSender(), _tokenId) >= _quantity, "must hold enough nfts");
            require(nft.isApprovedForAll(_msgSender(), address(this)), "item not approved");
            require(_quantity > 0, "nothing to list");
        } else {
            revert("invalid nft address");
        }

        listings[_nftAddress][_tokenId][_msgSender()] = Listing(
            _quantity,
            _pricePerItem,
            _expirationTime
        );

        emit ItemListed(
            _msgSender(),
            _nftAddress,
            _tokenId,
            _quantity,
            _pricePerItem,
            _expirationTime
        );
    }

    function updateListing(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _newQuantity,
        uint256 _newPricePerItem,
        uint256 _newExpirationTime
    )
        external
        nonReentrant
        whenNotPaused
        isListed(_nftAddress, _tokenId, _msgSender())
    {
        require(_newExpirationTime > block.timestamp, "invalid expiration time");
        require(_newPricePerItem > 0, "cannot sell for 0");

        Listing storage listedItem = listings[_nftAddress][_tokenId][_msgSender()];
        if (IERC165Upgradeable(_nftAddress).supportsInterface(INTERFACE_ID_ERC721)) {
            IERC721Upgradeable nft = IERC721Upgradeable(_nftAddress);
            require(nft.ownerOf(_tokenId) == _msgSender(), "not owning item");
            require(_newQuantity == 1, "Cannot list multiple ERC721");
        } else if (IERC165Upgradeable(_nftAddress).supportsInterface(INTERFACE_ID_ERC1155)) {
            IERC1155Upgradeable nft = IERC1155Upgradeable(_nftAddress);
            require(nft.balanceOf(_msgSender(), _tokenId) >= _newQuantity, "must hold enough nfts");
            require(_newQuantity > 0, "cannot update quantity to 0");
        } else {
            revert("invalid nft address");
        }

        listedItem.quantity = _newQuantity;
        listedItem.pricePerItem = _newPricePerItem;
        listedItem.expirationTime = _newExpirationTime;

        emit ItemUpdated(
            _msgSender(),
            _nftAddress,
            _tokenId,
            _newQuantity,
            _newPricePerItem,
            _newExpirationTime
        );
    }

    function cancelListing(address _nftAddress, uint256 _tokenId)
        external
        nonReentrant
        whenNotPaused
        isListed(_nftAddress, _tokenId, _msgSender())
    {
        _cancelListing(_nftAddress, _tokenId, _msgSender());
    }

    function _cancelListing(
        address _nftAddress,
        uint256 _tokenId,
        address _owner
    ) internal {
        Listing memory listedItem = listings[_nftAddress][_tokenId][_owner];
        if (IERC165Upgradeable(_nftAddress).supportsInterface(INTERFACE_ID_ERC721)) {
            IERC721Upgradeable nft = IERC721Upgradeable(_nftAddress);
            require(nft.ownerOf(_tokenId) == _owner, "not owning item");
        } else if (IERC165Upgradeable(_nftAddress).supportsInterface(INTERFACE_ID_ERC1155)) {
            IERC1155Upgradeable nft = IERC1155Upgradeable(_nftAddress);
            require(nft.balanceOf(_msgSender(), _tokenId) >= listedItem.quantity, "not owning item");
        } else {
            revert("invalid nft address");
        }

        delete (listings[_nftAddress][_tokenId][_owner]);
        emit ItemCanceled(_owner, _nftAddress, _tokenId);
    }

    function buyItem(
        address _nftAddress,
        uint256 _tokenId,
        address _owner,
        uint256 _quantity,
        uint256 _pricePerItem
    )
        external
        nonReentrant
        whenNotPaused
        isListed(_nftAddress, _tokenId, _owner)
        validListing(_nftAddress, _tokenId, _owner)
    {
        require(_msgSender() != _owner, "Cannot buy your own item");

        Listing storage listedItem = listings[_nftAddress][_tokenId][_owner];
        uint256 pricePerItem = listedItem.pricePerItem;

        require(_quantity > 0, "Nothing to buy");
        require(listedItem.quantity >= _quantity, "not enough quantity");
        require(pricePerItem <= _pricePerItem, "price increased");

        _buyItem(_nftAddress, _tokenId, _owner, _quantity, pricePerItem);
    }

    function _buyItem(
        address _nftAddress,
        uint256 _tokenId,
        address _owner,
        uint256 _quantity,
        uint256 _pricePerItem
    ) internal {
        Listing storage listedItem = listings[_nftAddress][_tokenId][_owner];

        // Transfer NFT to buyer
        if (IERC165Upgradeable(_nftAddress).supportsInterface(INTERFACE_ID_ERC721)) {
            require(_quantity == 1, "Cannot buy multiple ERC721");
            IERC721Upgradeable(_nftAddress).safeTransferFrom(_owner, _msgSender(), _tokenId);
        } else {
            IERC1155Upgradeable(_nftAddress).safeTransferFrom(_owner, _msgSender(), _tokenId, _quantity, bytes(""));
        }

        if (listedItem.quantity == _quantity) {
            delete (listings[_nftAddress][_tokenId][_owner]);
        } else {
            listings[_nftAddress][_tokenId][_owner].quantity -= _quantity;
        }

        emit ItemSold(
            _owner,
            _msgSender(),
            _nftAddress,
            _tokenId,
            _quantity,
            listedItem.pricePerItem
        );

        uint256 totalPrice = _pricePerItem * _quantity;
        uint256 feeAmount = totalPrice * fee / BASIS_POINTS;
        IERC20Upgradeable(paymentToken).safeTransferFrom(_msgSender(), feeReceipient, feeAmount);
        IERC20Upgradeable(paymentToken).safeTransferFrom(_msgSender(), _owner, totalPrice - feeAmount);
    }

    // admin

    function setFee(uint256 _fee) public onlyOwner {
        require(_fee < BASIS_POINTS, "max fee");
        fee = _fee;
        emit UpdateFee(_fee);
    }

    function setFeeRecipient(address _feeRecipient) public onlyOwner {
        feeReceipient = _feeRecipient;
        emit UpdateFeeRecipient(_feeRecipient);
    }

    function setPaymentToken(address _paymentToken) public onlyOwner {
        paymentToken = _paymentToken;
        emit UpdatePaymentToken(_paymentToken);
    }

    function addToWhitelist(address _nft) external onlyOwner {
        require(!nftWhitelist[_nft], "nft already whitelisted");
        nftWhitelist[_nft] = true;
        emit NftWhitelistAdd(_nft);
    }

    function removeFromWhitelist(address _nft) external onlyOwner onlyWhitelisted(_nft) {
        nftWhitelist[_nft] = false;
        emit NftWhitelistRemove(_nft);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
