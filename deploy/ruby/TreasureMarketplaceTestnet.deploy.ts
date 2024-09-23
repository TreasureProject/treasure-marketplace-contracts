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
    const magicAddress = '0x0000000000000000000000000000000000000001';
    const wethAddress = '0x280dcEd23Df559218B4767E7CBA8de166B3C68a6';

    // Deploy/upgrade the Treasure marketplace contract.
    const treasureMarketplace = await deploy('TreasureMarketplaceTestnet', {
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
    const wethAddressFromContract = await read('TreasureMarketplaceTestnet', 'weth');
    if (wethAddress.toLowerCase() !== wethAddressFromContract.toLowerCase()) {
        await execute('TreasureMarketplaceTestnet', { from: deployer, log: true }, 'setWeth', wethAddress);
    }

    const paymentTokenFromContract = await read('TreasureMarketplaceTestnet', 'paymentToken');
    if (magicAddress.toLowerCase() !== paymentTokenFromContract.toLowerCase()) {
        await execute('TreasureMarketplaceTestnet', { from: deployer, log: true }, 'setPaymentToken', magicAddress);
    }

    // Set the DAO fees (w/o and w/ collection owner) in the contract.
    const feeFromContract = await read('TreasureMarketplaceTestnet', 'fee');
    const feeWithCollectionOwnerFromContract = await read('TreasureMarketplaceTestnet', 'feeWithCollectionOwner');
    if (
        feeFromContract.toNumber() !== fee ||
        feeWithCollectionOwnerFromContract.toNumber() !== feeWithCollectionOwner
    ) {
        await execute(
            'TreasureMarketplaceTestnet',
            { from: deployer, log: true },
            'setFee',
            fee,
            feeWithCollectionOwner,
        );
    }

    const areBidsActive = await read('TreasureMarketplaceTestnet', 'areBidsActive');
    if (!areBidsActive) {
        await execute('TreasureMarketplaceTestnet', { from: deployer, log: true }, 'toggleAreBidsActive');
    }

    // Grep the admin role identifier.
    const TREASURE_MARKETPLACE_ADMIN_ROLE = await read('TreasureMarketplaceTestnet', 'TREASURE_MARKETPLACE_ADMIN_ROLE');

    // If newOwner is not an admin, grant admin role to newOwner.
    if (!(await read('TreasureMarketplaceTestnet', 'hasRole', TREASURE_MARKETPLACE_ADMIN_ROLE, newOwner))) {
        await execute(
            'TreasureMarketplaceTestnet',
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
            value: await read('TreasureMarketplaceTestnet', 'hasRole', TREASURE_MARKETPLACE_ADMIN_ROLE, newOwner),
        },
        {
            name: `TreasureMarketplace.hasRole(${deployer})`,
            value: await read('TreasureMarketplaceTestnet', 'hasRole', TREASURE_MARKETPLACE_ADMIN_ROLE, deployer),
        },
        {
            name: `TreasureMarketplace.feeReceipient()`,
            value: await read('TreasureMarketplaceTestnet', 'feeReceipient'),
        },
        { name: `TreasureMarketplace.fee()`, value: (await read('TreasureMarketplaceTestnet', 'fee')).toNumber() },
        {
            name: 'TreasureMarketplace.areBidsActive()',
            value: await read('TreasureMarketplaceTestnet', 'areBidsActive'),
        },
        { name: 'MAGIC address', value: await read('TreasureMarketplaceTestnet', 'paymentToken') },
        { name: 'WETH address', value: await read('TreasureMarketplaceTestnet', 'weth') },
    ];

    console.log(`---- TreasureMarketplaceTestnet Config ----`);
    console.table(entries);
};
export default func;
func.tags = ['TreasureMarketplaceTestnet'];
