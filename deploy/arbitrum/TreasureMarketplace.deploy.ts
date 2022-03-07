import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, execute, read } = deployments;
    const { deployer } = await getNamedAccounts();

    const magicArbitrum = "0x539bdE0d7Dbd336b79148AA742883198BBF60342";
    const fee = 500; // 5%
    const feeRecipient = "0xDb6Ab450178bAbCf0e467c1F3B436050d907E233";
    const oracle = (await deployments.get("TreasureNFTOracle")).address;
    const newOwner = feeRecipient;
    const nftAllowList = [
      "0xEBba467eCB6b21239178033189CeAE27CA12EaDf", // treasure
      "0x3956C81A51FeAed98d7A678d53F44b9166c8ed66", // seedOfLife
      "0x658365026D06F00965B5bb570727100E821e6508", // legions
      "0xE83c0200E93Cb1496054e387BDdaE590C07f0194", // legionsGenesis
      "0xf0a35bA261ECE4FC12870e5B7b9E7790202EF9B5", // keys
      "0x21e1969884D477afD2Afd4Ad668864a0EebD644c", // extraLife
    ]

    const treasureMarketplace = await deploy('TreasureMarketplace', {
      from: deployer,
      log: true,
      args: [fee, feeRecipient, oracle, magicArbitrum]
    })

    for (const nft of nftAllowList) {
      if ((await read('TreasureMarketplace', 'nftAllowList', nft)) == false) {
        await execute(
          'TreasureMarketplace',
          { from: deployer, log: true },
          'addToAllowList',
          nft
        );
      }
    }

    if ((await read('TreasureNFTOracle', 'owner')) != treasureMarketplace.address) {
      await execute(
        'TreasureNFTOracle',
        { from: deployer, log: true },
        'transferOwnership',
        treasureMarketplace.address
      );
    }

    if ((await read('TreasureMarketplace', 'owner')) != newOwner) {
      await execute(
        'TreasureMarketplace',
        { from: deployer, log: true },
        'transferOwnership',
        newOwner
      );
    }
};
export default func;
func.tags = ['marketplace'];
func.dependencies = ['oracle']
