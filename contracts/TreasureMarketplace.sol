// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol';
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
contract TreasureMarketplace is AccessControlEnumerableUpgradeable, PausableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    struct Listing {
        /// @dev number of tokens for sale (1 if ERC-721 token is active for sale)
        uint64 quantity;
        /// @dev price per token sold, i.e. extended sale price equals this times quantity purchased
        uint128 pricePerItem;
        /// @dev timestamp after which the listing is invalid
        uint64 expirationTime;
    }

    struct CollectionOwnerFee {
        /// @dev the fee, out of 10,000, that this collection owner will be given for each sale
        uint32 fee;
        /// @dev the recipient of the collection specific fee
        address recipient;
    }

    enum TokenApprovalStatus {NOT_APPROVED, ERC_721_APPROVED, ERC_1155_APPROVED}

    /// @notice TREASURE_MARKETPLACE_ADMIN_ROLE role hash
    bytes32 public constant TREASURE_MARKETPLACE_ADMIN_ROLE = keccak256("TREASURE_MARKETPLACE_ADMIN_ROLE");

    /// @notice ERC165 interface signatures
    bytes4 private constant INTERFACE_ID_ERC721 = 0x80ac58cd;
    bytes4 private constant INTERFACE_ID_ERC1155 = 0xd9b67a26;

    /// @notice the denominator for portion calculation, i.e. how many basis points are in 100%
    uint256 public constant BASIS_POINTS = 10000;

    /// @notice the maximum fee which the owner may set (in units of basis points)
    uint256 public constant MAX_FEE = 1500;

    /// @notice the maximum fee which the collection owner may set
    uint256 public constant MAX_COLLECTION_FEE = 750;

    /// @notice the minimum price for which any item can be sold
    uint256 public constant MIN_PRICE = 1e9;

    /// @notice which token is used for marketplace sales and fee payments
    IERC20Upgradeable public paymentToken;

    /// @notice fee portion (in basis points) for each sale, (e.g. a value of 100 is 100/10000 = 1%). This is the fee if no collection owner fee is set.
    uint256 public fee;

    /// @notice address that receives fees
    address public feeReceipient;

    /// @notice mapping for listings, maps: nftAddress => tokenId => offeror
    mapping(address => mapping(uint256 => mapping(address => Listing))) public listings;

    /// @notice NFTs which the owner has approved to be sold on the marketplace, maps: nftAddress => status
    mapping(address => TokenApprovalStatus) public tokenApprovals;

    /// @notice fee portion (in basis points) for each sale. This is used if a separate fee has been set for the collection owner.
    uint256 public feeWithCollectionOwner;

    /// @notice Maps the collection address to the fees which the collection owner collects. Some collections may not have a seperate fee, such as those owned by the Treasure DAO.
    mapping(address => CollectionOwnerFee) public collectionToCollectionOwnerFee;

    /// @notice The fee portion was updated
    /// @param  fee new fee amount (in units of basis points)
    event UpdateFee(uint256 fee);

    /// @notice The fee portion was updated for collections that have a collection owner.
    /// @param  fee new fee amount (in units of basis points)
    event UpdateFeeWithCollectionOwner(uint256 fee);

    /// @notice A collection's fees have changed
    /// @param  _collection  The collection
    /// @param  _recipient   The recipient of the fees. If the address is 0, the collection fees for this collection have been removed.
    /// @param  _fee         The fee amount (in units of basis points)
    event UpdateCollectionOwnerFee(address _collection, address _recipient, uint256 _fee);

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

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

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
        external
        initializer
    {
        require(address(_initialPaymentToken) != address(0), "TreasureMarketplace: cannot set address(0)");

        __AccessControl_init_unchained();
        __Pausable_init_unchained();
        __ReentrancyGuard_init_unchained();

        _setRoleAdmin(TREASURE_MARKETPLACE_ADMIN_ROLE, TREASURE_MARKETPLACE_ADMIN_ROLE);
        _grantRole(TREASURE_MARKETPLACE_ADMIN_ROLE, msg.sender);

        setFee(_initialFee, _initialFee);
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
        require(listings[_nftAddress][_tokenId][_msgSender()].quantity == 0, "TreasureMarketplace: already listed");
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
    /// @param  _currentQuantity   expected current quantity, protection from front-running
    /// @param  _newQuantity       how many of this token identifier are offered (or 1 for a ERC-721 token)
    /// @param  _newPricePerItem   the price (in units of the paymentToken) for each token offered
    /// @param  _newExpirationTime UNIX timestamp after when this listing expires
    function updateListing(
        address _nftAddress,
        uint256 _tokenId,
        uint64 _currentQuantity,
        uint64 _newQuantity,
        uint128 _newPricePerItem,
        uint64 _newExpirationTime
    )
        external
        nonReentrant
        whenNotPaused
    {
        uint256 q = listings[_nftAddress][_tokenId][_msgSender()].quantity;
        require(q > 0, "TreasureMarketplace: not listed item");
        require(q == _currentQuantity, "TreasureMarketplace: item quantity changed");

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
        require(_expirationTime > block.timestamp, "TreasureMarketplace: invalid expiration time");
        require(_pricePerItem >= MIN_PRICE, "TreasureMarketplace: below min price");

        if (tokenApprovals[_nftAddress] == TokenApprovalStatus.ERC_721_APPROVED) {
            IERC721Upgradeable nft = IERC721Upgradeable(_nftAddress);
            require(nft.ownerOf(_tokenId) == _msgSender(), "TreasureMarketplace: not owning item");
            require(nft.isApprovedForAll(_msgSender(), address(this)), "TreasureMarketplace: item not approved");
            require(_quantity == 1, "TreasureMarketplace: cannot list multiple ERC721");
        } else if (tokenApprovals[_nftAddress] == TokenApprovalStatus.ERC_1155_APPROVED) {
            IERC1155Upgradeable nft = IERC1155Upgradeable(_nftAddress);
            require(nft.balanceOf(_msgSender(), _tokenId) >= _quantity, "TreasureMarketplace: must hold enough nfts");
            require(nft.isApprovedForAll(_msgSender(), address(this)), "TreasureMarketplace: item not approved");
            require(_quantity > 0, "TreasureMarketplace: nothing to list");
        } else {
            revert("TreasureMarketplace: token is not approved for trading");
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
        require(_msgSender() != _owner, "TreasureMarketplace: Cannot buy your own item");
        require(_quantity > 0, "TreasureMarketplace: Nothing to buy");

        // Validate listing
        Listing memory listedItem = listings[_nftAddress][_tokenId][_owner];
        require(listedItem.quantity > 0, "TreasureMarketplace: not listed item");
        require(listedItem.expirationTime >= block.timestamp, "TreasureMarketplace: listing expired");
        require(listedItem.pricePerItem > 0, "TreasureMarketplace: listing price invalid");
        require(listedItem.quantity >= _quantity, "TreasureMarketplace: not enough quantity");
        require(listedItem.pricePerItem <= _maxPricePerItem, "TreasureMarketplace: price increased");

        // Transfer NFT to buyer, also validates owner owns it, and token is approved for trading
        if (tokenApprovals[_nftAddress] == TokenApprovalStatus.ERC_721_APPROVED) {
            require(_quantity == 1, "TreasureMarketplace: Cannot buy multiple ERC721");
            IERC721Upgradeable(_nftAddress).safeTransferFrom(_owner, _msgSender(), _tokenId);
        } else if (tokenApprovals[_nftAddress] == TokenApprovalStatus.ERC_1155_APPROVED) {
            IERC1155Upgradeable(_nftAddress).safeTransferFrom(_owner, _msgSender(), _tokenId, _quantity, bytes(""));
        } else {
            revert("TreasureMarketplace: token is not approved for trading");
        }

        _payFeesAndSeller(listedItem, _quantity, _nftAddress, _owner);

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

    /// @dev pays the fees to the marketplace fee recipient, the collection recipient if one exists, and to the seller of the item.
    /// @param _listedItem the item that is being purchased
    /// @param _quantity the quantity of the item being purchased
    /// @param _collectionAddress the collection to which this item belongs
    /// @param _seller the seller of the item
    function _payFeesAndSeller(Listing memory _listedItem, uint256 _quantity, address _collectionAddress, address _seller) private {
        // Handle purchase price payment
        uint256 _totalPrice = _listedItem.pricePerItem * _quantity;

        address _collectionFeeRecipient = collectionToCollectionOwnerFee[_collectionAddress].recipient;

        uint256 _protocolFee;
        uint256 _collectionFee;

        if(_collectionFeeRecipient != address(0)) {
            _protocolFee = feeWithCollectionOwner;
            _collectionFee = collectionToCollectionOwnerFee[_collectionAddress].fee;
        } else {
            _protocolFee = fee;
            _collectionFee = 0;
        }

        uint256 _protocolFeeAmount = _totalPrice * _protocolFee / BASIS_POINTS;
        uint256 _collectionFeeAmount = _totalPrice * _collectionFee / BASIS_POINTS;

        if(_protocolFeeAmount > 0) {
            paymentToken.safeTransferFrom(_msgSender(), feeReceipient, _protocolFeeAmount);
        }
        if(_collectionFeeAmount > 0) {
            paymentToken.safeTransferFrom(_msgSender(), _collectionFeeRecipient, _collectionFeeAmount);
        }

        // Transfer rest to seller
        paymentToken.safeTransferFrom(_msgSender(), _seller, _totalPrice - _protocolFeeAmount - _collectionFeeAmount);
    }

    // Owner administration ////////////////////////////////////////////////////////////////////////////////////////////

    /// @notice Updates the fee amount which is collected during sales, for both collections with and without owner specific fees.
    /// @dev    This is callable only by the owner. Both fees may not exceed MAX_FEE
    /// @param  _newFee the updated fee amount is basis points
    function setFee(uint256 _newFee, uint256 _newFeeWithCollectionOwner) public onlyRole(TREASURE_MARKETPLACE_ADMIN_ROLE) {
        require(_newFee <= MAX_FEE && _newFeeWithCollectionOwner <= MAX_FEE, "TreasureMarketplace: max fee");

        fee = _newFee;
        feeWithCollectionOwner = _newFeeWithCollectionOwner;

        emit UpdateFee(_newFee);
        emit UpdateFeeWithCollectionOwner(_newFeeWithCollectionOwner);
    }

    /// @notice Updates the fee amount which is collected during sales fro a specific collection
    /// @dev    This is callable only by the owner
    /// @param  _collectionAddress The collection in question. This must be whitelisted.
    /// @param _collectionOwnerFee The fee and recipient for the collection. If the 0 address is passed as the recipient, collection specific fees will not be collected.
    function setCollectionOwnerFee(address _collectionAddress, CollectionOwnerFee calldata _collectionOwnerFee) external onlyRole(TREASURE_MARKETPLACE_ADMIN_ROLE) {
        require(tokenApprovals[_collectionAddress] == TokenApprovalStatus.ERC_1155_APPROVED
            || tokenApprovals[_collectionAddress] == TokenApprovalStatus.ERC_721_APPROVED, "TreasureMarketplace: Collection is not approved");
        require(_collectionOwnerFee.fee <= MAX_COLLECTION_FEE, "TreasureMarketplace: Collection fee too high");

        // The collection recipient can be the 0 address, meaning we will treat this as a collection with no collection owner fee.
        collectionToCollectionOwnerFee[_collectionAddress] = _collectionOwnerFee;

        emit UpdateCollectionOwnerFee(_collectionAddress, _collectionOwnerFee.recipient, _collectionOwnerFee.fee);
    }

    /// @notice Updates the fee recipient which receives fees during sales
    /// @dev    This is callable only by the owner.
    /// @param  _newFeeRecipient the wallet to receive fees
    function setFeeRecipient(address _newFeeRecipient) public onlyRole(TREASURE_MARKETPLACE_ADMIN_ROLE) {
        require(_newFeeRecipient != address(0), "TreasureMarketplace: cannot set 0x0 address");
        feeReceipient = _newFeeRecipient;
        emit UpdateFeeRecipient(_newFeeRecipient);
    }

    /// @notice Sets a token as an approved kind of NFT or as ineligible for trading
    /// @dev    This is callable only by the owner.
    /// @param  _nft    address of the NFT to be approved
    /// @param  _status the kind of NFT approved, or NOT_APPROVED to remove approval
    function setTokenApprovalStatus(address _nft, TokenApprovalStatus _status) external onlyRole(TREASURE_MARKETPLACE_ADMIN_ROLE) {
        if (_status == TokenApprovalStatus.ERC_721_APPROVED) {
            require(IERC165Upgradeable(_nft).supportsInterface(INTERFACE_ID_ERC721), "TreasureMarketplace: not an ERC721 contract");
        } else if (_status == TokenApprovalStatus.ERC_1155_APPROVED) {
            require(IERC165Upgradeable(_nft).supportsInterface(INTERFACE_ID_ERC1155), "TreasureMarketplace: not an ERC1155 contract");
        }

        tokenApprovals[_nft] = _status;
        emit TokenApprovalStatusUpdated(_nft, _status);
    }

    /// @notice Pauses the marketplace, creatisgn and executing listings is paused
    /// @dev    This is callable only by the owner. Canceling listings is not paused.
    function pause() external onlyRole(TREASURE_MARKETPLACE_ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpauses the marketplace, all functionality is restored
    /// @dev    This is callable only by the owner.
    function unpause() external onlyRole(TREASURE_MARKETPLACE_ADMIN_ROLE) {
        _unpause();
    }
}
