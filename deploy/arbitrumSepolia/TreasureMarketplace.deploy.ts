import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, execute, read } = deployments;
    const { deployer } = await getNamedAccounts();

    // Constants for this deploy script.
    const fee = 500; // 5%
    const feeWithCollectionOwner = 250; // 2.5%
    const feeReceipient = '0xd9F1E68fD5b9749ABc8C87241DDDA171baa0d791';
    const newOwner = '0xd9F1E68fD5b9749ABc8C87241DDDA171baa0d791';
    const newProxyOwner = '0xd9F1E68fD5b9749ABc8C87241DDDA171baa0d791';
    const magicAddress = '0x55d0cf68a1afe0932aff6f36c87efa703508191c';
    const wethAddress = '0x980b62da83eff3d4576c647993b0c1d7faf17c73';

    // Deploy/upgrade the Treasure marketplace contract.
    const treasureMarketplace = await deploy('TreasureMarketplace', {
        from: deployer,
        log: true,
        proxy: {
            owner: newProxyOwner,
            proxyContract: 'OpenZeppelinTransparentProxy',
            execute: {
                init: {
                    methodName: 'initialize',
                    args: [fee, feeReceipient, magicAddress],
                },
            },
        },
    });

    // Set the WETH address in the marketplace contracted if needed.
    const wethAddressFromContract = await read('TreasureMarketplace', 'weth');
    if (wethAddress !== wethAddressFromContract.toLowerCase()) {
        await execute('TreasureMarketplace', { from: deployer, log: true }, 'setWeth', wethAddress);
    }

    // Set the DAO fees (w/o and w/ collection owner) in the contract.
    const feeFromContract = await read('TreasureMarketplace', 'fee');
    const feeWithCollectionOwnerFromContract = await read('TreasureMarketplace', 'feeWithCollectionOwner');
    if (
        feeFromContract.toNumber() !== fee ||
        feeWithCollectionOwnerFromContract.toNumber() !== feeWithCollectionOwner
    ) {
        await execute('TreasureMarketplace', { from: deployer, log: true }, 'setFee', fee, feeWithCollectionOwner);
    }

    const areBidsActive = await read('TreasureMarketplace', 'areBidsActive');
    if (!areBidsActive) {
        await execute('TreasureMarketplace', { from: deployer, log: true }, 'toggleAreBidsActive');
    }

    // Grep the admin role identifier.
    const TREASURE_MARKETPLACE_ADMIN_ROLE = await read('TreasureMarketplace', 'TREASURE_MARKETPLACE_ADMIN_ROLE');

    // If newOwner is not an admin, grant admin role to newOwner.
    if (!(await read('TreasureMarketplace', 'hasRole', TREASURE_MARKETPLACE_ADMIN_ROLE, newOwner))) {
        await execute(
            'TreasureMarketplace',
            { from: deployer, log: true },
            'grantRole',
            TREASURE_MARKETPLACE_ADMIN_ROLE,
            newOwner,
        );
    }

    const DefaultProxyAdmin = await deployments.get('DefaultProxyAdmin');

    const entries = [
        { name: 'TreasureMarketplace.address', value: treasureMarketplace.address },
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
        { name: 'TreasureMarketplace.areBidsActive()', value: await read('TreasureMarketplace', 'areBidsActive') },
        { name: 'MAGIC address', value: await read('TreasureMarketplace', 'paymentToken') },
        { name: 'WETH address', value: await read('TreasureMarketplace', 'weth') },
    ];

    console.log(`---- TreasureMarketplace Config ----`);
    console.table(entries);
};
export default func;
func.tags = ['TreasureMarketplace'];
