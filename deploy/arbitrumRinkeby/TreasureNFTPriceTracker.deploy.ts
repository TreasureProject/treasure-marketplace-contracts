import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, execute, read, get } = deployments;
    const { deployer } = await getNamedAccounts();

    const marketplaceContract = await get('TreasureMarketplace');
    // Legion Testnet = 0x08447FbbD0295C5C7586864339D95A855dae36e8
    const legionAddress = '0x08447FbbD0295C5C7586864339D95A855dae36e8';
    // Legion Metadata Testnet = 0x5328Ea8BaE5EB92526EE4dfDc09C41b81e018e9a
    const legionMetadataAddress = '0x5328Ea8BaE5EB92526EE4dfDc09C41b81e018e9a';

    const newProxyOwner = "0xB013ABD83F0bD173E9F14ce7d6e420Ad711483b4";

    const tracker = await deploy('TreasureNFTPriceTracker', {
      from: deployer,
      log: true,
      proxy: {
        owner: newProxyOwner,
        proxyContract: 'OpenZeppelinTransparentProxy',
        execute: {
          init: {
            methodName: "initialize",
            args: [marketplaceContract.address, legionAddress, legionMetadataAddress]
          }
        }
      }
    });

    const DefaultProxyAdmin = await deployments.get('DefaultProxyAdmin');

    const entries = [
      { name: 'DefaultProxyAdmin.address', value: DefaultProxyAdmin.address },
      { name: 'DefaultProxyAdmin.getProxyAdmin("TreasureNFTPriceTracker")', value: await read('DefaultProxyAdmin', 'getProxyAdmin', tracker.address) },
      { name: 'DefaultProxyAdmin.owner()', value: await read('DefaultProxyAdmin', 'owner') },
      { name: `TreasureNFTPriceTracker.treasureMarketplaceContract()`, value: await read('TreasureNFTPriceTracker', 'treasureMarketplaceContract') },
      { name: `TreasureNFTPriceTracker.legionContract()`, value: await read('TreasureNFTPriceTracker', 'legionContract') },
      { name: `TreasureNFTPriceTracker.legionMetadata()`, value: await read('TreasureNFTPriceTracker', 'legionMetadata') },
    ];

    console.log(`---- TreasureNFTPriceTracker Config ----`);
    console.table(entries);
};
export default func;
func.tags = ['tracker'];
func.dependencies = [ 'marketplace' ];
