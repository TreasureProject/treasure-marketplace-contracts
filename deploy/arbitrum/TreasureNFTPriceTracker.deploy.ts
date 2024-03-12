import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, execute, read, get } = deployments;
    const { deployer } = await getNamedAccounts();

    const treasureMarketplaceContractAddress = (await get('TreasureMarketplace')).address;
    // Mainnet address for legions 721 contract
    const legionContractAddress = '0xfE8c1ac365bA6780AEc5a985D989b327C27670A1';
    // Mainnet address for legion's metadata contract
    const legionMetadataStoreContractAddress = '0x99193EE9229b833d2aA4DbBdA697C6600b944286';

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
func.dependencies = ['TreasureMarketplace'];
