import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, execute, read } = deployments;
    const { deployer } = await getNamedAccounts();
    const magicArbitrum = '0x539bdE0d7Dbd336b79148AA742883198BBF60342';
    const fee = 500; // 5%
    const feeWithCollectionOwner = 250; // 2.5%
    const feeRecipient = '0xDb6Ab450178bAbCf0e467c1F3B436050d907E233';
    const newOwner = '0xB013ABD83F0bD173E9F14ce7d6e420Ad711483b4';
    const newProxyOwner = '0xB013ABD83F0bD173E9F14ce7d6e420Ad711483b4';

    const treasureMarketplace = await deploy('TreasureMarketplace', {
        from: deployer,
        log: true,
        proxy: {
            owner: newProxyOwner,
            proxyContract: 'OpenZeppelinTransparentProxy',
            execute: {
                init: {
                    methodName: 'initialize',
                    args: [fee, feeRecipient, magicArbitrum],
                },
            },
        },
    });

    const wethAddress = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
    const wethFromContract = await read('TreasureMarketplace', 'weth');
    if (wethAddress !== wethFromContract) {
        await execute('TreasureMarketplace', { from: deployer, log: true }, 'setWeth', wethAddress);
    }

    if (!(await read('TreasureMarketplace', 'areBidsActive'))) {
        await execute('TreasureMarketplace', { from: deployer, log: true }, 'toggleAreBidsActive');
    }

    const TREASURE_MARKETPLACE_ADMIN_ROLE = await read('TreasureMarketplace', 'TREASURE_MARKETPLACE_ADMIN_ROLE');

    if (!(await read('TreasureMarketplace', 'hasRole', TREASURE_MARKETPLACE_ADMIN_ROLE, newOwner))) {
        await execute(
            'TreasureMarketplace',
            { from: deployer, log: true },
            'grantRole',
            TREASURE_MARKETPLACE_ADMIN_ROLE,
            newOwner,
        );
    }

    // if new owner is set, remove original owner
    if (
        (await read('TreasureMarketplace', 'hasRole', TREASURE_MARKETPLACE_ADMIN_ROLE, deployer)) &&
        newOwner !== deployer
    ) {
        await execute(
            'TreasureMarketplace',
            { from: deployer, log: true },
            'renounceRole',
            TREASURE_MARKETPLACE_ADMIN_ROLE,
            deployer,
        );
    }

    const feeFromContract = await read('TreasureMarketplace', 'fee');
    const feeWithCollectionOwnerFromContrat = await read('TreasureMarketplace', 'feeWithCollectionOwner');
    if (feeFromContract.toNumber() !== fee || feeWithCollectionOwnerFromContrat.toNumber() !== feeWithCollectionOwner) {
        await execute('TreasureMarketplace', { from: deployer, log: true }, 'setFee', fee, feeWithCollectionOwner);
    }

    const DefaultProxyAdmin = await deployments.get('DefaultProxyAdmin');

    const entries = [
        { name: 'DefaultProxyAdmin.address', value: DefaultProxyAdmin.address },
        {
            name: 'DefaultProxyAdmin.getProxyAdmin("TreasureMarketplace")',
            value: await read('DefaultProxyAdmin', 'getProxyAdmin', treasureMarketplace.address),
        },
        { name: 'DefaultProxyAdmin.owner()', value: await read('DefaultProxyAdmin', 'owner') },
        {
            name: `TreasureMarketplace.hasRole(${newOwner})`,
            value: await read('TreasureMarketplace', 'hasRole', TREASURE_MARKETPLACE_ADMIN_ROLE, newOwner),
        },
        {
            name: `TreasureMarketplace.hasRole(${deployer})`,
            value: await read('TreasureMarketplace', 'hasRole', TREASURE_MARKETPLACE_ADMIN_ROLE, deployer),
        },
        { name: `TreasureMarketplace.feeReceipient()`, value: await read('TreasureMarketplace', 'feeReceipient') },
        { name: `TreasureMarketplace.fee()`, value: (await read('TreasureMarketplace', 'fee')).toNumber() },
    ];

    console.log(`---- TreasureMarketplace Config ----`);
    console.table(entries);
};
export default func;
func.tags = ['marketplace'];
