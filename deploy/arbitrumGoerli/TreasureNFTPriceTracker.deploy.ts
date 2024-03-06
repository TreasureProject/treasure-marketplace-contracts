import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, execute, read, get } = deployments;
    const { deployer } = await getNamedAccounts();

    const treasureMarketplaceContractAddress = (await get('TreasureMarketplace')).address;
    // Goerli address for legions 721 contract
    const legionContractAddress = '0x9202aE6BAcE44Ae2826A7918f62e51db570fF163';
    // Goerli address for legion's metadata contract
    const legionMetadataStoreContractAddress = '0xc813276680388B2Fc8f331eb5E922Fd5c95c1B2f';

    const priceTracker = await deploy('TreasureNFTPriceTracker', {
        from: deployer,
        log: true,
        proxy: {
            owner: deployer,
            proxyContract: 'OpenZeppelinTransparentProxy',
            execute: {
                init: {
                    methodName: 'initialize',
                    args: [
                        treasureMarketplaceContractAddress,
                        legionContractAddress,
                        legionMetadataStoreContractAddress,
                    ],
                },
            },
        },
    });

    // Set the price tracker address in the marketplace contracted if needed.
    if (priceTracker.address !== (await read('TreasureMarketplace', 'priceTrackerAddress'))) {
        await execute('TreasureMarketplace', { from: deployer, log: true }, 'setPriceTracker', priceTracker.address);
    }
};
export default func;
func.tags = ['TreasureNFTPriceTracker'];
func.dependencies = ['marketplace'];
