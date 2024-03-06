import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, execute, read } = deployments;
    const { deployer } = await getNamedAccounts();

    // Constants for this deploy script.
    const fee = 500; // 5%
    const feeWithCollectionOwner = 250; // 2.5%
    const feeReceipient = '0xDb6Ab450178bAbCf0e467c1F3B436050d907E233';
    const newOwner = '0x33117a2843495E4d103bE35fFFf926c4cd988e10';
    const newProxyOwner = '0x33117a2843495E4d103bE35fFFf926c4cd988e10';
    const magicAddress = '0x88f9eFB3A7F728fdb2B8872fE994c84b1d148f65';
    const wethAddress = '0xe39Ab88f8A4777030A534146A9Ca3B52bd5D43A3';
    const nftApprovedList: {
        name: string;
        address: string;
        status: number;
    }[] = [];

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
    if (wethAddress !== wethAddressFromContract) {
        await execute('TreasureMarketplace', { from: deployer, log: true }, 'setWeth', wethAddress);
    }

    // Set the DAO fees (w/o and w/ collection owner) in the contract.
    const feeFromContract = await read('TreasureMarketplace', 'fee');
    const feeWithCollectionOwnerFromContrat = await read('TreasureMarketplace', 'feeWithCollectionOwner');
    if (feeFromContract.toNumber() !== fee || feeWithCollectionOwnerFromContrat.toNumber() !== feeWithCollectionOwner) {
        await execute('TreasureMarketplace', { from: deployer, log: true }, 'setFee', fee, feeWithCollectionOwner);
    }

    // Pre approve any collections if needed.
    for (let i = 0; i < nftApprovedList.length; i += 1) {
        const nft = nftApprovedList[i];
        if ((await read('TreasureMarketplace', 'tokenApprovals', nft.address)) === 0) {
            console.log('setting:', nft.name, nft.address);
            await execute(
                'TreasureMarketplace',
                { from: deployer, log: true },
                'setTokenApprovalStatus',
                nft.address,
                nft.status,
            );
        }
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

    // If the newOwner is different from the deploy (aka current owner), then have deploy renounce
    // its role.
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
        { name: 'MAGIC address', value: await read('TreasureMarketplace', 'paymentToken') },
        { name: 'WETH address', value: await read('TreasureMarketplace', 'weth') },
    ];

    console.log(`---- TreasureMarketplace Config ----`);
    console.table(entries);
};
export default func;
func.tags = ['marketplace'];
