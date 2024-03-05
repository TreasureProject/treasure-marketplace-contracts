import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, execute, read } = deployments;
    const { deployer } = await getNamedAccounts();

    // Constants for this deploy script.
    const oldOwner = '0x33117a2843495E4d103bE35fFFf926c4cd988e10';

    const newProxyAdmin = '0xd9F1E68fD5b9749ABc8C87241DDDA171baa0d791';
    const newOwner = '0xd9F1E68fD5b9749ABc8C87241DDDA171baa0d791';
    const newFeeRecipient = '0x9B7c4B3EdC8e8cd7741E8a213723b5EF1bdBA64A';

    // Get existing deployments.
    const DefaultProxyAdmin = await deployments.get('DefaultProxyAdmin');
    const treasureMarketplace = await deployments.get('TreasureMarketplace');

    // Set new fee recipient.
    const currentFeeRecipient = await read('TreasureMarketplace', 'feeReceipient');
    if (currentFeeRecipient != newFeeRecipient) {
        console.log(`Updating fee recipient from ${currentFeeRecipient} to ${newFeeRecipient}.`);
        await execute('TreasureMarketplace', { from: deployer, log: true }, 'setFeeRecipient', newFeeRecipient);
    }

    // Transfer TreasureMarketplace ownership.
    const TREASURE_MARKETPLACE_ADMIN_ROLE = await read('TreasureMarketplace', 'TREASURE_MARKETPLACE_ADMIN_ROLE');
    if (!(await read('TreasureMarketplace', 'hasRole', TREASURE_MARKETPLACE_ADMIN_ROLE, newOwner))) {
        console.log(`Granting ADMIN role to ${newOwner}.`);
        await execute('TreasureMarketplace', { from: deployer, log: true }, 'grantRole', TREASURE_MARKETPLACE_ADMIN_ROLE, newOwner);
    }
    if (await read('TreasureMarketplace', 'hasRole', TREASURE_MARKETPLACE_ADMIN_ROLE, oldOwner)) {
        console.log(`Revoking ADMIN role from ${oldOwner}.`);
        await execute('TreasureMarketplace', { from: deployer, log: true }, 'revokeRole', TREASURE_MARKETPLACE_ADMIN_ROLE, oldOwner);
    }

    // Transfer ProxyAdmin ownership.
    const currentProxyAdmin = await read('DefaultProxyAdmin', 'owner');
    if (currentProxyAdmin !== newProxyAdmin) {
        console.log(`Updating DefaultProxyAdmin from ${currentProxyAdmin} to ${newProxyAdmin}.`);
        await execute('DefaultProxyAdmin', { from: deployer, log: true }, 'transferOwnership', newProxyAdmin);
    }

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
func.tags = ['TransferOwnership'];
