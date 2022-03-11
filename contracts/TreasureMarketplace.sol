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

/// @title  Treasure NFT marketplace
/// @notice This contract allows you to buy and sell NFTs from token contracts that are approved by the contract owner.
///         Please note that this contract is upgradeable. In the event of a compromised ProxyAdmin contract owner,
///         collectable tokens and payments may be at risk. To prevent this, the ProxyAdmin is owned by a multi-sig
///         governed by the TreasureDAO council.
/// @dev    This contract does not store any tokens at any time, it's only collects details "the sale" and approvals
///         from both parties and preforms non-custodial transaction by transfering NFT from owner to buying and payment
///         token from buying to NFT owner.
contract TreasureMarketplace is OwnableUpgradeable, PausableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    struct Listing {
        /// @dev number of tokens for sale (1 if ERC-721 token is active for sale)
        uint64 quantity;
        /// @dev price per token sold, i.e. extended sale price equals this times quantity purchased
        uint128 pricePerItem;
        /// @dev timestamp after which the listing is invalid
        uint64 expirationTime;
    }

    enum TokenApprovalStatus {NOT_APPROVED, ERC_721_APPROVED, ERC_1155_APPROVED}

    /// @notice ERC165 interface signatures
    bytes4 private constant INTERFACE_ID_ERC721 = 0x80ac58cd;
    bytes4 private constant INTERFACE_ID_ERC1155 = 0xd9b67a26;

    /// @notice the denominator for portion calculation, i.e. how many basis points are in 100%
    uint256 public constant BASIS_POINTS = 10000;

    /// @notice the maximum fee which the owner may set (in units of basis points)
    uint256 public constant MAX_FEE = 1500;

    /// @notice which token is used for marketplace sales and fee payments
    IERC20Upgradeable public paymentToken;

    /// @notice fee portion (in basis points) for each sale, (e.g. a value of 100 is 100/10000 = 1%)
    uint256 public fee;

    /// @notice address that receives fees
    address public feeReceipient;

    /// @notice mapping for listings, maps: nftAddress => tokenId => offeror
    mapping(address => mapping(uint256 => mapping(address => Listing))) public listings;

    /// @notice NFTs which the owner has approved to be sold on the marketplace, maps: nftAddress => status
    mapping(address => TokenApprovalStatus) public tokenApprovals;

    /// @notice The fee portion was updated
    /// @param  fee new fee amount (in units of basis points)
    event UpdateFee(uint256 fee);

    /// @notice The fee recipient was updated
    /// @param  feeRecipient the new recipient to get fees
    event UpdateFeeRecipient(address feeRecipient);

    /// @notice The approval status for a token was updated
    /// @param  nft    which token contract was updated
    /// @param  status the new status
    event TokenApprovalStatusUpdated(address nft, TokenApprovalStatus status);

    /// @notice An item was listed for sale
    /// @param  seller         the offeror of the item
    /// @param  nftAddress     which token contract holds the offered token
    /// @param  tokenId        the identifier for the offered token
    /// @param  quantity       how many of this token identifier are offered (or 1 for a ERC-721 token)
    /// @param  pricePerItem   the price (in units of the paymentToken) for each token offered
    /// @param  expirationTime UNIX timestamp after when this listing expires
    event ItemListed(
        address seller,
        address nftAddress,
        uint256 tokenId,
        uint64 quantity,
        uint128 pricePerItem,
        uint64 expirationTime
    );

    /// @notice An item listing was updated
    /// @param  seller         the offeror of the item
    /// @param  nftAddress     which token contract holds the offered token
    /// @param  tokenId        the identifier for the offered token
    /// @param  quantity       how many of this token identifier are offered (or 1 for a ERC-721 token)
    /// @param  pricePerItem   the price (in units of the paymentToken) for each token offered
    /// @param  expirationTime UNIX timestamp after when this listing expires
    event ItemUpdated(
        address seller,
        address nftAddress,
        uint256 tokenId,
        uint64 quantity,
        uint128 pricePerItem,
        uint64 expirationTime
    );

    /// @notice An item is no longer listed for sale
    /// @param  seller     former offeror of the item
    /// @param  nftAddress which token contract holds the formerly offered token
    /// @param  tokenId    the identifier for the formerly offered token
    event ItemCanceled(address indexed seller, address indexed nftAddress, uint256 indexed tokenId);

    /// @notice A listed item was sold
    /// @param  seller       the offeror of the item
    /// @param  buyer        the buyer of the item
    /// @param  nftAddress   which token contract holds the sold token
    /// @param  tokenId      the identifier for the sold token
    /// @param  quantity     how many of this token identifier where sold (or 1 for a ERC-721 token)
    /// @param  pricePerItem the price (in units of the paymentToken) for each token sold
    event ItemSold(
        address seller,
        address buyer,
        address nftAddress,
        uint256 tokenId,
        uint64 quantity,
        uint128 pricePerItem
    );

    /// @notice Perform initial contract setup
    /// @dev    The initializer modifier ensures this is only called once, the owner should confirm this was properly
    ///         performed before publishing this contract address.
    /// @param  _initialFee          fee to be paid on each sale, in basis points
    /// @param  _initialFeeRecipient wallet to collets fees
    /// @param  _initialPaymentToken address of the token that is used for settlement
    function initialize(
        uint256 _initialFee,
        address _initialFeeRecipient,
        IERC20Upgradeable _initialPaymentToken
    )
        external initializer
    {
        require(address(_initialPaymentToken) != address(0), "TreasureMarketplace: cannot set address(0)");

        __Ownable_init_unchained();
        __Pausable_init_unchained();
        __ReentrancyGuard_init_unchained();

        setFee(_initialFee);
        setFeeRecipient(_initialFeeRecipient);
        paymentToken = _initialPaymentToken;
    }

    /// @notice Creates an item listing. You must authorize this marketplace with your item's token contract to list.
    /// @param  _nftAddress     which token contract holds the offered token
    /// @param  _tokenId        the identifier for the offered token
    /// @param  _quantity       how many of this token identifier are offered (or 1 for a ERC-721 token)
    /// @param  _pricePerItem   the price (in units of the paymentToken) for each token offered
    /// @param  _expirationTime UNIX timestamp after when this listing expires
    function createListing(
        address _nftAddress,
        uint256 _tokenId,
        uint64 _quantity,
        uint128 _pricePerItem,
        uint64 _expirationTime
    )
        external
        nonReentrant
        whenNotPaused
    {
        require(listings[_nftAddress][_tokenId][_msgSender()].quantity == 0, "already listed");
        _createListingWithoutEvent(_nftAddress, _tokenId, _quantity, _pricePerItem, _expirationTime);
        emit ItemListed(
            _msgSender(),
            _nftAddress,
            _tokenId,
            _quantity,
            _pricePerItem,
            _expirationTime
        );
    }

    /// @notice Updates an item listing
    /// @param  _nftAddress        which token contract holds the offered token
    /// @param  _tokenId           the identifier for the offered token
    /// @param  _newQuantity       how many of this token identifier are offered (or 1 for a ERC-721 token)
    /// @param  _newPricePerItem   the price (in units of the paymentToken) for each token offered
    /// @param  _newExpirationTime UNIX timestamp after when this listing expires
    function updateListing(
        address _nftAddress,
        uint256 _tokenId,
        uint64 _newQuantity,
        uint128 _newPricePerItem,
        uint64 _newExpirationTime
    )
        external
        nonReentrant
        whenNotPaused
    {
        require(listings[_nftAddress][_tokenId][_msgSender()].quantity > 0, "not listed item");
        _createListingWithoutEvent(_nftAddress, _tokenId, _newQuantity, _newPricePerItem, _newExpirationTime);
        emit ItemUpdated(
            _msgSender(),
            _nftAddress,
            _tokenId,
            _newQuantity,
            _newPricePerItem,
            _newExpirationTime
        );
    }

    /// @notice Performs the listing and does not emit the event
    /// @param  _nftAddress     which token contract holds the offered token
    /// @param  _tokenId        the identifier for the offered token
    /// @param  _quantity       how many of this token identifier are offered (or 1 for a ERC-721 token)
    /// @param  _pricePerItem   the price (in units of the paymentToken) for each token offered
    /// @param  _expirationTime UNIX timestamp after when this listing expires
    function _createListingWithoutEvent(
        address _nftAddress,
        uint256 _tokenId,
        uint64 _quantity,
        uint128 _pricePerItem,
        uint64 _expirationTime
    )
        internal
    {
        require(_expirationTime > block.timestamp, "invalid expiration time");
        require(_pricePerItem > 0, "cannot sell for 0");

        if (tokenApprovals[_nftAddress] == TokenApprovalStatus.ERC_721_APPROVED) {
            IERC721Upgradeable nft = IERC721Upgradeable(_nftAddress);
            require(nft.ownerOf(_tokenId) == _msgSender(), "not owning item");
            require(nft.isApprovedForAll(_msgSender(), address(this)), "item not approved");
            require(_quantity == 1, "cannot list multiple ERC721");
        } else if (tokenApprovals[_nftAddress] == TokenApprovalStatus.ERC_1155_APPROVED) {
            IERC1155Upgradeable nft = IERC1155Upgradeable(_nftAddress);
            require(nft.balanceOf(_msgSender(), _tokenId) >= _quantity, "must hold enough nfts");
            require(nft.isApprovedForAll(_msgSender(), address(this)), "item not approved");
            require(_quantity > 0, "nothing to list");
        } else {
            revert("token is not approved for trading");
        }

        listings[_nftAddress][_tokenId][_msgSender()] = Listing(
            _quantity,
            _pricePerItem,
            _expirationTime
        );
    }

    /// @notice Remove an item listing
    /// @param  _nftAddress which token contract holds the offered token
    /// @param  _tokenId    the identifier for the offered token
    function cancelListing(address _nftAddress, uint256 _tokenId)
        external
        nonReentrant
    {
        delete (listings[_nftAddress][_tokenId][_msgSender()]);
        emit ItemCanceled(_msgSender(), _nftAddress, _tokenId);
    }

    /// @notice Buy a listed item. You must authorize this marketplace with your payment token to completed the buy.
    /// @param  _nftAddress      which token contract holds the offered token
    /// @param  _tokenId         the identifier for the token to be bought
    /// @param  _owner           current owner of the item(s) to be bought
    /// @param  _quantity        how many of this token identifier to be bought (or 1 for a ERC-721 token)
    /// @param  _maxPricePerItem the maximum price (in units of the paymentToken) for each token offered
    function buyItem(
        address _nftAddress,
        uint256 _tokenId,
        address _owner,
        uint64 _quantity,
        uint128 _maxPricePerItem
    )
        external
        nonReentrant
        whenNotPaused
    {
        // Validate buy order
        require(_msgSender() != _owner, "Cannot buy your own item");
        require(_quantity > 0, "Nothing to buy");

        // Validate listing
        Listing memory listedItem = listings[_nftAddress][_tokenId][_owner];
        require(listedItem.quantity > 0, "not listed item");
        require(listedItem.expirationTime >= block.timestamp, "listing expired");
        require(listedItem.pricePerItem > 0, "listing price invalid");
        require(listedItem.quantity >= _quantity, "not enough quantity");
        require(listedItem.pricePerItem <= _maxPricePerItem, "price increased");

        // Transfer NFT to buyer, also validates owner owns it, and token is approved for trading
        if (tokenApprovals[_nftAddress] == TokenApprovalStatus.ERC_721_APPROVED) {
            require(_quantity == 1, "Cannot buy multiple ERC721");
            IERC721Upgradeable(_nftAddress).safeTransferFrom(_owner, _msgSender(), _tokenId);
        } else if (tokenApprovals[_nftAddress] == TokenApprovalStatus.ERC_1155_APPROVED) {
            IERC1155Upgradeable(_nftAddress).safeTransferFrom(_owner, _msgSender(), _tokenId, _quantity, bytes(""));
        } else {
            revert("token is not approved for trading");
        }

        // Handle purchase price payment
        uint256 totalPrice = listedItem.pricePerItem * _quantity;
        uint256 feeAmount = totalPrice * fee / BASIS_POINTS;
        paymentToken.safeTransferFrom(_msgSender(), feeReceipient, feeAmount);
        paymentToken.safeTransferFrom(_msgSender(), _owner, totalPrice - feeAmount);

        // Announce sale
        emit ItemSold(
            _owner,
            _msgSender(),
            _nftAddress,
            _tokenId,
            _quantity,
            listedItem.pricePerItem // this is deleted below in "Deplete or cancel listing"
        );

        // Deplete or cancel listing
        if (listedItem.quantity == _quantity) {
            delete listings[_nftAddress][_tokenId][_owner];
        } else {
            listings[_nftAddress][_tokenId][_owner].quantity -= _quantity;
        }
    }

    // Owner administration ////////////////////////////////////////////////////////////////////////////////////////////

    /// @notice Updates the fee amount which is collected during sales
    /// @dev    This is callable only by the owner. Fee may not exceed MAX_FEE
    /// @param  _newFee the updated fee amount is basis points
    function setFee(uint256 _newFee) public onlyOwner {
        require(_newFee <= MAX_FEE, "max fee");
        fee = _newFee;
        emit UpdateFee(_newFee);
    }

    /// @notice Updates the fee recipient which receives fees during sales
    /// @dev    This is callable only by the owner.
    /// @param  _newFeeRecipient the wallet to receive fees
    function setFeeRecipient(address _newFeeRecipient) public onlyOwner {
        require(_newFeeRecipient != address(0), "TreasureMarketplace: cannot set 0x0 address");
        feeReceipient = _newFeeRecipient;
        emit UpdateFeeRecipient(_newFeeRecipient);
    }

    /// @notice Sets a token as an approved kind of NFT or as ineligible for trading
    /// @dev    This is callable only by the owner.
    /// @param  _nft    address of the NFT to be approved
    /// @param  _status the kind of NFT approved, or NOT_APPROVED to remove approval
    function setTokenApprovalStatus(address _nft, TokenApprovalStatus _status) external onlyOwner {
        if (_status == TokenApprovalStatus.ERC_721_APPROVED) {
            require(IERC165Upgradeable(_nft).supportsInterface(INTERFACE_ID_ERC721), "not an ERC721 contract");
        } else if (_status == TokenApprovalStatus.ERC_1155_APPROVED) {
            require(IERC165Upgradeable(_nft).supportsInterface(INTERFACE_ID_ERC1155), "not an ERC1155 contract");
        }

        tokenApprovals[_nft] = _status;
        emit TokenApprovalStatusUpdated(_nft, _status);
    }

    /// @notice Pauses the marketplace, creatisgn and executing listings is paused
    /// @dev    This is callable only by the owner. Canceling listings is not paused.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpauses the marketplace, all functionality is restored
    /// @dev    This is callable only by the owner.
    function unpause() external onlyOwner {
        _unpause();
    }
}
