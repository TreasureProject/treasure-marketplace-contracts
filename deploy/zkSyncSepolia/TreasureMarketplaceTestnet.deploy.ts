import * as hre from 'hardhat';
import { Deployer } from '@matterlabs/hardhat-zksync-deploy';
import { Provider, Wallet } from 'zksync-ethers';
import { TreasureMarketplaceTestnet } from '../../typechain-types';

const func = async () => {
    const wallet = getWallet();

    const deployer = new Deployer(hre, wallet);

    // Constants for this deploy script.
    const fee = 500n; // 5%
    const feeWithCollectionOwner = 250n; // 2.5%
    const feeReceipient = '0xd9F1E68fD5b9749ABc8C87241DDDA171baa0d791';
    const newOwner = '0xd9F1E68fD5b9749ABc8C87241DDDA171baa0d791';
    const magicAddress = '0x0000000000000000000000000000000000000001';
    const wethAddress = '0x280dcEd23Df559218B4767E7CBA8de166B3C68a6';

    const contractName = 'TreasureMarketplaceTestnet';

    const contract = await deployer.loadArtifact(contractName);
    const marketplace = (await hre.zkUpgrades.deployProxy(
        deployer.zkWallet,
        contract,
        [fee, feeReceipient, magicAddress],
        {
            initializer: 'initialize',
        },
    )) as unknown as TreasureMarketplaceTestnet;
    await marketplace.waitForDeployment();

    // Set the WETH address in the marketplace contracted if needed.
    const wethAddressFromContract = await marketplace.weth();
    if (wethAddress.toLowerCase() !== wethAddressFromContract.toLowerCase()) {
        await marketplace.setWeth(wethAddress);
    }

    const paymentTokenFromContract = await marketplace.paymentToken();
    if (magicAddress.toLowerCase() !== paymentTokenFromContract.toLowerCase()) {
        await marketplace.setPaymentToken(magicAddress);
    }

    // Set the DAO fees (w/o and w/ collection owner) in the contract.
    const feeFromContract = await marketplace.fee();
    const feeWithCollectionOwnerFromContract = await marketplace.feeWithCollectionOwner();
    if (feeFromContract !== fee || feeWithCollectionOwnerFromContract !== feeWithCollectionOwner) {
        await marketplace.setFee(fee, feeWithCollectionOwner);
    }

    const areBidsActive = await marketplace.areBidsActive();
    if (!areBidsActive) {
        await marketplace.toggleAreBidsActive();
    }

    // Grep the admin role identifier.
    const TREASURE_MARKETPLACE_ADMIN_ROLE = await marketplace.TREASURE_MARKETPLACE_ADMIN_ROLE();
    // If newOwner is not an admin, grant admin role to newOwner.
    if (!(await marketplace.hasRole(TREASURE_MARKETPLACE_ADMIN_ROLE, newOwner))) {
        await marketplace.grantRole(TREASURE_MARKETPLACE_ADMIN_ROLE, newOwner);
    }

    const defaultProxyAdmin = await hre.zkUpgrades.admin.getInstance(wallet);

    const entries = [
        { name: 'TreasureMarketplace.address', value: marketplace.getAddress() },
        { name: 'DefaultProxyAdmin.address', value: await defaultProxyAdmin.getAddress() },
        {
            name: 'DefaultProxyAdmin.getProxyAdmin("TreasureMarketplace")',
            value: await defaultProxyAdmin.getProxyAdmin(await marketplace.getAddress()),
        },
        { name: 'DefaultProxyAdmin.owner()', value: await defaultProxyAdmin.owner() },
        {
            name: `TreasureMarketplace.hasRole(${newOwner})`,
            value: await marketplace.hasRole(TREASURE_MARKETPLACE_ADMIN_ROLE, newOwner),
        },
        {
            name: `TreasureMarketplace.hasRole(${deployer})`,
            value: await marketplace.hasRole(TREASURE_MARKETPLACE_ADMIN_ROLE, deployer.zkWallet.address),
        },
        {
            name: `TreasureMarketplace.feeReceipient()`,
            value: await marketplace.feeReceipient(),
        },
        { name: `TreasureMarketplace.fee()`, value: await marketplace.fee() },
        {
            name: 'TreasureMarketplace.areBidsActive()',
            value: await marketplace.areBidsActive(),
        },
        { name: 'MAGIC address', value: await marketplace.paymentToken() },
        { name: 'WETH address', value: await marketplace.weth() },
    ];

    console.log(`---- TreasureMarketplaceTestnet Config ----`);
    console.table(entries);
};

export const getProvider = () => {
    const rpcUrl = hre.network.config.url;
    if (!rpcUrl)
        throw Error(
            `⛔️ RPC URL wasn't found in "${hre.network.name}"! Please add a "url" field to the network config in hardhat.config.ts`,
        );

    // Initialize ZKsync Provider
    const provider = new Provider(rpcUrl);

    return provider;
};

export const getWallet = (privateKey?: string) => {
    const provider = getProvider();

    // Initialize ZKsync Wallet
    const wallet = new Wallet(privateKey ?? process.env.WALLET_PRIVATE_KEY!, provider);

    return wallet;
};

export default func;
