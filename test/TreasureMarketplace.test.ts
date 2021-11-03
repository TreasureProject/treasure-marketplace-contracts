import hre from 'hardhat';
import {expect} from 'chai';
import {getCurrentTime, mineBlock} from './utils';

const {ethers, deployments, getNamedAccounts} = hre;
const { deploy } = deployments;

describe('TreasureMarketplace', function () {
  let marketplace: any, treasuryOracle: any;
  let magicToken: any, nft: any, erc1155: any;
  let seller: any, buyer: any, staker3: any, feeRecipient: any, deployer: any;
  let sellerSigner: any, buyerSigner: any, staker3Signer: any, feeRecipientSigner: any, deployerSigner: any;

  before(async function () {
    const namedAccounts = await getNamedAccounts();
    seller = namedAccounts.staker1;
    buyer = namedAccounts.staker2;
    staker3 = namedAccounts.staker3;
    feeRecipient = namedAccounts.hacker;
    deployer = namedAccounts.deployer;

    sellerSigner = await ethers.provider.getSigner(seller);
    buyerSigner = await ethers.provider.getSigner(buyer);
    staker3Signer = await ethers.provider.getSigner(staker3);
    feeRecipientSigner = await ethers.provider.getSigner(feeRecipient);
    deployerSigner = await ethers.provider.getSigner(deployer);
  });

  beforeEach(async function () {
    const ERC20Mintable = await ethers.getContractFactory('ERC20Mintable')
    magicToken = await ERC20Mintable.deploy()
    await magicToken.deployed();

    const ERC721Mintable = await ethers.getContractFactory('ERC721Mintable')
    nft = await ERC721Mintable.deploy()
    await nft.deployed();

    const ERC1155Mintable = await ethers.getContractFactory('ERC1155Mintable')
    erc1155 = await ERC1155Mintable.deploy()
    await erc1155.deployed();

    const TreasureNFTOracle = await ethers.getContractFactory('TreasureNFTOracle')
    treasuryOracle = await TreasureNFTOracle.deploy()
    await treasuryOracle.deployed();

    const newOwner = deployer;
    const TreasureMarketplace = await ethers.getContractFactory('TreasureMarketplace')
    marketplace = await TreasureMarketplace.deploy(100, feeRecipient, treasuryOracle.address, magicToken.address)
    await marketplace.deployed();
    await treasuryOracle.transferOwnership(marketplace.address);
  });

  describe('constructor', function () {
    it('setFee()', async function () {
      expect(await marketplace.fee()).to.be.equal(100);
      const newFee = 100;

      await expect(marketplace.connect(staker3Signer).setFee(newFee)).to.be.revertedWith("Ownable: caller is not the owner");

      await marketplace.setFee(newFee);
      expect(await marketplace.fee()).to.be.equal(newFee);
    });

    it('setFeeRecipient()', async function () {
      expect(await marketplace.feeReceipient()).to.be.equal(feeRecipient);
      const newRecipient = seller;

      await expect(marketplace.connect(staker3Signer).setFeeRecipient(newRecipient)).to.be.revertedWith("Ownable: caller is not the owner");

      await marketplace.setFeeRecipient(newRecipient);
      expect(await marketplace.feeReceipient()).to.be.equal(newRecipient);
    });

    it('setOracle()', async function () {
      expect(await marketplace.oracle()).to.be.equal(treasuryOracle.address);
      const newOracle = seller;

      await expect(marketplace.connect(staker3Signer).setOracle(newOracle)).to.be.revertedWith("Ownable: caller is not the owner");

      await marketplace.setOracle(newOracle);
      expect(await marketplace.oracle()).to.be.equal(newOracle);
    });

    it('setPaymentToken()', async function () {
      expect(await marketplace.paymentToken()).to.be.equal(magicToken.address);
      const newToken = seller;

      await expect(marketplace.connect(staker3Signer).setPaymentToken(newToken)).to.be.revertedWith("Ownable: caller is not the owner");

      await marketplace.setPaymentToken(newToken);
      expect(await marketplace.paymentToken()).to.be.equal(newToken);
    });

    it('setOracleOwner()', async function () {
      expect(await treasuryOracle.owner()).to.be.equal(marketplace.address);
      const newOwner = seller;

      await expect(marketplace.connect(staker3Signer).setOracleOwner(newOwner)).to.be.revertedWith("Ownable: caller is not the owner");

      await marketplace.setOracleOwner(newOwner);
      expect(await treasuryOracle.owner()).to.be.equal(newOwner);
    });

    it('addToWhitelist()', async function () {
      expect(await marketplace.nftWhitelist(nft.address)).to.be.false;
      await marketplace.addToWhitelist(nft.address);
      expect(await marketplace.nftWhitelist(nft.address)).to.be.true;
      await expect(marketplace.addToWhitelist(nft.address)).to.be.revertedWith("nft already whitelisted");
    });

    it('removeFromWhitelist()', async function () {
      await marketplace.addToWhitelist(nft.address);
      expect(await marketplace.nftWhitelist(nft.address)).to.be.true;
      await marketplace.removeFromWhitelist(nft.address);
      expect(await marketplace.nftWhitelist(nft.address)).to.be.false;
      await expect(marketplace.removeFromWhitelist(nft.address)).to.be.revertedWith("nft not whitelisted");
    });
  })

  describe('ERC721', function () {
    describe('with NFT minted', function () {
      beforeEach(async function () {
        await nft.mint(seller);
      });

      it('createListing()', async function () {
        const tokenId = 0;
        const pricePerItem = ethers.utils.parseUnits('1', 'ether');
        const expirationTime = 0;
        expect(await nft.ownerOf(tokenId)).to.be.equal(seller);

        await nft.connect(sellerSigner).setApprovalForAll(marketplace.address, true);

        await expect(marketplace.connect(sellerSigner).createListing(
            nft.address,
            tokenId,
            1,
            pricePerItem,
            expirationTime
        )).to.be.revertedWith("nft not whitelisted")

        await marketplace.addToWhitelist(nft.address);
        await marketplace.connect(sellerSigner).createListing(
            nft.address,
            tokenId,
            1,
            pricePerItem,
            expirationTime
        );

        const listing = await marketplace.listings(nft.address, tokenId, seller);
        expect(listing.quantity).to.be.equal(1);
        expect(listing.pricePerItem).to.be.equal(pricePerItem);
        expect(listing.expirationTime).to.be.equal(ethers.constants.MaxUint256);
      });

      describe('with listing', function () {
        const tokenId = 0;
        const pricePerItem = ethers.utils.parseUnits('1', 'ether');
        const expirationTime = 0;

        beforeEach(async function () {
          expect(await nft.ownerOf(tokenId)).to.be.equal(seller);

          await nft.connect(sellerSigner).setApprovalForAll(marketplace.address, true);
          await marketplace.addToWhitelist(nft.address);
          await marketplace.connect(sellerSigner).createListing(
              nft.address,
              tokenId,
              1,
              pricePerItem,
              expirationTime
          );
        });

        it('updateListing()', async function () {
          const newPricePerItem = pricePerItem.mul(2);
          const newExpirationTime = (await getCurrentTime()) + 500;

          await marketplace.connect(sellerSigner).updateListing(
              nft.address,
              tokenId,
              1,
              newPricePerItem,
              newExpirationTime
          );

          const listing = await marketplace.listings(nft.address, tokenId, seller);
          expect(listing.quantity).to.be.equal(1);
          expect(listing.pricePerItem).to.be.equal(newPricePerItem);
          expect(listing.expirationTime).to.be.equal(newExpirationTime);
        });

        it('cancelListing()', async function () {
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

          await marketplace.connect(buyerSigner).buyItem(
            nft.address,
            tokenId,
            seller,
            1
          )

          expect(await magicToken.balanceOf(await marketplace.feeReceipient())).to.be.equal(pricePerItem.div(100));
          expect(await magicToken.balanceOf(seller)).to.be.equal(pricePerItem.mul(99).div(100));

          expect(await nft.ownerOf(tokenId)).to.be.equal(buyer);
          const listing = await marketplace.listings(nft.address, tokenId, seller);
          expect(listing.quantity).to.be.equal(0);
          expect(listing.pricePerItem).to.be.equal(0);
          expect(listing.expirationTime).to.be.equal(0);
        });
      })
    })
  })


  describe('ERC1155', function () {
    describe('with NFT minted', function () {
      const tokenId = 0;
      const quantity = 10;
      const pricePerItem = ethers.utils.parseUnits('1', 'ether');
      const expirationTime = 0;

      beforeEach(async function () {
        await erc1155.functions['mint(address,uint256,uint256)'](seller, tokenId, quantity);
      });

      it('createListing()', async function () {
        expect(await erc1155.balanceOf(seller, tokenId)).to.be.equal(quantity);

        await erc1155.connect(sellerSigner).setApprovalForAll(marketplace.address, true);
        await marketplace.addToWhitelist(erc1155.address);
        await expect(marketplace.connect(sellerSigner).createListing(
          erc1155.address,
          tokenId,
          quantity,
          pricePerItem,
          (await getCurrentTime()) - 1
        )).to.be.revertedWith("invalid expiration time");

        await marketplace.connect(sellerSigner).createListing(
            erc1155.address,
            tokenId,
            quantity,
            pricePerItem,
            expirationTime
        );

        await expect(marketplace.connect(sellerSigner).createListing(
          erc1155.address,
          tokenId,
          quantity,
          pricePerItem,
          expirationTime
        )).to.be.revertedWith("already listed");

        const listing = await marketplace.listings(erc1155.address, tokenId, seller);
        expect(listing.quantity).to.be.equal(quantity);
        expect(listing.pricePerItem).to.be.equal(pricePerItem);
        expect(listing.expirationTime).to.be.equal(ethers.constants.MaxUint256);
      });

      describe('expirationTime', function () {
        let timedelta = 100;
        let expirationTime: any;
        beforeEach(async function () {
          expirationTime = await getCurrentTime() + timedelta;

          expect(await erc1155.balanceOf(seller, tokenId)).to.be.equal(quantity);
          await marketplace.addToWhitelist(erc1155.address);

          await erc1155.connect(sellerSigner).setApprovalForAll(marketplace.address, true);
          await marketplace.connect(sellerSigner).createListing(
              erc1155.address,
              tokenId,
              quantity,
              pricePerItem,
              expirationTime
          );
        });

        it('success', async function () {
          expect(await erc1155.balanceOf(seller, tokenId)).to.be.equal(quantity);
          await magicToken.mint(buyer, pricePerItem.mul(quantity));
          await magicToken.connect(buyerSigner).approve(marketplace.address, pricePerItem.mul(quantity));
          expect(await magicToken.balanceOf(marketplace.address)).to.be.equal(0);
          expect(await magicToken.balanceOf(seller)).to.be.equal(0);

          await marketplace.connect(buyerSigner).buyItem(
            erc1155.address,
            tokenId,
            seller,
            quantity
          )

          expect(await magicToken.balanceOf(await marketplace.feeReceipient())).to.be.equal(pricePerItem.mul(quantity).div(100));
          expect(await magicToken.balanceOf(seller)).to.be.equal(pricePerItem.mul(quantity).mul(99).div(100));

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
          await magicToken.mint(buyer, pricePerItem.mul(quantity));
          await magicToken.connect(buyerSigner).approve(marketplace.address, pricePerItem.mul(quantity));
          expect(await magicToken.balanceOf(marketplace.address)).to.be.equal(0);
          expect(await magicToken.balanceOf(seller)).to.be.equal(0);

          await expect(marketplace.connect(buyerSigner).buyItem(
            erc1155.address,
            tokenId,
            seller,
            quantity
          )).to.be.revertedWith("listing expired");

          expect(await magicToken.balanceOf(buyer)).to.be.equal(pricePerItem.mul(quantity));
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
          await marketplace.addToWhitelist(erc1155.address);
          await marketplace.connect(sellerSigner).createListing(
              erc1155.address,
              tokenId,
              quantity,
              pricePerItem,
              expirationTime
          );
        });

        it('updateListing()', async function () {
          const newPricePerItem = pricePerItem.mul(2);
          const newQuantity = 5;
          const newExpirationTime = (await getCurrentTime()) + 500;

          await expect(marketplace.connect(sellerSigner).updateListing(
            erc1155.address,
            2,
            quantity,
            pricePerItem,
            expirationTime
          )).to.be.revertedWith("not listed item");

          await expect(marketplace.connect(buyerSigner).updateListing(
            erc1155.address,
            tokenId,
            quantity,
            pricePerItem,
            expirationTime
          )).to.be.revertedWith("not listed item");

          await marketplace.connect(sellerSigner).updateListing(
              erc1155.address,
              tokenId,
              newQuantity,
              newPricePerItem,
              newExpirationTime
          );

          const listing = await marketplace.listings(erc1155.address, tokenId, seller);
          expect(listing.quantity).to.be.equal(newQuantity);
          expect(listing.pricePerItem).to.be.equal(newPricePerItem);
          expect(listing.expirationTime).to.be.equal(newExpirationTime);
        });

        it('cancelListing()', async function () {
          await expect(marketplace.connect(buyerSigner).cancelListing(erc1155.address, tokenId))
            .to.be.revertedWith("not listed item");

          await marketplace.connect(sellerSigner).cancelListing(erc1155.address, tokenId);

          await expect(marketplace.connect(sellerSigner).cancelListing(erc1155.address, tokenId))
            .to.be.revertedWith("not listed item");

          const listing = await marketplace.listings(erc1155.address, tokenId, seller);
          expect(listing.quantity).to.be.equal(0);
          expect(listing.pricePerItem).to.be.equal(0);
          expect(listing.expirationTime).to.be.equal(0);
        });

        describe('buyItem()', function () {
          it('all', async function () {
            expect(await erc1155.balanceOf(seller, tokenId)).to.be.equal(quantity);
            await magicToken.mint(buyer, pricePerItem.mul(quantity));
            await magicToken.connect(buyerSigner).approve(marketplace.address, pricePerItem.mul(quantity));
            expect(await magicToken.balanceOf(marketplace.address)).to.be.equal(0);
            expect(await magicToken.balanceOf(seller)).to.be.equal(0);

            await expect(marketplace.connect(buyerSigner).buyItem(
              erc1155.address,
              2,
              seller,
              quantity
            )).to.be.revertedWith("not listed item");

            await erc1155.connect(sellerSigner).safeTransferFrom(seller, staker3, tokenId, 1, "0x");

            await expect(marketplace.connect(buyerSigner).buyItem(
              erc1155.address,
              tokenId,
              seller,
              quantity
            )).to.be.revertedWith("not owning item");

            await erc1155.connect(staker3Signer).safeTransferFrom(staker3, seller, tokenId, 1, "0x");

            await marketplace.connect(buyerSigner).buyItem(
              erc1155.address,
              tokenId,
              seller,
              quantity
            )

            expect(await magicToken.balanceOf(await marketplace.feeReceipient())).to.be.equal(pricePerItem.mul(quantity).div(100));
            expect(await magicToken.balanceOf(seller)).to.be.equal(pricePerItem.mul(quantity).mul(99).div(100));

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
            await magicToken.mint(buyer, pricePerItem.mul(buyQuantity));
            await magicToken.connect(buyerSigner).approve(marketplace.address, pricePerItem.mul(buyQuantity));
            expect(await magicToken.balanceOf(marketplace.address)).to.be.equal(0);
            expect(await magicToken.balanceOf(seller)).to.be.equal(0);

            await marketplace.connect(buyerSigner).buyItem(
              erc1155.address,
              tokenId,
              seller,
              buyQuantity
            )

            expect(await magicToken.balanceOf(await marketplace.feeReceipient())).to.be.equal(pricePerItem.mul(buyQuantity).div(100));
            expect(await magicToken.balanceOf(seller)).to.be.equal(pricePerItem.mul(buyQuantity).mul(99).div(100));

            expect(await erc1155.balanceOf(buyer, tokenId)).to.be.equal(buyQuantity);
            expect(await erc1155.balanceOf(seller, tokenId)).to.be.equal(quantity - buyQuantity);

            const listing = await marketplace.listings(erc1155.address, tokenId, seller);
            expect(listing.quantity).to.be.equal(quantity - buyQuantity);
            expect(listing.pricePerItem).to.be.equal(pricePerItem);
            expect(listing.expirationTime).to.be.equal(ethers.constants.MaxUint256);
          });
        })

        describe('TreasureNFTOracle', function () {
          it('getPrice()', async function () {
            const price = await treasuryOracle.getPrice(erc1155.address, tokenId);
            expect(price.price).to.be.equal(0);
            expect(price.denomination).to.be.equal(ethers.constants.AddressZero);
          })

          describe('after sale', function () {
            beforeEach(async function () {
              await magicToken.mint(buyer, pricePerItem.mul(quantity));
              await magicToken.connect(buyerSigner).approve(marketplace.address, pricePerItem.mul(quantity));

              await marketplace.connect(buyerSigner).buyItem(
                erc1155.address,
                tokenId,
                seller,
                quantity
              )
            });

            it('getPrice()', async function () {
              const price = await treasuryOracle.getPrice(erc1155.address, tokenId);
              expect(price.price).to.be.equal(pricePerItem);
              expect(price.denomination).to.be.equal(magicToken.address);
            })
          })
        })
      })
    })
  })
});
