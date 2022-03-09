// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

/// @title  Treasure NFT marketplace
/// @notice This contract allows you to buy and sell NFTs from token contracts that are approved by the contract owner.
/// @dev    All transactions negotiated here are "non-custodial" and execute atomically between the buyer and seller.
contract TreasureMarketplace is OwnableUpgradeable, PausableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    struct Listing {
        /// @dev number of tokens for sale (1 if ERC-721 token is active for sale)
        uint256 quantity;
        /// @dev price per token sold, i.e. extended sale price equals this times quantity purchased
        uint256 pricePerItem;
        /// @dev timestamp after which the listing is invalid
        uint256 expirationTime;
    }
    
    enum TokenApprovalStatus {NOT_APPROVED, ERC_721_APPROVED, ERC_1155_APPROVED}

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
        uint256 quantity,
        uint256 pricePerItem,
        uint256 expirationTime
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
        uint256 quantity,
        uint256 pricePerItem,
        uint256 expirationTime
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
        uint256 quantity,
        uint256 pricePerItem
    );

    /// @notice Perform initial contract setup
    /// @dev    The initializer modifier ensures this is only called once, the owner should confirm this was properly
    ///         performed before publishing this contract address.
    /// @param  initialFee          fee to be paid on each sale, in basis points
    /// @param  initialFeeRecipient wallet to collets fees
    /// @param  initialPaymentToken address of the token that is used for settlement
    function initialize(
        uint256 initialFee,
        address initialFeeRecipient,
        IERC20Upgradeable initialPaymentToken
    )
        external initializer
    {
        __Ownable_init_unchained();
        __Pausable_init_unchained();
        __ReentrancyGuard_init_unchained();

        setFee(initialFee);
        setFeeRecipient(initialFeeRecipient);
        paymentToken = initialPaymentToken;
    }

    /// @notice Creates an item listing. You must authorize this marketplace with your item's token contract to list.
    /// @param  nftAddress     which token contract holds the offered token
    /// @param  tokenId        the identifier for the offered token
    /// @param  quantity       how many of this token identifier are offered (or 1 for a ERC-721 token)
    /// @param  pricePerItem   the price (in units of the paymentToken) for each token offered
    /// @param  expirationTime UNIX timestamp after when this listing expires
    function createListing(
        address nftAddress,
        uint256 tokenId,
        uint256 quantity,
        uint256 pricePerItem,
        uint256 expirationTime
    )
        external
        nonReentrant
        whenNotPaused
    {
        require(listings[nftAddress][tokenId][_msgSender()].quantity == 0, "already listed");
        _createListingWithoutEvent(nftAddress, tokenId, quantity, pricePerItem, expirationTime);
        emit ItemListed(
            _msgSender(),
            nftAddress,
            tokenId,
            quantity,
            pricePerItem,
            expirationTime
        );
    }

    /// @notice Updates an item listing
    /// @param  nftAddress        which token contract holds the offered token
    /// @param  tokenId           the identifier for the offered token
    /// @param  newQuantity       how many of this token identifier are offered (or 1 for a ERC-721 token)
    /// @param  newPricePerItem   the price (in units of the paymentToken) for each token offered
    /// @param  newExpirationTime UNIX timestamp after when this listing expires
    function updateListing(
        address nftAddress,
        uint256 tokenId,
        uint256 newQuantity,
        uint256 newPricePerItem,
        uint256 newExpirationTime
    )
        external
        nonReentrant
        whenNotPaused
    {
        require(listings[nftAddress][tokenId][_msgSender()].quantity > 0, "not listed item");
        _createListingWithoutEvent(nftAddress, tokenId, newQuantity, newPricePerItem, newExpirationTime);
        emit ItemUpdated(
            _msgSender(),
            nftAddress,
            tokenId,
            newQuantity,
            newPricePerItem,
            newExpirationTime
        );
    }

    /// @notice Performs the listing and does not emit the event
    /// @param  nftAddress     which token contract holds the offered token
    /// @param  tokenId        the identifier for the offered token
    /// @param  quantity       how many of this token identifier are offered (or 1 for a ERC-721 token)
    /// @param  pricePerItem   the price (in units of the paymentToken) for each token offered
    /// @param  expirationTime UNIX timestamp after when this listing expires
    function _createListingWithoutEvent(
        address nftAddress,
        uint256 tokenId,
        uint256 quantity,
        uint256 pricePerItem,
        uint256 expirationTime
    )
        internal
    {
        require(expirationTime > block.timestamp, "invalid expiration time");
        require(pricePerItem > 0, "cannot sell for 0");

        if (tokenApprovals[nftAddress] == TokenApprovalStatus.ERC_721_APPROVED) {
            IERC721Upgradeable nft = IERC721Upgradeable(nftAddress);
            require(nft.ownerOf(tokenId) == _msgSender(), "not owning item");
            require(nft.isApprovedForAll(_msgSender(), address(this)), "item not approved");
            require(quantity == 1, "cannot list multiple ERC721");
        } else if (tokenApprovals[nftAddress] == TokenApprovalStatus.ERC_1155_APPROVED) {
            IERC1155Upgradeable nft = IERC1155Upgradeable(nftAddress);
            require(nft.balanceOf(_msgSender(), tokenId) >= quantity, "must hold enough nfts");
            require(nft.isApprovedForAll(_msgSender(), address(this)), "item not approved");
            require(quantity > 0, "nothing to list");
        } else {
            revert("token is not approved for trading");
        }

        listings[nftAddress][tokenId][_msgSender()] = Listing(
            quantity,
            pricePerItem,
            expirationTime
        );
    }

    /// @notice Remove an item listing
    /// @param  nftAddress which token contract holds the offered token
    /// @param  tokenId    the identifier for the offered token
    function cancelListing(address nftAddress, uint256 tokenId)
        external
        nonReentrant
    {
        delete (listings[nftAddress][tokenId][_msgSender()]);
        emit ItemCanceled(_msgSender(), nftAddress, tokenId);
    }

    /// @notice Buy a listed item. You must authorize this marketplace with your payment token to completed the buy.
    /// @param  nftAddress      which token contract holds the offered token
    /// @param  tokenId         the identifier for the token to be bought
    /// @param  owner           current owner of the item(s) to be bought
    /// @param  quantity        how many of this token identifier to be bought (or 1 for a ERC-721 token)
    /// @param  maxPricePerItem the maximum price (in units of the paymentToken) for each token offered
    function buyItem(
        address nftAddress,
        uint256 tokenId,
        address owner,
        uint256 quantity,
        uint256 maxPricePerItem
    )
        external
        nonReentrant
        whenNotPaused
    {
        require(_msgSender() != owner, "Cannot buy your own item");

        Listing storage listedItem = listings[nftAddress][tokenId][owner];

        // Validate listing
        require(listedItem.quantity > 0, "not listed item");
        require(listedItem.expirationTime >= block.timestamp, "listing expired");
        require(listedItem.pricePerItem > 0, "listing price invalid");

        require(quantity > 0, "Nothing to buy");
        require(listedItem.quantity >= quantity, "not enough quantity");
        require(listedItem.pricePerItem <= maxPricePerItem, "price increased");

        _buyItem(nftAddress, tokenId, owner, quantity, listedItem.pricePerItem);
    }

    /// @dev Process sale for a listed item
    /// @param  nftAddress   which token contract holds the offered token
    /// @param  tokenId      the identifier for the token to be bought
    /// @param  owner        current owner of the item(s) to be bought
    /// @param  quantity     how many of this token identifier to be bought (or 1 for a ERC-721 token)
    /// @param  pricePerItem the maximum price (in units of the paymentToken) for each token offered
    function _buyItem(
        address nftAddress,
        uint256 tokenId,
        address owner,
        uint256 quantity,
        uint256 pricePerItem
    ) internal {
        Listing storage listedItem = listings[nftAddress][tokenId][owner];

        // Transfer NFT to buyer, also validates owner owns it
        if (tokenApprovals[nftAddress] == TokenApprovalStatus.ERC_721_APPROVED) {
            require(quantity == 1, "Cannot buy multiple ERC721");
            IERC721Upgradeable(nftAddress).safeTransferFrom(owner, _msgSender(), tokenId);
        } else if (tokenApprovals[nftAddress] == TokenApprovalStatus.ERC_1155_APPROVED) {
            IERC1155Upgradeable(nftAddress).safeTransferFrom(owner, _msgSender(), tokenId, quantity, bytes(""));
        } else {
            revert("token is not approved for trading");
        }

        if (listedItem.quantity == quantity) {
            delete (listings[nftAddress][tokenId][owner]);
        } else {
            listings[nftAddress][tokenId][owner].quantity -= quantity;
        }

        emit ItemSold(
            owner,
            _msgSender(),
            nftAddress,
            tokenId,
            quantity,
            pricePerItem
        );

        uint256 totalPrice = pricePerItem * quantity;
        uint256 feeAmount = totalPrice * fee / BASIS_POINTS;
        paymentToken.safeTransferFrom(_msgSender(), feeReceipient, feeAmount);
        paymentToken.safeTransferFrom(_msgSender(), owner, totalPrice - feeAmount);
    }

    // Owner administration ////////////////////////////////////////////////////////////////////////////////////////////

    /// @notice Updates the fee amount which is collected during sales
    /// @dev    This is callable only by the owner. Fee may not exceed MAX_FEE
    /// @param  newFee the updated fee amount is basis points
    function setFee(uint256 newFee) public onlyOwner {
        require(newFee <= MAX_FEE, "max fee");
        fee = newFee;
        emit UpdateFee(newFee);
    }

    /// @notice Updates the fee recipient which receives fees during sales
    /// @dev    This is callable only by the owner.
    /// @param  newFeeRecipient the wallet to receive fees
    function setFeeRecipient(address newFeeRecipient) public onlyOwner {
        feeReceipient = newFeeRecipient;
        emit UpdateFeeRecipient(newFeeRecipient);
    }

    /// @notice Sets a token as an approved kind of NFT or as ineligible for trading
    /// @dev    This is callable only by the owner.
    /// @param  nft    address of the NFT to be approved
    /// @param  status the kind of NFT approved, or NOT_APPROVED to remove approval
    function setTokenApprovalStatus(address nft, TokenApprovalStatus status) external onlyOwner {
        tokenApprovals[nft] = status;
        emit TokenApprovalStatusUpdated(nft, status);
    }

    /// @notice Pauses the marketplace, creating and executing listings is paused
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
