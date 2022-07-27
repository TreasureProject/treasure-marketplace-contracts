import hre from 'hardhat';
import { expect } from 'chai';
import { getCurrentTime, mineBlock } from './utils';

const { ethers, deployments, artifacts, getNamedAccounts } = hre;
const { deploy } = deployments;

enum LegionRarity {
    LEGENDARY,
    RARE,
    SPECIAL,
    UNCOMMON,
    COMMON,
    RECRUIT
}

enum LegionGeneration {
    GENESIS,
    AUXILIARY,
    RECRUIT
}

enum FloorType {
    FLOOR,
    SUBFLOOR1,
    SUBFLOOR2,
    SUBFLOOR3
}

describe('TreasureNFTPriceTracker', function () {
    let _nftPriceTracker: any;
    let _genCommonMetadataContract: any;
    
    let _legionNFTContractAddress: string;

    let _marketplaceSigner: any;
    let _randomSigner: any;

    before(async function () {
        const namedAccounts = await getNamedAccounts();

        _marketplaceSigner = ethers.provider.getSigner(namedAccounts.staker1);
        _randomSigner = ethers.provider.getSigner(namedAccounts.staker2);

        _legionNFTContractAddress = namedAccounts.staker3;
    });

    beforeEach(async function () {
        const metadataMockFactory = await ethers.getContractFactory('LegionMetadataStoreMock')
        _genCommonMetadataContract = await metadataMockFactory.deploy(LegionGeneration.GENESIS, LegionRarity.COMMON);
        await _genCommonMetadataContract.deployed();

        const trackerFactory = await ethers.getContractFactory('TreasureNFTPriceTracker');
        _nftPriceTracker = await trackerFactory.deploy()
        await _nftPriceTracker.deployed();
        await _nftPriceTracker.initialize(_marketplaceSigner._address, _legionNFTContractAddress, _genCommonMetadataContract.address);
    });

    it('initialize()', async function () {
        await expect(_nftPriceTracker.initialize(_marketplaceSigner._address, _legionNFTContractAddress, _genCommonMetadataContract.address))
            .to.be.revertedWith("Initializable: contract is already initialized");
        
        expect(await _nftPriceTracker.treasureMarketplaceContract())
            .to.equal(_marketplaceSigner._address);
        expect(await _nftPriceTracker.legionContract())
            .to.equal(_legionNFTContractAddress);
        expect(await _nftPriceTracker.legionMetadata())
            .to.equal(_genCommonMetadataContract.address);
    });

    it('recordSale()', async function () {
        const tokenId = 1;
        const salePrice1 = ethers.utils.parseEther('500');
        const salePrice2 = ethers.utils.parseEther('100');
        const salePrice3 = ethers.utils.parseEther('900');
        await expect(_nftPriceTracker.recordSale(_legionNFTContractAddress, tokenId, salePrice1))
            .to.be.revertedWith("Invalid caller");

        // AveragePriceUpdated(
        //     address indexed _collection,
        //     FloorType indexed _floorType,
        //     uint256 _oldAverage,
        //     uint256 _salePrice,
        //     uint256 _newAverage
        // )
        await expect(_nftPriceTracker.connect(_marketplaceSigner).recordSale(_legionNFTContractAddress, tokenId, salePrice1))
            .to.emit(_nftPriceTracker, 'AveragePriceUpdated')
            .withArgs(_legionNFTContractAddress, FloorType.SUBFLOOR1, 0, salePrice1, salePrice1);
        
        const expectedAvgPrice = salePrice1.add(salePrice2).div(2);
        await expect(_nftPriceTracker.connect(_marketplaceSigner).recordSale(_legionNFTContractAddress, tokenId, salePrice2))
            .to.emit(_nftPriceTracker, 'AveragePriceUpdated')
            .withArgs(_legionNFTContractAddress, FloorType.SUBFLOOR1, salePrice1, salePrice2, expectedAvgPrice);

        expect(await _nftPriceTracker.getAveragePriceForCollection(_legionNFTContractAddress, FloorType.SUBFLOOR1))
            .to.equal(expectedAvgPrice);
        
        const expectedAvgPrice2 = expectedAvgPrice.add(salePrice3).div(2);
        await expect(_nftPriceTracker.connect(_marketplaceSigner).recordSale(_legionNFTContractAddress, tokenId, salePrice3))
            .to.emit(_nftPriceTracker, 'AveragePriceUpdated')
            .withArgs(_legionNFTContractAddress, FloorType.SUBFLOOR1, expectedAvgPrice, salePrice3, expectedAvgPrice2);

            expect(await _nftPriceTracker.getAveragePriceForCollection(_legionNFTContractAddress, FloorType.SUBFLOOR1))
                .to.equal(expectedAvgPrice2);
    });
});
