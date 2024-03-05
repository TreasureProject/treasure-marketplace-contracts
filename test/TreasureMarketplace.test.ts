import hre from 'hardhat';
import { expect } from 'chai';
import { getCurrentTime, mineBlock } from './utils';

const { ethers, deployments, artifacts, getNamedAccounts } = hre;
const { deploy } = deployments;

describe('TreasureMarketplace', function () {
    this.timeout(10000);

    let marketplace: any;
    let weth: any;
    let magicToken: any, nft: any, erc1155: any;
    let seller: any, buyer: any, staker3: any, feeRecipient: any, deployer: any, admin: any;
    let sellerSigner: any, buyerSigner: any, staker3Signer: any, feeRecipientSigner: any, deployerSigner: any, adminSigner: any;

    const TOKEN_APPROVAL_STATUS_NOT_APPROVED = 0;
    const TOKEN_APPROVAL_STATUS_ERC_721_APPROVED = 1;
    const TOKEN_APPROVAL_STATUS_ERC_1155_APPROVED = 2;

    before(async function () {
        const namedAccounts = await getNamedAccounts();
        seller = namedAccounts.staker1;
        buyer = namedAccounts.staker2;
        staker3 = namedAccounts.staker3;
        feeRecipient = namedAccounts.hacker;
        deployer = namedAccounts.deployer;
        admin = namedAccounts.admin;

        sellerSigner = ethers.provider.getSigner(seller);
        buyerSigner = ethers.provider.getSigner(buyer);
        staker3Signer = ethers.provider.getSigner(staker3);
        feeRecipientSigner = ethers.provider.getSigner(feeRecipient);
        deployerSigner = ethers.provider.getSigner(deployer);
        adminSigner = ethers.provider.getSigner(admin);
    });

    beforeEach(async function () {
        const ERC20Mintable = await ethers.getContractFactory('ERC20Mintable')
        magicToken = await ERC20Mintable.deploy()
        await magicToken.waitForDeployment();

        const MockWETH = await ethers.getContractFactory('MockWeth');
        weth = await MockWETH.deploy()
        await weth.waitForDeployment();

        const ERC721Mintable = await ethers.getContractFactory('ERC721Mintable')
        nft = await ERC721Mintable.deploy()
        await nft.waitForDeployment();

        const ERC1155Mintable = await ethers.getContractFactory('ERC1155Mintable')
        erc1155 = await ERC1155Mintable.deploy()
        await erc1155.waitForDeployment();

        const TreasureMarketplace = await ethers.getContractFactory('TreasureMarketplace')
        const marketplaceImpl = await TreasureMarketplace.deploy();

        const TreasureMarketplaceAbi = (await artifacts.readArtifact('TreasureMarketplace')).abi;
        const iface = new ethers.Interface(TreasureMarketplaceAbi);
        const data = iface.encodeFunctionData("initialize", [100, feeRecipient, magicToken.address]);

        const OptimizedTransparentUpgradeableProxy = await ethers.getContractFactory('OptimizedTransparentUpgradeableProxy')
        const proxy = await OptimizedTransparentUpgradeableProxy.deploy(marketplaceImpl.address, admin, data)
        await proxy.waitForDeployment();

        marketplace = new ethers.Contract(await proxy.getAddress(), TreasureMarketplaceAbi, deployerSigner);

        await(await marketplace.setWeth(weth.address)).wait();
        await(await marketplace.toggleAreBidsActive()).wait();
    });

    describe('init', function () {
        it('initialize()', async function () {
            await expect(marketplace.initialize(100, feeRecipient, magicToken.address)).to.be.revertedWith("Initializable: contract is already initialized");
        });

        it('setFee()', async function () {
            expect(await marketplace.fee()).to.be.equal(100);
            const newFee = 1500;
            const newFeeWithCollectionOwner = 750;

            await expect(marketplace.connect(staker3Signer).setFee(newFee, newFeeWithCollectionOwner)).to.be.revertedWith("AccessControl: account 0x90f79bf6eb2c4f870365e785982e1f101e93b906 is missing role 0x34d5e892b0a7ec1561fc4a5fdcb31b798cf623590906b938d356c9619e539958");

            const tooHighFee = (await marketplace.MAX_FEE()) + 1n;

            await expect(marketplace.setFee(tooHighFee, newFeeWithCollectionOwner)).to.be.revertedWith("max fee");

            await marketplace.setFee(newFee, newFeeWithCollectionOwner);
            expect(await marketplace.fee()).to.be.equal(newFee);
            expect(await marketplace.feeWithCollectionOwner()).to.be.equal(newFeeWithCollectionOwner);
        });

        it('setFeeRecipient()', async function () {
            expect(await marketplace.feeReceipient()).to.be.equal(feeRecipient);
            const newRecipient = seller;

            await expect(marketplace.connect(staker3Signer).setFeeRecipient(newRecipient)).to.be.revertedWith("AccessControl: account 0x90f79bf6eb2c4f870365e785982e1f101e93b906 is missing role 0x34d5e892b0a7ec1561fc4a5fdcb31b798cf623590906b938d356c9619e539958");
            await expect(marketplace.setFeeRecipient(ethers.ZeroAddress)).to.be.revertedWith("TreasureMarketplace: cannot set 0x0 address");

            await marketplace.setFeeRecipient(newRecipient);
            expect(await marketplace.feeReceipient()).to.be.equal(newRecipient);
        });

        it('setCollectionOwnerFee()', async function () {
            expect(await marketplace.feeReceipient()).to.be.equal(feeRecipient);
            const newRecipient = seller;

            await (await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_ERC_721_APPROVED, magicToken.address)).wait();

            const collectionOwnerFee = {
                "recipient": seller,
                "fee": 500
            };

            await expect(marketplace
                .connect(staker3Signer)
                .setCollectionOwnerFee(nft.address, collectionOwnerFee))
                .to.be.revertedWith("AccessControl: account 0x90f79bf6eb2c4f870365e785982e1f101e93b906 is missing role 0x34d5e892b0a7ec1561fc4a5fdcb31b798cf623590906b938d356c9619e539958");

            await (await marketplace.setCollectionOwnerFee(nft.address, collectionOwnerFee)).wait();

            expect((await marketplace.collectionToCollectionOwnerFee(nft.address)).recipient)
                .to.be.equal(seller);
            expect((await marketplace.collectionToCollectionOwnerFee(nft.address)).fee)
                .to.be.equal(500);
        });

        it('setPriceTracker()', async function () {
            const salesTrackerAddress = staker3;

            await expect(marketplace.connect(staker3Signer).setPriceTracker(salesTrackerAddress))
                .to.be.revertedWith("AccessControl: account 0x90f79bf6eb2c4f870365e785982e1f101e93b906 is missing role 0x34d5e892b0a7ec1561fc4a5fdcb31b798cf623590906b938d356c9619e539958");

            await expect(marketplace.setPriceTracker(salesTrackerAddress))
                .to.emit(marketplace, "UpdateSalesTracker")
                .withArgs(salesTrackerAddress);
            expect(await marketplace.priceTrackerAddress()).to.be.equal(salesTrackerAddress);
        });

        it('approve token', async function () {
            expect(await marketplace.tokenApprovals(nft.address)).to.equal(TOKEN_APPROVAL_STATUS_NOT_APPROVED);
            await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_ERC_721_APPROVED, magicToken.address);
            expect(await marketplace.tokenApprovals(nft.address)).to.equal(TOKEN_APPROVAL_STATUS_ERC_721_APPROVED);
            // Allow to approve twice
            await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_ERC_721_APPROVED, magicToken.address);
            expect(await marketplace.tokenApprovals(nft.address)).to.equal(TOKEN_APPROVAL_STATUS_ERC_721_APPROVED);

            await expect(
                marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_ERC_1155_APPROVED, magicToken.address)
            ).to.be.revertedWith("not an ERC1155 contract");
        });

        it('approve token with weth', async function () {
            expect(await marketplace.tokenApprovals(nft.address)).to.equal(TOKEN_APPROVAL_STATUS_NOT_APPROVED);
            await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_ERC_721_APPROVED, weth.address);
            expect(await marketplace.tokenApprovals(nft.address)).to.equal(TOKEN_APPROVAL_STATUS_ERC_721_APPROVED);

            expect(await marketplace.getPaymentTokenForCollection(nft.address))
                .to.equal(weth.address);
        });

        it('unapprove token', async function () {
            await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_ERC_721_APPROVED, magicToken.address);
            expect(await marketplace.tokenApprovals(nft.address)).to.equal(TOKEN_APPROVAL_STATUS_ERC_721_APPROVED);
            await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_NOT_APPROVED, magicToken.address);
            expect(await marketplace.tokenApprovals(nft.address)).to.equal(TOKEN_APPROVAL_STATUS_NOT_APPROVED);
            // Allow to remove twice
            await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_NOT_APPROVED, magicToken.address);
            expect(await marketplace.tokenApprovals(nft.address)).to.equal(TOKEN_APPROVAL_STATUS_NOT_APPROVED);
        });

        it('pause() & unpause()', async function () {
            expect(await marketplace.paused()).to.be.false;
            await marketplace.pause();
            expect(await marketplace.paused()).to.be.true;
            await marketplace.unpause();
            expect(await marketplace.paused()).to.be.false;
        });
    })

    describe('ERC721', function () {
        it('createOrUpdateListings()', async function () {
            const pricePerItem = ethers.parseUnits('1', 'ether');
            const expirationTime = 4102462800; // Midnight Jan 1, 2100
            const ListingsToCreate = {
                INVALID_MIN_PRICE: {
                    tokenId: 0,
                    nftAddress: nft.address,
                    quantity: 1,
                    pricePerItem: 0,
                    expirationTime,
                    paymentToken: magicToken.address
                },
                INVALID_OVERFLOW_PRICE: {
                    tokenId: 0,
                    nftAddress: nft.address,
                    quantity: 1,
                    pricePerItem: 999999999n,
                    expirationTime,
                    paymentToken: magicToken.address
                },
                INVALID_QUANTITY: {
                    tokenId: 0,
                    nftAddress: nft.address,
                    quantity: 0,
                    pricePerItem,
                    expirationTime,
                    paymentToken: magicToken.address
                },
                INVALID_PAYMENT_TOKEN: {
                    tokenId: 0,
                    nftAddress: nft.address,
                    quantity: 1,
                    pricePerItem,
                    expirationTime,
                    paymentToken: weth.address
                },
                INVALID_EXPIRATION: {
                    tokenId: 0,
                    nftAddress: nft.address,
                    quantity: 5,
                    pricePerItem,
                    expirationTime: (await getCurrentTime()) - 100000,
                    paymentToken: magicToken.address,
                },
                VALID_1: {
                    tokenId: 1,
                    nftAddress: nft.address,
                    quantity: 1,
                    pricePerItem,
                    expirationTime,
                    paymentToken: magicToken.address
                },
                VALID_2: {
                    tokenId: 2,
                    nftAddress: nft.address,
                    quantity: 1,
                    pricePerItem,
                    expirationTime,
                    paymentToken: magicToken.address
                },
                VALID_3: {
                    tokenId: 3,
                    nftAddress: nft.address,
                    quantity: 1,
                    pricePerItem,
                    expirationTime,
                    paymentToken: magicToken.address
                },
                VALID_4: {
                    tokenId: 4,
                    nftAddress: nft.address,
                    quantity: 1,
                    pricePerItem,
                    expirationTime,
                    paymentToken: magicToken.address
                },
            }
            const ListingsToUpdate = {
                INCREASE_PRICE: {
                    ...ListingsToCreate.VALID_1,
                    pricePerItem: ListingsToCreate.VALID_1.pricePerItem + 100n,
                },
                CHANGE_EXPIRATION: {
                    ...ListingsToCreate.VALID_1,
                    expirationTime: ListingsToCreate.VALID_1.expirationTime + 100,
                },
                CHANGE_EXPIRATION_2: {
                    ...ListingsToCreate.VALID_2,
                    expirationTime: ListingsToCreate.VALID_2.expirationTime + 100,
                },
                CHANGE_EXPIRATION_3: {
                    ...ListingsToCreate.VALID_3,
                    expirationTime: ListingsToCreate.VALID_2.expirationTime + 100,
                },
                INVALID_MIN_PRICE: {
                    ...ListingsToCreate.VALID_1,
                    pricePerItem: 0n,
                },
                INVALID_QUANTITY: {
                    ...ListingsToCreate.VALID_1,
                    quantity: 0,
                }
            }
            await nft.mint(seller);
            await nft.mint(seller);
            await nft.mint(seller);
            await nft.mint(seller);
            await nft.mint(seller);
            await nft.connect(sellerSigner).setApprovalForAll(marketplace.address, true);
            await expect(marketplace.connect(sellerSigner).createOrUpdateListings([ListingsToCreate.VALID_1])).to.be.revertedWith("token is not approved for trading");
            await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_ERC_721_APPROVED, magicToken.address);
            await expect(marketplace.connect(sellerSigner).createOrUpdateListings([ListingsToCreate.VALID_1, ListingsToCreate.INVALID_MIN_PRICE])).to.be.revertedWith("TreasureMarketplace: below min price")
            await expect(marketplace.connect(sellerSigner).createOrUpdateListings([ListingsToCreate.VALID_1, ListingsToCreate.INVALID_QUANTITY])).to.be.revertedWith("TreasureMarketplace: cannot list multiple ERC721")
            await expect(marketplace.connect(sellerSigner).createOrUpdateListings([ListingsToCreate.VALID_1, ListingsToCreate.INVALID_EXPIRATION])).to.be.revertedWith("TreasureMarketplace: invalid expiration time")
            await expect(marketplace.connect(buyerSigner).createOrUpdateListings([ListingsToCreate.VALID_1])).to.be.revertedWith("not owning item")
            await marketplace.pause();
            await expect(marketplace.connect(sellerSigner).createOrUpdateListings([ListingsToCreate.VALID_1])).to.be.revertedWith("Pausable: paused");
            await marketplace.unpause();
            await expect(marketplace.connect(sellerSigner).createOrUpdateListings([ListingsToCreate.VALID_1, ListingsToCreate.INVALID_OVERFLOW_PRICE])).to.be.revertedWith("TreasureMarketplace: below min price");
            await expect(marketplace.connect(sellerSigner).createOrUpdateListings([ListingsToCreate.VALID_1, ListingsToCreate.INVALID_PAYMENT_TOKEN])).to.be.revertedWith("TreasureMarketplace: Wrong payment token");
            await marketplace.connect(sellerSigner).createOrUpdateListings(
                [ListingsToCreate.VALID_1]
            );
            await marketplace.connect(sellerSigner).createOrUpdateListings(
                [ListingsToCreate.VALID_2, ListingsToCreate.VALID_3]
            );
            const createdListings = [ListingsToCreate.VALID_1, ListingsToCreate.VALID_2, ListingsToCreate.VALID_3]
            await Promise.all(createdListings.map(async (createdListing) => {
            const listing = await marketplace.listings(nft.address, ListingsToCreate.VALID_1.tokenId, seller)
                expect(listing.quantity).to.be.equal(createdListing.quantity);
                expect(listing.pricePerItem).to.be.equal(createdListing.pricePerItem);
                expect(listing.expirationTime).to.be.equal(createdListing.expirationTime);
            }))
            await marketplace.pause();
            await expect(marketplace.connect(sellerSigner).createOrUpdateListings(
                [ListingsToUpdate.INCREASE_PRICE]
            )).to.be.revertedWith("Pausable: paused");

            await marketplace.unpause();
            // Can increase price
            await marketplace.connect(sellerSigner).createOrUpdateListings([
                ListingsToUpdate.INCREASE_PRICE
            ]);

            let listing = await marketplace.listings(nft.address, ListingsToUpdate.INCREASE_PRICE.tokenId, seller)
            expect(listing.pricePerItem).to.be.equal(listing.pricePerItem);

            await expect(marketplace.connect(sellerSigner).createOrUpdateListings(
               [
                    ListingsToUpdate.INCREASE_PRICE,
                    ListingsToUpdate.INVALID_MIN_PRICE
               ]
            )).to.be.revertedWith("TreasureMarketplace: below min price");

            await expect(marketplace.connect(sellerSigner).createOrUpdateListings(
                [
                    ListingsToUpdate.INCREASE_PRICE,
                    ListingsToUpdate.INVALID_QUANTITY
               ]
            )).to.be.revertedWith("cannot list multiple ERC721");

            // Can create an update in the same transaction
            await marketplace.connect(sellerSigner).createOrUpdateListings(
                [
                    ListingsToCreate.VALID_4,
                    ListingsToUpdate.CHANGE_EXPIRATION
                ]
            )
            await marketplace.connect(sellerSigner).createOrUpdateListings(
                [
                    ListingsToUpdate.CHANGE_EXPIRATION_2,
                    ListingsToUpdate.CHANGE_EXPIRATION_3
                ]
            )
            await Promise.all([
                    ListingsToCreate.VALID_4,
                    ListingsToUpdate.CHANGE_EXPIRATION,
                    ListingsToUpdate.CHANGE_EXPIRATION_2,
                    ListingsToUpdate.CHANGE_EXPIRATION_3
                ].map(async (expectedListing) => {
                    const listing = await marketplace.listings(nft.address, expectedListing.tokenId, seller)
                    expect(listing.quantity).to.be.equal(expectedListing.quantity);
                    expect(listing.pricePerItem).to.be.equal(expectedListing.pricePerItem);
                    expect(listing.expirationTime).to.be.equal(expectedListing.expirationTime);
                }))

        });

        describe('with NFT minted', function () {
            beforeEach(async function () {
                await nft.mint(seller);
            });

            it('createListing()', async function () {
                const tokenId = 0;
                const pricePerItem = ethers.parseUnits('1', 'ether');
                const expirationTime = 4102462800; // Midnight Jan 1, 2100
                expect(await nft.ownerOf(tokenId)).to.be.equal(seller);

                await nft.connect(sellerSigner).setApprovalForAll(marketplace.address, true);

                await expect(marketplace.connect(sellerSigner).createListing(
                    nft.address,
                    tokenId,
                    1,
                    pricePerItem,
                    expirationTime,
                    magicToken.address
                )).to.be.revertedWith("token is not approved for trading")

                await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_ERC_721_APPROVED, magicToken.address);

                await expect(marketplace.connect(sellerSigner).createListing(
                    nft.address,
                    tokenId,
                    1,
                    0,
                    expirationTime,
                    magicToken.address
                )).to.be.revertedWith("TreasureMarketplace: below min price")

                await expect(marketplace.connect(sellerSigner).createListing(
                    nft.address,
                    tokenId,
                    0,
                    pricePerItem,
                    expirationTime,
                    magicToken.address
                )).to.be.revertedWith("cannot list multiple ERC721")

                await expect(marketplace.connect(buyerSigner).createListing(
                    nft.address,
                    tokenId,
                    1,
                    pricePerItem,
                    expirationTime,
                    magicToken.address
                )).to.be.revertedWith("not owning item")

                await marketplace.pause();

                await expect(marketplace.connect(sellerSigner).createListing(
                    nft.address,
                    tokenId,
                    1,
                    pricePerItem,
                    expirationTime,
                    magicToken.address
                )).to.be.revertedWith("Pausable: paused");

                await marketplace.unpause();

                await expect(marketplace.connect(sellerSigner).createListing(
                    nft.address,
                    tokenId,
                    1,
                    999999999n,
                    expirationTime,
                    magicToken.address
                )).to.be.revertedWith("TreasureMarketplace: below min price");

                await expect(marketplace.connect(sellerSigner).createListing(
                    nft.address,
                    tokenId,
                    1,
                    pricePerItem,
                    expirationTime,
                    weth.address
                )).to.be.revertedWith("TreasureMarketplace: Wrong payment token");

                await marketplace.connect(sellerSigner).createListing(
                    nft.address,
                    tokenId,
                    1,
                    pricePerItem,
                    expirationTime,
                    magicToken.address
                );

                const listing = await marketplace.listings(nft.address, tokenId, seller);
                expect(listing.quantity).to.be.equal(1);
                expect(listing.pricePerItem).to.be.equal(pricePerItem);
                expect(listing.expirationTime).to.be.equal(expirationTime);
            });


            describe('with listing', function () {
                const tokenId = 0;
                const pricePerItem = ethers.parseUnits('1', 'ether');
                const expirationTime = 4102462800; // Midnight Jan 1, 2100

                beforeEach(async function () {
                    expect(await nft.ownerOf(tokenId)).to.be.equal(seller);

                    await nft.connect(sellerSigner).setApprovalForAll(marketplace.address, true);
                    await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_ERC_721_APPROVED, magicToken.address);
                    await marketplace.connect(sellerSigner).createListing(
                        nft.address,
                        tokenId,
                        1,
                        pricePerItem,
                        expirationTime,
                        magicToken.address
                    );
                });

                it('updateListing()', async function () {
                    const newPricePerItem = pricePerItem / 2n;
                    const newExpirationTime = (await getCurrentTime()) + 500;

                    await marketplace.pause();

                    await expect(marketplace.connect(sellerSigner).updateListing(
                        nft.address,
                        tokenId,
                        1,
                        newPricePerItem,
                        newExpirationTime,
                        magicToken.address
                    )).to.be.revertedWith("Pausable: paused");

                    await marketplace.unpause();

                    // Can increase price
                    await marketplace.connect(sellerSigner).updateListing(
                        nft.address,
                        tokenId,
                        1,
                        pricePerItem + 1n,
                        newExpirationTime,
                        magicToken.address
                    );

                    await marketplace.connect(sellerSigner).updateListing(
                        nft.address,
                        tokenId,
                        1,
                        newPricePerItem,
                        newExpirationTime,
                        magicToken.address
                    );

                    await expect(marketplace.connect(sellerSigner).updateListing(
                        nft.address,
                        tokenId,
                        1,
                        0,
                        newExpirationTime,
                        magicToken.address
                    )).to.be.revertedWith("TreasureMarketplace: below min price");

                    await expect(marketplace.connect(sellerSigner).updateListing(
                        nft.address,
                        tokenId,
                        0,
                        newPricePerItem,
                        newExpirationTime,
                        magicToken.address
                    )).to.be.revertedWith("cannot list multiple ERC721");

                    const listing = await marketplace.listings(nft.address, tokenId, seller);
                    expect(listing.quantity).to.be.equal(1);
                    expect(listing.pricePerItem).to.be.equal(newPricePerItem);
                    expect(listing.expirationTime).to.be.equal(newExpirationTime);
                });

                it('cancelListing()', async function () {
                    // Can cancel even if not listed
                    marketplace.connect(buyerSigner).cancelListing(nft.address, tokenId);

                    await marketplace.connect(sellerSigner).cancelListing(nft.address, tokenId);

                    const listing = await marketplace.listings(nft.address, tokenId, seller);
                    expect(listing.quantity).to.be.equal(0);
                    expect(listing.pricePerItem).to.be.equal(0);
                    expect(listing.expirationTime).to.be.equal(0);
                });

                it('buyItem()', async function () {
                    expect(await nft.ownerOf(tokenId)).to.be.equal(seller);
                    await magicToken.mint(buyer, pricePerItem);
                    await magicToken.connect(buyerSigner).approve(marketplace.address, pricePerItem);
                    expect(await magicToken.balanceOf(marketplace.address)).to.be.equal(0);
                    expect(await magicToken.balanceOf(seller)).to.be.equal(0);

                    await expect(marketplace.connect(buyerSigner).buyItems(
                        [[nft.address,
                            tokenId,
                            seller,
                            0,
                            pricePerItem,
                        magicToken.address,
                        false]]
                    )).to.be.revertedWith("Nothing to buy");

                    await expect(marketplace.connect(buyerSigner).buyItems(
                        [[nft.address,
                            tokenId,
                            seller,
                            2,
                            pricePerItem,
                        magicToken.address,
                        false]]
                    )).to.be.revertedWith("not enough quantity");

                    await expect(marketplace.connect(buyerSigner).buyItems(
                        [[nft.address,
                            tokenId,
                            seller,
                            1,
                        pricePerItem - 1n,
                        magicToken.address,
                        false]]
                    )).to.be.revertedWith("price increased");

                    await expect(marketplace.connect(sellerSigner).buyItems(
                        [[nft.address,
                            tokenId,
                            seller,
                            1,
                            pricePerItem,
                        magicToken.address,
                        false]]
                    )).to.be.revertedWith("Cannot buy your own item");

                    await marketplace.pause();

                    await expect(marketplace.connect(buyerSigner).buyItems(
                        [[nft.address,
                            tokenId,
                            seller,
                            1,
                            pricePerItem,
                        magicToken.address,
                        false]]
                    )).to.be.revertedWith("Pausable: paused");

                    await marketplace.unpause();

                    await expect(marketplace.connect(buyerSigner).buyItems(
                        [[nft.address,
                            tokenId,
                            seller,
                            1,
                            pricePerItem,
                        weth.address,
                        false]]
                    )).to.be.revertedWith("TreasureMarketplace: Wrong payment token");

                    await marketplace.connect(buyerSigner).buyItems(
                        [[nft.address,
                            tokenId,
                            seller,
                            1,
                            pricePerItem,
                        magicToken.address,
                        false]]
                    )

                    expect(await magicToken.balanceOf(await marketplace.feeReceipient())).to.be.equal(pricePerItem / 100n);
                    expect(await magicToken.balanceOf(seller)).to.be.equal(pricePerItem * 99n / 100n);

                    expect(await nft.ownerOf(tokenId)).to.be.equal(buyer);
                    const listing = await marketplace.listings(nft.address, tokenId, seller);
                    expect(listing.quantity).to.be.equal(0);
                    expect(listing.pricePerItem).to.be.equal(0);
                    expect(listing.expirationTime).to.be.equal(0);
                });

                it('buyItem() with collection owner fee', async function () {
                    await magicToken.mint(buyer, pricePerItem);
                    await magicToken.connect(buyerSigner).approve(marketplace.address, pricePerItem);

                    // When no collection owner, 5% fee. With collection owner, 2.5% fee to protocol.
                    await (await marketplace.setFee(500, 250)).wait();

                    // Admin owns this collection. 5% fee for collection.
                    const collectionOwnerFee = {
                        "recipient": admin,
                        "fee": 500
                    };

                    await (await marketplace.setCollectionOwnerFee(nft.address, collectionOwnerFee)).wait();

                    await (await marketplace.connect(buyerSigner).buyItems(
                        [[nft.address,
                            tokenId,
                            seller,
                            1,
                            pricePerItem,
                        magicToken.address,
                        false]]
                    )).wait();

                    expect(await magicToken.balanceOf(await marketplace.feeReceipient()))
                        .to.be.equal(pricePerItem * 25n / 1000n);
                    // Owner of collection.
                    expect(await magicToken.balanceOf(admin))
                        .to.be.equal(pricePerItem * 50n / 1000n);
                    expect(await magicToken.balanceOf(seller))
                        .to.be.equal(pricePerItem * 925n / 1000n);
                });

                it('buyItem() with quantity 0', async function () {
                    expect(await nft.ownerOf(tokenId)).to.be.equal(seller);
                    await magicToken.mint(buyer, pricePerItem);
                    await magicToken.connect(buyerSigner).approve(marketplace.address, pricePerItem);
                    expect(await magicToken.balanceOf(marketplace.address)).to.be.equal(0);
                    expect(await magicToken.balanceOf(seller)).to.be.equal(0);

                    await expect(marketplace.connect(buyerSigner).buyItems(
                        [[nft.address,
                            tokenId,
                            seller,
                            0,
                            pricePerItem,
                        magicToken.address,
                        false]]
                    )).to.be.revertedWith("Nothing to buy");
                });

                describe('token approval revoked', function () {
                    beforeEach(async function () {
                        await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_NOT_APPROVED, magicToken.address);
                    });

                    it('buyItem()', async function () {
                        expect(await nft.ownerOf(tokenId)).to.be.equal(seller);
                        await magicToken.mint(buyer, pricePerItem);
                        await magicToken.connect(buyerSigner).approve(marketplace.address, pricePerItem);
                        expect(await magicToken.balanceOf(marketplace.address)).to.be.equal(0);
                        expect(await magicToken.balanceOf(seller)).to.be.equal(0);

                        await expect(marketplace.connect(buyerSigner).buyItems(
                            [[nft.address,
                                tokenId,
                                seller,
                                1,
                                pricePerItem,
                            magicToken.address,
                            false]]
                        )).to.be.revertedWith("token is not approved for trading");
                    });
                });
            })
        })
    })

    describe('ERC1155', function () {
        it('createOrUpdateListings()', async function () {
            const pricePerItem = ethers.parseUnits('1', 'ether');
            const expirationTime = 4102462800; // Midnight Jan 1, 2100
            const quantity = 10;
            const ListingsToCreate = {
                INVALID_MIN_PRICE: {
                    tokenId: 0,
                    nftAddress: erc1155.address,
                    quantity: 5,
                    pricePerItem: 0,
                    expirationTime,
                    paymentToken: magicToken.address
                },
                INVALID_OVERFLOW_PRICE: {
                    tokenId: 0,
                    nftAddress: erc1155.address,
                    quantity: 5,
                    pricePerItem: 999999999n,
                    expirationTime,
                    paymentToken: magicToken.address
                },
                INVALID_MIN_QUANTITY: {
                    tokenId: 0,
                    nftAddress: erc1155.address,
                    quantity: 0,
                    pricePerItem,
                    expirationTime,
                    paymentToken: magicToken.address
                },
                INVALID_OVERFLOW_QUANTITY: {
                    tokenId: 0,
                    nftAddress: erc1155.address,
                    quantity: quantity + 1,
                    pricePerItem,
                    expirationTime,
                    paymentToken: magicToken.address
                },
                INVALID_PAYMENT_TOKEN: {
                    tokenId: 0,
                    nftAddress: erc1155.address,
                    quantity: 5,
                    pricePerItem,
                    expirationTime,
                    paymentToken: weth.address
                },
                INVALID_EXPIRATION: {
                    tokenId: 1,
                    nftAddress: erc1155.address,
                    quantity: 5,
                    pricePerItem,
                    expirationTime: (await getCurrentTime()) - 1,
                    paymentToken: magicToken.address,
                },
                VALID_1: {
                    tokenId: 2,
                    nftAddress: erc1155.address,
                    quantity: 5,
                    pricePerItem,
                    expirationTime,
                    paymentToken: magicToken.address
                },
                VALID_2: {
                    tokenId: 3,
                    nftAddress: erc1155.address,
                    quantity: 5,
                    pricePerItem,
                    expirationTime,
                    paymentToken: magicToken.address
                },
                VALID_3: {
                    tokenId: 4,
                    nftAddress: erc1155.address,
                    quantity: 2,
                    pricePerItem,
                    expirationTime,
                    paymentToken: magicToken.address
                },
                VALID_4: {
                    tokenId: 5,
                    nftAddress: erc1155.address,
                    quantity: 5,
                    pricePerItem,
                    expirationTime,
                    paymentToken: magicToken.address
                },
            }
            const ListingsToUpdate = {
                INCREASE_PRICE: {
                    ...ListingsToCreate.VALID_1,
                    pricePerItem: ListingsToCreate.VALID_1.pricePerItem + 100n,
                },
                CHANGE_EXPIRATION: {
                    ...ListingsToCreate.VALID_1,
                    expirationTime: ListingsToCreate.VALID_1.expirationTime + 100,
                },
                CHANGE_EXPIRATION_2: {
                    ...ListingsToCreate.VALID_2,
                    expirationTime: ListingsToCreate.VALID_2.expirationTime + 100,
                },
                INCREASE_QUANTITY: {
                    ...ListingsToCreate.VALID_3,
                    quantity: ListingsToCreate.VALID_3.quantity + 1,
                },
                INVALID_MIN_PRICE: {
                    ...ListingsToCreate.VALID_1,
                    pricePerItem: 0,
                },
                INVALID_MIN_QUANTITY: {
                    ...ListingsToCreate.VALID_1,
                    quantity: 0,
                },
                INVALID_OVERFLOW_QUANTITY: {
                    ...ListingsToCreate.VALID_1,
                    quantity: quantity + 1,
                }
            }
            await erc1155.functions['mint(address,uint256,uint256)'](seller, 0, quantity);
            await erc1155.functions['mint(address,uint256,uint256)'](seller, 1, quantity);
            await erc1155.functions['mint(address,uint256,uint256)'](seller, 2, quantity);
            await erc1155.functions['mint(address,uint256,uint256)'](seller, 3, quantity);
            await erc1155.functions['mint(address,uint256,uint256)'](seller, 4, quantity);
            await erc1155.functions['mint(address,uint256,uint256)'](seller, 5, quantity);
            await erc1155.connect(sellerSigner).setApprovalForAll(marketplace.address, true);
            await expect(marketplace.connect(sellerSigner).createOrUpdateListings([ListingsToCreate.VALID_1])).to.be.revertedWith("token is not approved for trading");
            await marketplace.setTokenApprovalStatus(erc1155.address, TOKEN_APPROVAL_STATUS_ERC_1155_APPROVED, magicToken.address);
            await expect(marketplace.connect(sellerSigner).createOrUpdateListings([ListingsToCreate.VALID_1, ListingsToCreate.INVALID_MIN_PRICE])).to.be.revertedWith("TreasureMarketplace: below min price")
            await expect(marketplace.connect(sellerSigner).createOrUpdateListings([ListingsToCreate.VALID_1, ListingsToCreate.INVALID_EXPIRATION])).to.be.revertedWith("TreasureMarketplace: invalid expiration time")
            await expect(marketplace.connect(sellerSigner).createOrUpdateListings([ListingsToCreate.VALID_1, ListingsToCreate.INVALID_MIN_QUANTITY])).to.be.revertedWith("TreasureMarketplace: nothing to list")
            await expect(marketplace.connect(sellerSigner).createOrUpdateListings([ListingsToCreate.VALID_1, ListingsToCreate.INVALID_OVERFLOW_QUANTITY])).to.be.revertedWith("TreasureMarketplace: must hold enough nfts")
            await expect(marketplace.connect(buyerSigner).createOrUpdateListings([ListingsToCreate.VALID_1])).to.be.revertedWith("TreasureMarketplace: must hold enough nfts")
            await marketplace.pause();
            await expect(marketplace.connect(sellerSigner).createOrUpdateListings([ListingsToCreate.VALID_1])).to.be.revertedWith("Pausable: paused");
            await marketplace.unpause();
            await expect(marketplace.connect(sellerSigner).createOrUpdateListings([ListingsToCreate.VALID_1, ListingsToCreate.INVALID_OVERFLOW_PRICE])).to.be.revertedWith("TreasureMarketplace: below min price");
            await expect(marketplace.connect(sellerSigner).createOrUpdateListings([ListingsToCreate.VALID_1, ListingsToCreate.INVALID_PAYMENT_TOKEN])).to.be.revertedWith("TreasureMarketplace: Wrong payment token");
            await marketplace.connect(sellerSigner).createOrUpdateListings(
                [ListingsToCreate.VALID_1]
            );
            await marketplace.connect(sellerSigner).createOrUpdateListings(
                [ListingsToCreate.VALID_2, ListingsToCreate.VALID_3]
            );
            const createdListings = [ListingsToCreate.VALID_1, ListingsToCreate.VALID_2, ListingsToCreate.VALID_3]
            await Promise.all(createdListings.map(async (createdListing) => {
            const listing = await marketplace.listings(erc1155.address, createdListing.tokenId, seller)
                expect(listing.quantity).to.be.equal(createdListing.quantity);
                expect(listing.pricePerItem).to.be.equal(createdListing.pricePerItem);
                expect(listing.expirationTime).to.be.equal(createdListing.expirationTime);
            }))
            await marketplace.pause();
            await expect(marketplace.connect(sellerSigner).createOrUpdateListings(
                [ListingsToUpdate.INCREASE_PRICE]
            )).to.be.revertedWith("Pausable: paused");

            await marketplace.unpause();
            // Can increase price
            await marketplace.connect(sellerSigner).createOrUpdateListings([
                ListingsToUpdate.INCREASE_PRICE
            ]);

            let listing = await marketplace.listings(erc1155.address, ListingsToUpdate.INCREASE_PRICE.tokenId, seller)
            expect(listing.pricePerItem).to.be.equal(listing.pricePerItem);

            await expect(marketplace.connect(sellerSigner).createOrUpdateListings(
               [
                    ListingsToUpdate.INCREASE_PRICE,
                    ListingsToUpdate.INVALID_MIN_PRICE
               ]
            )).to.be.revertedWith("TreasureMarketplace: below min price");
            await expect(marketplace.connect(sellerSigner).createOrUpdateListings(
                [
                     ListingsToUpdate.INCREASE_PRICE,
                     ListingsToUpdate.INVALID_OVERFLOW_QUANTITY
                ]
             )).to.be.revertedWith("TreasureMarketplace: must hold enough nfts");
            await expect(marketplace.connect(sellerSigner).createOrUpdateListings(
                [
                    ListingsToUpdate.INCREASE_PRICE,
                    ListingsToUpdate.INVALID_MIN_QUANTITY
               ]
            )).to.be.revertedWith("TreasureMarketplace: nothing to list");

            // Can create an update in the same transaction
            await marketplace.connect(sellerSigner).createOrUpdateListings(
                [
                    ListingsToCreate.VALID_4,
                    ListingsToUpdate.CHANGE_EXPIRATION
                ]
            )
            await marketplace.connect(sellerSigner).createOrUpdateListings(
                [
                    ListingsToUpdate.CHANGE_EXPIRATION_2,
                    ListingsToUpdate.INCREASE_QUANTITY
                ]
            )
            await Promise.all([
                ListingsToCreate.VALID_4,
                ListingsToUpdate.CHANGE_EXPIRATION,
                ListingsToUpdate.CHANGE_EXPIRATION_2,
                ListingsToUpdate.INCREASE_QUANTITY
            ].map(async (expectedListing) => {
                const listing = await marketplace.listings(erc1155.address, expectedListing.tokenId, seller)
                expect(listing.quantity).to.be.equal(expectedListing.quantity);
                expect(listing.pricePerItem).to.be.equal(expectedListing.pricePerItem);
                expect(listing.expirationTime).to.be.equal(expectedListing.expirationTime);
            }))

        });
        describe('with NFT minted', function () {
            const tokenId = 0;
            const quantity = 10;
            const pricePerItem = ethers.parseUnits('1', 'ether');
            const expirationTime = 4102462800; // Midnight Jan 1, 2100

            beforeEach(async function () {
                await erc1155.functions['mint(address,uint256,uint256)'](seller, tokenId, quantity);
            });

            it('createListing()', async function () {
                expect(await erc1155.balanceOf(seller, tokenId)).to.be.equal(quantity);

                await erc1155.connect(sellerSigner).setApprovalForAll(marketplace.address, true);
                await marketplace.setTokenApprovalStatus(erc1155.address, TOKEN_APPROVAL_STATUS_ERC_1155_APPROVED, magicToken.address);
                await expect(marketplace.connect(sellerSigner).createListing(
                    erc1155.address,
                    tokenId,
                    quantity,
                    pricePerItem,
                    (await getCurrentTime()) - 1,
                    magicToken.address
                )).to.be.revertedWith("invalid expiration time");

                await expect(marketplace.connect(sellerSigner).createListing(
                    erc1155.address,
                    tokenId,
                    quantity,
                    0,
                    expirationTime,
                    magicToken.address
                )).to.be.revertedWith("TreasureMarketplace: below min price");

                await expect(marketplace.connect(sellerSigner).createListing(
                    erc1155.address,
                    tokenId,
                    0,
                    pricePerItem,
                    expirationTime,
                    magicToken.address
                )).to.be.revertedWith("nothing to list");


                await expect(marketplace.connect(buyerSigner).createListing(
                    erc1155.address,
                    tokenId,
                    1,
                    pricePerItem,
                    expirationTime,
                    magicToken.address
                )).to.be.revertedWith("must hold enough nfts");

                await marketplace.connect(sellerSigner).createListing(
                    erc1155.address,
                    tokenId,
                    quantity,
                    pricePerItem,
                    expirationTime,
                    magicToken.address
                );

                await expect(marketplace.connect(sellerSigner).createListing(
                    erc1155.address,
                    tokenId,
                    quantity,
                    pricePerItem,
                    expirationTime,
                    magicToken.address
                )).to.be.revertedWith("already listed");

                const listing = await marketplace.listings(erc1155.address, tokenId, seller);
                expect(listing.quantity).to.be.equal(quantity);
                expect(listing.pricePerItem).to.be.equal(pricePerItem);
                expect(listing.expirationTime).to.be.equal(expirationTime);
            });

            describe('expirationTime', function () {
                let timedelta = 100;
                let expirationTime: any;
                beforeEach(async function () {
                    expirationTime = await getCurrentTime() + timedelta;

                    expect(await erc1155.balanceOf(seller, tokenId)).to.be.equal(quantity);
                    await marketplace.setTokenApprovalStatus(erc1155.address, TOKEN_APPROVAL_STATUS_ERC_1155_APPROVED, magicToken.address);

                    await erc1155.connect(sellerSigner).setApprovalForAll(marketplace.address, true);
                    await marketplace.connect(sellerSigner).createListing(
                        erc1155.address,
                        tokenId,
                        quantity,
                        pricePerItem,
                        expirationTime,
                        magicToken.address
                    );
                });

                it('success', async function () {
                    expect(await erc1155.balanceOf(seller, tokenId)).to.be.equal(quantity);
                    await magicToken.mint(buyer, pricePerItem * BigInt(quantity));
                    await magicToken.connect(buyerSigner).approve(marketplace.address, pricePerItem * BigInt(quantity));
                    expect(await magicToken.balanceOf(marketplace.address)).to.be.equal(0);
                    expect(await magicToken.balanceOf(seller)).to.be.equal(0);

                    await marketplace.connect(buyerSigner).buyItems(
                        [[erc1155.address,
                            tokenId,
                            seller,
                            quantity,
                            pricePerItem,
                        magicToken.address,
                        false]]
                    )

                    expect(await magicToken.balanceOf(await marketplace.feeReceipient())).to.be.equal(pricePerItem * BigInt(quantity) / 100n);
                    expect(await magicToken.balanceOf(seller)).to.be.equal(pricePerItem * BigInt(quantity) * 99n / 100n);

                    expect(await erc1155.balanceOf(buyer, tokenId)).to.be.equal(quantity);
                    expect(await erc1155.balanceOf(seller, tokenId)).to.be.equal(0);
                    const listing = await marketplace.listings(erc1155.address, tokenId, seller);
                    expect(listing.quantity).to.be.equal(0);
                    expect(listing.pricePerItem).to.be.equal(0);
                    expect(listing.expirationTime).to.be.equal(0);
                })

                it('expired', async function () {
                    await mineBlock(expirationTime + 100);

                    expect(await erc1155.balanceOf(seller, tokenId)).to.be.equal(quantity);
                    await magicToken.mint(buyer, pricePerItem * BigInt(quantity));
                    await magicToken.connect(buyerSigner).approve(marketplace.address, pricePerItem * BigInt(quantity));
                    expect(await magicToken.balanceOf(marketplace.address)).to.be.equal(0);
                    expect(await magicToken.balanceOf(seller)).to.be.equal(0);

                    await expect(marketplace.connect(buyerSigner).buyItems(
                        [[erc1155.address,
                            tokenId,
                            seller,
                            quantity,
                            pricePerItem,
                        magicToken.address,
                        false]]
                    )).to.be.revertedWith("listing expired");

                    expect(await magicToken.balanceOf(buyer)).to.be.equal(pricePerItem * BigInt(quantity));
                    expect(await erc1155.balanceOf(seller, tokenId)).to.be.equal(quantity);

                    const listing = await marketplace.listings(erc1155.address, tokenId, seller);
                    expect(listing.quantity).to.be.equal(quantity);
                    expect(listing.pricePerItem).to.be.equal(pricePerItem);
                    expect(listing.expirationTime).to.be.equal(expirationTime);
                })
            })

            describe('with listing', function () {
                beforeEach(async function () {
                    expect(await erc1155.balanceOf(seller, tokenId)).to.be.equal(quantity);

                    await erc1155.connect(sellerSigner).setApprovalForAll(marketplace.address, true);
                    await marketplace.setTokenApprovalStatus(erc1155.address, TOKEN_APPROVAL_STATUS_ERC_1155_APPROVED, magicToken.address);
                    await marketplace.connect(sellerSigner).createListing(
                        erc1155.address,
                        tokenId,
                        quantity,
                        pricePerItem,
                        expirationTime,
                        magicToken.address
                    );
                });

                it('updateListing()', async function () {
                    const newPricePerItem = pricePerItem / 2n;
                    const newQuantity = 5;
                    const newExpirationTime = (await getCurrentTime()) + 500;

                    await expect(marketplace.connect(sellerSigner).updateListing(
                        erc1155.address,
                        2,
                        quantity,
                        pricePerItem,
                        expirationTime,
                        magicToken.address
                    )).to.be.revertedWith("not listed item");

                    await expect(marketplace.connect(buyerSigner).updateListing(
                        erc1155.address,
                        tokenId,
                        quantity,
                        pricePerItem,
                        expirationTime,
                        magicToken.address
                    )).to.be.revertedWith("not listed item");

                    await expect(marketplace.connect(sellerSigner).updateListing(
                        erc1155.address,
                        tokenId,
                        0,
                        newPricePerItem,
                        newExpirationTime,
                        magicToken.address
                    )).to.be.revertedWith("nothing to list");

                    await expect(marketplace.connect(sellerSigner).updateListing(
                        erc1155.address,
                        tokenId,
                        newQuantity,
                        0,
                        newExpirationTime,
                        magicToken.address
                    )).to.be.revertedWith("TreasureMarketplace: below min price");

                    // Can increase price
                    marketplace.connect(sellerSigner).updateListing(
                        erc1155.address,
                        tokenId,
                        newQuantity,
                        pricePerItem + 1n,
                        newExpirationTime,
                        magicToken.address
                    );

                    await marketplace.connect(sellerSigner).updateListing(
                        erc1155.address,
                        tokenId,
                        newQuantity,
                        newPricePerItem,
                        newExpirationTime,
                        magicToken.address
                    );

                    const listing = await marketplace.listings(erc1155.address, tokenId, seller);
                    expect(listing.quantity).to.be.equal(newQuantity);
                    expect(listing.pricePerItem).to.be.equal(newPricePerItem);
                    expect(listing.expirationTime).to.be.equal(newExpirationTime);
                });

                it('cancelListing()', async function () {
                    // Can cancel if not listed
                    marketplace.connect(buyerSigner).cancelListing(erc1155.address, tokenId);

                    // Can cancel if not listed
                    marketplace.connect(buyerSigner).cancelListing(erc1155.address, tokenId);

                    await marketplace.connect(sellerSigner).cancelListing(erc1155.address, tokenId);

                    // Can cancel if not listed
                    marketplace.connect(sellerSigner).cancelListing(erc1155.address, tokenId);

                    const listing = await marketplace.listings(erc1155.address, tokenId, seller);
                    expect(listing.quantity).to.be.equal(0);
                    expect(listing.pricePerItem).to.be.equal(0);
                    expect(listing.expirationTime).to.be.equal(0);
                });

                describe('buyItem()', function () {
                    it('all', async function () {
                        expect(await erc1155.balanceOf(seller, tokenId)).to.be.equal(quantity);
                        await magicToken.mint(buyer, pricePerItem * BigInt(quantity));
                        await magicToken.connect(buyerSigner).approve(marketplace.address, pricePerItem * BigInt(quantity));
                        expect(await magicToken.balanceOf(marketplace.address)).to.be.equal(0);
                        expect(await magicToken.balanceOf(seller)).to.be.equal(0);

                        await expect(marketplace.connect(buyerSigner).buyItems(
                            [[erc1155.address,
                                2,
                                seller,
                                quantity,
                                pricePerItem,
                            magicToken.address,
                            false]]
                        )).to.be.revertedWith("not listed item");

                        await erc1155.connect(sellerSigner).safeTransferFrom(seller, staker3, tokenId, 1, "0x");

                        await expect(marketplace.connect(buyerSigner).buyItems(
                            [[erc1155.address,
                                tokenId,
                                seller,
                                quantity,
                                pricePerItem,
                            magicToken.address,
                            false]]
                        )).to.be.reverted;

                        await erc1155.connect(staker3Signer).safeTransferFrom(staker3, seller, tokenId, 1, "0x");

                        await expect(marketplace.connect(buyerSigner).buyItems(
                            [[erc1155.address,
                                tokenId,
                                seller,
                                0,
                                pricePerItem,
                            magicToken.address,
                            false]]
                        )).to.be.revertedWith("Nothing to buy")

                        await marketplace.connect(buyerSigner).buyItems(
                            [[erc1155.address,
                                tokenId,
                                seller,
                                quantity,
                                pricePerItem,
                            magicToken.address,
                            false]]
                        )

                        expect(await magicToken.balanceOf(await marketplace.feeReceipient())).to.be.equal(pricePerItem * BigInt(quantity) / 100n);
                        expect(await magicToken.balanceOf(seller)).to.be.equal(pricePerItem * BigInt(quantity) * 99n / 100n);

                        expect(await erc1155.balanceOf(buyer, tokenId)).to.be.equal(quantity);
                        expect(await erc1155.balanceOf(seller, tokenId)).to.be.equal(0);
                        const listing = await marketplace.listings(erc1155.address, tokenId, seller);
                        expect(listing.quantity).to.be.equal(0);
                        expect(listing.pricePerItem).to.be.equal(0);
                        expect(listing.expirationTime).to.be.equal(0);
                    });

                    it('partial', async function () {
                        const buyQuantity = 5;

                        expect(await erc1155.balanceOf(seller, tokenId)).to.be.equal(quantity);
                        await magicToken.mint(buyer, pricePerItem * BigInt(buyQuantity));
                        await magicToken.connect(buyerSigner).approve(marketplace.address, pricePerItem * BigInt(buyQuantity));
                        expect(await magicToken.balanceOf(marketplace.address)).to.be.equal(0);
                        expect(await magicToken.balanceOf(seller)).to.be.equal(0);

                        await marketplace.connect(buyerSigner).buyItems(
                            [[erc1155.address,
                                tokenId,
                                seller,
                                buyQuantity,
                                pricePerItem,
                            magicToken.address,
                            false]]
                        )

                        expect(await magicToken.balanceOf(await marketplace.feeReceipient())).to.be.equal(pricePerItem * BigInt(buyQuantity) / 100n);
                        expect(await magicToken.balanceOf(seller)).to.be.equal(pricePerItem * BigInt(buyQuantity) * 99n / 100n);

                        expect(await erc1155.balanceOf(buyer, tokenId)).to.be.equal(buyQuantity);
                        expect(await erc1155.balanceOf(seller, tokenId)).to.be.equal(quantity - buyQuantity);

                        const listing = await marketplace.listings(erc1155.address, tokenId, seller);
                        expect(listing.quantity).to.be.equal(quantity - buyQuantity);
                        expect(listing.pricePerItem).to.be.equal(pricePerItem);
                        expect(listing.expirationTime).to.be.equal(expirationTime);
                    });
                })
            })
        })
    })

    it('Should be able to list/buy in weth', async function () {
        await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_ERC_721_APPROVED, weth.address);

        await(await nft.connect(sellerSigner).setApprovalForAll(marketplace.address, true)).wait();
        await(await nft.mint(seller)).wait();
        let tokenId = 0;

        let pricePerItem = ethers.parseEther("1");

        await expect(marketplace
            .connect(sellerSigner)
            .createListing(
                nft.address,
                tokenId,
                1,
                pricePerItem,
                1000000000000,
                magicToken.address)
            ).to.be.revertedWith("TreasureMarketplace: Wrong payment token");

        await(await marketplace
            .connect(sellerSigner)
            .createListing(
                nft.address,
                tokenId,
                1,
                pricePerItem,
                1000000000000,
                weth.address)
            ).wait();

        const listing = await marketplace.listings(nft.address, tokenId, seller);
        expect(listing.paymentTokenAddress)
            .to.equal(weth.address);

        await(await weth.connect(buyerSigner).approve(marketplace.address, pricePerItem)).wait();

        await(await weth
            .connect(buyerSigner)
            .deposit({value: pricePerItem})
            ).wait();

        expect(await weth.balanceOf(buyer))
            .to.eq(pricePerItem);

        await(await marketplace
            .connect(buyerSigner)
            .buyItems(
                [[
                    nft.address,
                    tokenId,
                    seller,
                    1,
                    pricePerItem,
                    weth.address,
                    false
                ]]
            )).wait();

        expect(await nft.ownerOf(tokenId))
            .to.equal(buyer);
        // 1% fees are transferred
        expect(await weth.balanceOf(seller))
            .to.eq(pricePerItem - ethers.parseEther("0.01"));
    });

    it('Should be able to buy in ETH for listings in weth', async function () {
        await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_ERC_721_APPROVED, weth.address);

        await(await nft.connect(sellerSigner).setApprovalForAll(marketplace.address, true)).wait();
        await(await nft.mint(seller)).wait();
        let tokenId = 0;

        let pricePerItem = ethers.parseEther("1");

        await(await marketplace
            .connect(sellerSigner)
            .createListing(
                nft.address,
                tokenId,
                1,
                pricePerItem,
                1000000000000,
                weth.address)
            ).wait();

        const listing = await marketplace.listings(nft.address, tokenId, seller);
        expect(listing.paymentTokenAddress)
            .to.equal(weth.address);

        await expect(marketplace
            .connect(buyerSigner)
            .buyItems(
                [[
                    nft.address,
                    tokenId,
                    seller,
                    1,
                    pricePerItem,
                    weth.address,
                    true
                ]]
            )).to.be.revertedWith("TreasureMarketplace: Sending eth was not successful")

        await expect(marketplace
            .connect(buyerSigner)
            .buyItems(
                [[
                    nft.address,
                    tokenId,
                    seller,
                    1,
                    pricePerItem,
                    weth.address,
                    true
                ]]
                , { value: pricePerItem + 1n }
            )).to.be.revertedWith("TreasureMarketplace: Bad ETH value")

        // Contract doesn't have enough eth to process
        await expect(marketplace
            .connect(buyerSigner)
            .buyItems(
                [[
                    nft.address,
                    tokenId,
                    seller,
                    1,
                    pricePerItem,
                    weth.address,
                    true
                ]]
                , { value: pricePerItem - 1n }
            )).to.be.revertedWith("TreasureMarketplace: Sending eth was not successful")

        await expect(await marketplace
            .connect(buyerSigner)
            .buyItems(
                [[
                    nft.address,
                    tokenId,
                    seller,
                    1,
                    pricePerItem,
                    weth.address,
                    true
                ]]
                , { value: pricePerItem }
            )).to.changeEtherBalances([buyerSigner, sellerSigner], [pricePerItem * -1n, pricePerItem - ethers.parseEther("0.01")]);

        expect(await nft.ownerOf(tokenId))
            .to.equal(buyer);
    });

    it('Should be able to create a valid 721/1155 token bid', async function () {

        let tokenId = 0;

        let pricePerItem = ethers.parseEther("1");

        await expect(marketplace
            .connect(buyerSigner)
            .createOrUpdateTokenBid(
                nft.address,
                tokenId,
                1,
                pricePerItem,
                1000000000000,
                magicToken.address)
            ).to.be.revertedWith("TreasureMarketplace: token is not approved for trading");

        await(await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_ERC_721_APPROVED, magicToken.address)).wait();
        await(await marketplace.setTokenApprovalStatus(erc1155.address, TOKEN_APPROVAL_STATUS_ERC_1155_APPROVED, magicToken.address)).wait();

        await(await nft.connect(sellerSigner).setApprovalForAll(marketplace.address, true)).wait();
        await(await nft.mint(seller)).wait();

        await expect(marketplace
            .connect(buyerSigner)
            .createOrUpdateTokenBid(
                nft.address,
                tokenId,
                2,
                pricePerItem,
                1000000000000,
                magicToken.address)
            ).to.be.revertedWith("TreasureMarketplace: token bid quantity 1 for ERC721");

        await expect(marketplace
            .connect(buyerSigner)
            .createOrUpdateTokenBid(
                nft.address,
                tokenId,
                0,
                pricePerItem,
                1000000000000,
                magicToken.address)
            ).to.be.revertedWith("TreasureMarketplace: token bid quantity 1 for ERC721");

        await expect(marketplace
            .connect(buyerSigner)
            .createOrUpdateTokenBid(
                nft.address,
                tokenId,
                1,
                pricePerItem,
                1,
                magicToken.address)
            ).to.be.revertedWith("TreasureMarketplace: invalid expiration time");

        await expect(marketplace
            .connect(buyerSigner)
            .createOrUpdateTokenBid(
                nft.address,
                tokenId,
                1,
                1,
                1000000000000,
                magicToken.address)
            ).to.be.revertedWith("TreasureMarketplace: below min price");

        await expect(marketplace
            .connect(buyerSigner)
            .createOrUpdateTokenBid(
                nft.address,
                tokenId,
                1,
                pricePerItem,
                1000000000000,
                weth.address)
            ).to.be.revertedWith("TreasureMarketplace: Bad payment token");

        await expect(marketplace
            .connect(buyerSigner)
            .createOrUpdateTokenBid(
                nft.address,
                tokenId,
                1,
                pricePerItem,
                1000000000000,
                magicToken.address)
            ).to.be.revertedWith("TreasureMarketplace: Not enough tokens owned or allowed for bid");

        await(await magicToken.mint(buyer, pricePerItem)).wait();

        // Hasn't approved enough so the same error will occur
        await expect(marketplace
            .connect(buyerSigner)
            .createOrUpdateTokenBid(
                nft.address,
                tokenId,
                1,
                pricePerItem,
                1000000000000,
                magicToken.address)
            ).to.be.revertedWith("TreasureMarketplace: Not enough tokens owned or allowed for bid");

        await(await magicToken
            .connect(buyerSigner)
            .approve(marketplace.address, pricePerItem))
            .wait();

        await(await marketplace
            .connect(buyerSigner)
            .createOrUpdateTokenBid(
                nft.address,
                tokenId,
                1,
                pricePerItem,
                1000000000000,
                magicToken.address)
            ).wait();

        await(await marketplace
            .connect(buyerSigner)
            .createOrUpdateTokenBid(
                erc1155.address,
                tokenId,
                1,
                pricePerItem,
                1000000000000,
                magicToken.address)
            ).wait();
    });

    it('Should be able to create a valid 721 collection bid', async function () {
        let pricePerItem = ethers.parseEther("1");

        await(await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_ERC_721_APPROVED, magicToken.address)).wait();
        await(await marketplace.setTokenApprovalStatus(erc1155.address, TOKEN_APPROVAL_STATUS_ERC_1155_APPROVED, magicToken.address)).wait();

        await expect(marketplace
            .connect(buyerSigner)
            .createOrUpdateCollectionBid(
                erc1155.address,
                1,
                pricePerItem,
                1000000000000,
                magicToken.address)
            ).to.be.revertedWith("TreasureMarketplace: No collection bids on 1155s");

        await expect(marketplace
            .connect(buyerSigner)
            .createOrUpdateCollectionBid(
                nft.address,
                0,
                pricePerItem,
                1000000000000,
                magicToken.address)
            ).to.be.revertedWith("TreasureMarketplace: Bad quantity");

        await(await magicToken.mint(buyer, pricePerItem * 2n)).wait();
        await(await magicToken
            .connect(buyerSigner)
            .approve(marketplace.address, pricePerItem))
            .wait();

        // 2 for an nft is allowed... however, must have enough $$ approved to cover both at the time
        // of bidding.
        await expect(marketplace
            .connect(buyerSigner)
            .createOrUpdateCollectionBid(
                nft.address,
                2,
                pricePerItem,
                1000000000000,
                magicToken.address)
            ).to.be.revertedWith("TreasureMarketplace: Not enough tokens owned or allowed for bid");

        await(await magicToken
            .connect(buyerSigner)
            .approve(marketplace.address, pricePerItem * 2n))
            .wait();

        await(await marketplace
            .connect(buyerSigner)
            .createOrUpdateCollectionBid(
                nft.address,
                2,
                pricePerItem,
                1000000000000,
                magicToken.address)
            ).wait();
    });

    it('Should be able to accept a collection level bid', async function () {
        let pricePerItem = ethers.parseEther("1");

        await(await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_ERC_721_APPROVED, magicToken.address)).wait();

        await(await magicToken.mint(buyer, pricePerItem * 3n)).wait();
        await(await magicToken
            .connect(buyerSigner)
            .approve(marketplace.address, pricePerItem * 3n))
            .wait();

        await(await marketplace
            .connect(buyerSigner)
            .createOrUpdateCollectionBid(
                nft.address,
                2,
                pricePerItem,
                1000000000000,
                magicToken.address)
            ).wait();

        await expect(marketplace
            .connect(buyerSigner)
            .acceptCollectionBid(
                [
                    nft.address,
                    0,
                    buyer,
                    1,
                    pricePerItem,
                    magicToken.address
                ]
            )).to.be.revertedWith("TreasureMarketplace: Cannot supply own bid");

        await expect(marketplace
            .connect(sellerSigner)
            .acceptCollectionBid(
                [
                    nft.address,
                    0,
                    buyer,
                    1,
                    pricePerItem - 1n,
                    magicToken.address
                ]
            )).to.be.revertedWith("TreasureMarketplace: price does not match");

        await expect(marketplace
            .connect(sellerSigner)
            .acceptCollectionBid(
                [
                    nft.address,
                    0,
                    buyer,
                    2,
                    pricePerItem,
                    magicToken.address
                ]
            )).to.be.revertedWith("TreasureMarketplace: Cannot supply multiple ERC721s");

        await expect(marketplace
            .connect(sellerSigner)
            .acceptCollectionBid(
                [
                    nft.address,
                    0,
                    buyer,
                    1,
                    pricePerItem,
                    weth.address
                ]
            )).to.be.revertedWith("TreasureMarketplace: Wrong payment token");

        // Doesn't own the token id
        await expect(marketplace
            .connect(sellerSigner)
            .acceptCollectionBid(
                [
                    nft.address,
                    0,
                    buyer,
                    1,
                    pricePerItem,
                    magicToken.address
                ]
            )).to.be.revertedWith("ERC721: operator query for nonexistent token");

        await(await nft.connect(sellerSigner).setApprovalForAll(marketplace.address, true)).wait();

        // Enough to supply 3 nfts to bid, but bidder only asked for two
        await(await nft.mint(seller)).wait();
        await(await nft.mint(seller)).wait();
        await(await nft.mint(seller)).wait();

        await(await marketplace
            .connect(sellerSigner)
            .acceptCollectionBid(
                [
                    nft.address,
                    0,
                    buyer,
                    1,
                    pricePerItem,
                    magicToken.address
                ]
            )).wait();

        await(await marketplace
            .connect(sellerSigner)
            .acceptCollectionBid(
                [
                    nft.address,
                    1,
                    buyer,
                    1,
                    pricePerItem,
                    magicToken.address
                ]
            )).wait();

        await expect(marketplace
            .connect(sellerSigner)
            .acceptCollectionBid(
                [
                    nft.address,
                    0,
                    buyer,
                    1,
                    pricePerItem,
                    magicToken.address
                ]
            )).to.be.revertedWith("TreasureMarketplace: bid does not exist");

        expect(await nft.ownerOf(0))
            .to.equal(buyer);
        expect(await nft.ownerOf(1))
            .to.equal(buyer);
        expect(await nft.ownerOf(2))
            .to.equal(seller);
        expect(await magicToken.balanceOf(buyer))
            .to.equal(pricePerItem);
        expect(await magicToken.balanceOf(seller))
            .to.equal(ethers.parseEther('1.98'));
    });

    it('Should be able to accept a token level bid', async function () {
        let pricePerItem = ethers.parseEther("1");

        await(await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_ERC_721_APPROVED, magicToken.address)).wait();
        await(await marketplace.setTokenApprovalStatus(erc1155.address, TOKEN_APPROVAL_STATUS_ERC_1155_APPROVED, magicToken.address)).wait();

        await(await magicToken.mint(buyer, pricePerItem * 3n)).wait();
        await(await magicToken
            .connect(buyerSigner)
            .approve(marketplace.address, pricePerItem * 3n))
            .wait();

        await(await marketplace
            .connect(buyerSigner)
            .createOrUpdateTokenBid(
                nft.address,
                0,
                1,
                pricePerItem,
                1000000000000,
                magicToken.address)
            ).wait();

        await(await marketplace
            .connect(buyerSigner)
            .createOrUpdateTokenBid(
                erc1155.address,
                0,
                2,
                pricePerItem,
                1000000000000,
                magicToken.address)
            ).wait();

        // Wrong token id. No bid found
        await expect(marketplace
            .connect(sellerSigner)
            .acceptCollectionBid(
                [
                    nft.address,
                    10,
                    buyer,
                    1,
                    pricePerItem - 1n,
                    magicToken.address
                ]
            )).to.be.revertedWith("TreasureMarketplace: bid does not exist");

        await(await nft.connect(sellerSigner).setApprovalForAll(marketplace.address, true)).wait();
        await(await erc1155.connect(sellerSigner).setApprovalForAll(marketplace.address, true)).wait();

        await(await nft.mint(seller)).wait();
        await(await erc1155.functions['mint(address,uint256,uint256)'](seller, 0, 2)).wait();

        await(await marketplace
            .connect(sellerSigner)
            .acceptTokenBid(
                [
                    nft.address,
                    0,
                    buyer,
                    1,
                    pricePerItem,
                    magicToken.address
                ]
            )).wait();

        await(await marketplace
            .connect(sellerSigner)
            .acceptTokenBid(
                [
                    erc1155.address,
                    0,
                    buyer,
                    2,
                    pricePerItem,
                    magicToken.address
                ]
            )).wait();

        expect(await nft.ownerOf(0))
            .to.equal(buyer);
        expect(await erc1155.balanceOf(buyer, 0))
            .to.equal(2);
        expect(await magicToken.balanceOf(buyer))
            .to.equal(0);
        expect(await magicToken.balanceOf(seller))
            .to.equal(ethers.parseEther('2.97'));
    });
});
