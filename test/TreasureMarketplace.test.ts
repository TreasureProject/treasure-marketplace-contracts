import hre from 'hardhat';
import {expect} from 'chai';
import {getCurrentTime, mineBlock} from './utils';

const {ethers, deployments, getNamedAccounts} = hre;
const { deploy } = deployments;

describe('TreasureMarketplace', function () {
  let marketplace: any, marketplaceBuyer: any, treasuryOracle: any;
  let magicToken: any, nft: any, erc1155: any;
  let seller: any, buyer: any, staker3: any, feeRecipient: any, deployer: any;
  let sellerSigner: any, buyerSigner: any, staker3Signer: any, feeRecipientSigner: any, deployerSigner: any;

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

    const newOwner = deployer;
    const TreasureMarketplace = await ethers.getContractFactory('TreasureMarketplace')
    marketplace = await TreasureMarketplace.deploy()
    await marketplace.deployed();
    await marketplace.init(100, feeRecipient, magicToken.address);
  });

  describe('init', function () {
    it('init()', async function () {
      await expect(marketplace.init(100, feeRecipient, magicToken.address)).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it('setFee()', async function () {
      expect(await marketplace.fee()).to.be.equal(100);
      const newFee = 100;

      await expect(marketplace.connect(staker3Signer).setFee(newFee)).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(marketplace.setFee(100000)).to.be.revertedWith("max fee");

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

    it('approve token', async function () {
      expect(await marketplace.tokenApprovals(nft.address)).to.equal(TOKEN_APPROVAL_STATUS_NOT_APPROVED);
      await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_ERC_721_APPROVED);
      expect(await marketplace.tokenApprovals(nft.address)).to.equal(TOKEN_APPROVAL_STATUS_ERC_721_APPROVED);
      // Allow to approve twice
      await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_ERC_721_APPROVED);
      expect(await marketplace.tokenApprovals(nft.address)).to.equal(TOKEN_APPROVAL_STATUS_ERC_721_APPROVED);
    });

    it('unapprove token', async function () {
      await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_ERC_721_APPROVED);
      expect(await marketplace.tokenApprovals(nft.address)).to.equal(TOKEN_APPROVAL_STATUS_ERC_721_APPROVED);
      await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_NOT_APPROVED);
      expect(await marketplace.tokenApprovals(nft.address)).to.equal(TOKEN_APPROVAL_STATUS_NOT_APPROVED);
      // Allow to remove twice
      await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_NOT_APPROVED);
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
    describe('with NFT minted', function () {
      beforeEach(async function () {
        await nft.mint(seller);
      });

      it('createListing()', async function () {
        const tokenId = 0;
        const pricePerItem = ethers.utils.parseUnits('1', 'ether');
        const expirationTime = ethers.BigNumber.from('4102462800'); // Midnight Jan 1, 2100
        expect(await nft.ownerOf(tokenId)).to.be.equal(seller);

        await nft.connect(sellerSigner).setApprovalForAll(marketplace.address, true);

        await expect(marketplace.connect(sellerSigner).createListing(
            nft.address,
            tokenId,
            1,
            pricePerItem,
            expirationTime
        )).to.be.revertedWith("invalid nft address")

        await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_ERC_721_APPROVED);

        await expect(marketplace.connect(sellerSigner).createListing(
            nft.address,
            tokenId,
            1,
            0,
            expirationTime
        )).to.be.revertedWith("cannot sell for 0")

        await expect(marketplace.connect(sellerSigner).createListing(
            nft.address,
            tokenId,
            0,
            pricePerItem,
            expirationTime
        )).to.be.revertedWith("cannot list multiple ERC721")

        await expect(marketplace.connect(buyerSigner).createListing(
            nft.address,
            tokenId,
            1,
            pricePerItem,
            expirationTime
        )).to.be.revertedWith("not owning item")

        await marketplace.pause();

        await expect(marketplace.connect(sellerSigner).createListing(
            nft.address,
            tokenId,
            1,
            pricePerItem,
            expirationTime
        )).to.be.revertedWith("Pausable: paused");

        await marketplace.unpause();

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
        expect(listing.expirationTime).to.be.equal(expirationTime);
      });

      describe('with listing', function () {
        const tokenId = 0;
        const pricePerItem = ethers.utils.parseUnits('1', 'ether');
        const expirationTime = ethers.BigNumber.from('4102462800'); // Midnight Jan 1, 2100

        beforeEach(async function () {
          expect(await nft.ownerOf(tokenId)).to.be.equal(seller);

          await nft.connect(sellerSigner).setApprovalForAll(marketplace.address, true);
          await marketplace.setTokenApprovalStatus(nft.address, TOKEN_APPROVAL_STATUS_ERC_721_APPROVED);
          await marketplace.connect(sellerSigner).createListing(
              nft.address,
              tokenId,
              1,
              pricePerItem,
              expirationTime
          );
        });

        it('updateListing()', async function () {
          const newPricePerItem = pricePerItem.div(2);
          const newExpirationTime = (await getCurrentTime()) + 500;

          await marketplace.pause();

          await expect(marketplace.connect(sellerSigner).updateListing(
              nft.address,
              tokenId,
              1,
              newPricePerItem,
              newExpirationTime
          )).to.be.revertedWith("Pausable: paused");

          await marketplace.unpause();

          await expect(marketplace.connect(sellerSigner).updateListing(
              nft.address,
              tokenId,
              1,
              pricePerItem.add(1),
              newExpirationTime
          )).to.be.revertedWith("Cannot increase price")

          await marketplace.connect(sellerSigner).updateListing(
              nft.address,
              tokenId,
              1,
              newPricePerItem,
              newExpirationTime
          );

          await expect(marketplace.connect(sellerSigner).updateListing(
              nft.address,
              tokenId,
              1,
              0,
              newExpirationTime
          )).to.be.revertedWith("cannot sell for 0");

          await expect(marketplace.connect(sellerSigner).updateListing(
              nft.address,
              tokenId,
              0,
              newPricePerItem,
              newExpirationTime
          )).to.be.revertedWith("Cannot list multiple ERC721");

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

          await expect(marketplace.connect(buyerSigner).buyItem(
            nft.address,
            tokenId,
            seller,
            0,
            pricePerItem
          )).to.be.revertedWith("Nothing to buy");

          await expect(marketplace.connect(buyerSigner).buyItem(
            nft.address,
            tokenId,
            seller,
            2,
            pricePerItem
          )).to.be.revertedWith("not enough quantity");

          await expect(marketplace.connect(buyerSigner).buyItem(
            nft.address,
            tokenId,
            seller,
            1,
            pricePerItem.sub(1)
          )).to.be.revertedWith("price increased");

          await expect(marketplace.connect(sellerSigner).buyItem(
            nft.address,
            tokenId,
            seller,
            1,
            pricePerItem
          )).to.be.revertedWith("Cannot buy your own item");

          await marketplace.pause();

          await expect(marketplace.connect(buyerSigner).buyItem(
            nft.address,
            tokenId,
            seller,
            1,
            pricePerItem
          )).to.be.revertedWith("Pausable: paused");

          await marketplace.unpause();

          await marketplace.connect(buyerSigner).buyItem(
            nft.address,
            tokenId,
            seller,
            1,
            pricePerItem
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
      const expirationTime = ethers.BigNumber.from('4102462800'); // Midnight Jan 1, 2100

      beforeEach(async function () {
        await erc1155.functions['mint(address,uint256,uint256)'](seller, tokenId, quantity);
      });

      it('createListing()', async function () {
        expect(await erc1155.balanceOf(seller, tokenId)).to.be.equal(quantity);

        await erc1155.connect(sellerSigner).setApprovalForAll(marketplace.address, true);
        await marketplace.setTokenApprovalStatus(erc1155.address, TOKEN_APPROVAL_STATUS_ERC_1155_APPROVED);
        await expect(marketplace.connect(sellerSigner).createListing(
          erc1155.address,
          tokenId,
          quantity,
          pricePerItem,
          (await getCurrentTime()) - 1
        )).to.be.revertedWith("invalid expiration time");

        await expect(marketplace.connect(sellerSigner).createListing(
          erc1155.address,
          tokenId,
          quantity,
          0,
          expirationTime
        )).to.be.revertedWith("cannot sell for 0");

        await expect(marketplace.connect(sellerSigner).createListing(
          erc1155.address,
          tokenId,
          0,
          pricePerItem,
          expirationTime
        )).to.be.revertedWith("nothing to list");


        await expect(marketplace.connect(buyerSigner).createListing(
          erc1155.address,
          tokenId,
          1,
          pricePerItem,
          expirationTime
        )).to.be.revertedWith("must hold enough nfts");

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
        expect(listing.expirationTime).to.be.equal(expirationTime);
      });

      describe('expirationTime', function () {
        let timedelta = 100;
        let expirationTime: any;
        beforeEach(async function () {
          expirationTime = await getCurrentTime() + timedelta;

          expect(await erc1155.balanceOf(seller, tokenId)).to.be.equal(quantity);
          await marketplace.setTokenApprovalStatus(erc1155.address, TOKEN_APPROVAL_STATUS_ERC_1155_APPROVED);

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
            quantity,
            pricePerItem
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
            quantity,
            pricePerItem
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
          await marketplace.setTokenApprovalStatus(erc1155.address, TOKEN_APPROVAL_STATUS_ERC_1155_APPROVED);
          await marketplace.connect(sellerSigner).createListing(
              erc1155.address,
              tokenId,
              quantity,
              pricePerItem,
              expirationTime
          );
        });

        it('updateListing()', async function () {
          const newPricePerItem = pricePerItem.div(2);
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

          await expect(marketplace.connect(sellerSigner).updateListing(
              erc1155.address,
              tokenId,
              0,
              newPricePerItem,
              newExpirationTime
          )).to.be.revertedWith("cannot update quantity to 0");

          await expect(marketplace.connect(sellerSigner).updateListing(
              erc1155.address,
              tokenId,
              newQuantity,
              0,
              newExpirationTime
          )).to.be.revertedWith("cannot sell for 0");

          await expect(marketplace.connect(sellerSigner).updateListing(
              erc1155.address,
              tokenId,
              newQuantity,
              pricePerItem.add(1),
              newExpirationTime
          )).to.be.revertedWith("Cannot increase price");

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
            await magicToken.mint(buyer, pricePerItem.mul(quantity));
            await magicToken.connect(buyerSigner).approve(marketplace.address, pricePerItem.mul(quantity));
            expect(await magicToken.balanceOf(marketplace.address)).to.be.equal(0);
            expect(await magicToken.balanceOf(seller)).to.be.equal(0);

            await expect(marketplace.connect(buyerSigner).buyItem(
              erc1155.address,
              2,
              seller,
              quantity,
              pricePerItem
            )).to.be.revertedWith("not listed item");

            await erc1155.connect(sellerSigner).safeTransferFrom(seller, staker3, tokenId, 1, "0x");

            await expect(marketplace.connect(buyerSigner).buyItem(
              erc1155.address,
              tokenId,
              seller,
              quantity,
              pricePerItem
            )).to.be.reverted;

            await erc1155.connect(staker3Signer).safeTransferFrom(staker3, seller, tokenId, 1, "0x");

            await expect(marketplace.connect(buyerSigner).buyItem(
              erc1155.address,
              tokenId,
              seller,
              0,
              pricePerItem
            )).to.be.revertedWith("Nothing to buy")

            await marketplace.connect(buyerSigner).buyItem(
              erc1155.address,
              tokenId,
              seller,
              quantity,
              pricePerItem
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
              buyQuantity,
              pricePerItem
            )

            expect(await magicToken.balanceOf(await marketplace.feeReceipient())).to.be.equal(pricePerItem.mul(buyQuantity).div(100));
            expect(await magicToken.balanceOf(seller)).to.be.equal(pricePerItem.mul(buyQuantity).mul(99).div(100));

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
});
