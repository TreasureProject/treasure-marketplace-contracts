import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, execute, read } = deployments;
    const { deployer } = await getNamedAccounts();

    const magicEthereum = "0xB0c7a3Ba49C7a6EaBa6cD4a96C55a1391070Ac9A"; // L1 MAGIC
    const fee = 500; // 5%
    const feeWithCollectionOwner = 250; // 2.5%
    const feeRecipient = "0xEc834bD1F492a8Bd5aa71023550C44D4fB14632A"; // L1 Treasure Treasury Multisig
    const newOwner = "0xB013ABD83F0bD173E9F14ce7d6e420Ad711483b4";
    const newProxyOwner = "0xB013ABD83F0bD173E9F14ce7d6e420Ad711483b4";
    const wethAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // L1 WETH address
    const nftApprovedList = [
    //   {
    //     name: "treasurebags",
    //     address: "0xf3DFbE887D81C442557f7a59e3a0aEcf5e39F6aa",
    //     status: 2,
    //   },
    //   {
    //     name: "treasures_unraveled",
    //     address: "0xD0eD73b33789111807BD64aE2a6E1e6f92f986f5",
    //     status: 2,
    //   },
    ]

    const treasureMarketplace = await deploy('TreasureMarketplace', {
      from: deployer,
      log: true,
      proxy: {
        owner: newProxyOwner,
        proxyContract: 'OpenZeppelinTransparentProxy',
        execute: {
          init: {
            methodName: "initialize",
            args: [fee, feeRecipient, magicEthereum]
          }
        }
      }
    });

    const wethFromContract = await read('TreasureMarketplace', 'weth');
    if(wethAddress !== wethFromContract) {
        await execute(
            'TreasureMarketplace',
            { from: deployer, log: true },
            'setWeth',
            wethAddress
          );
    }

    for (const nft of nftApprovedList) {
    //   if ((await read('TreasureMarketplace', 'tokenApprovals', nft.address)) == 0) {
    //     console.log('setting:', nft.name, nft.address);
    //     await execute(
    //       'TreasureMarketplace',
    //       { from: deployer, log: true },
    //       'setTokenApprovalStatus',
    //       nft.address,
    //       nft.status
    //     );
    //   }
    }

    if(!(await read('TreasureMarketplace', 'areBidsActive'))) {
        await execute(
            'TreasureMarketplace',
            { from: deployer, log: true },
            'toggleAreBidsActive'
          );
    }

    const TREASURE_MARKETPLACE_ADMIN_ROLE = await read('TreasureMarketplace', 'TREASURE_MARKETPLACE_ADMIN_ROLE');

    if(!(await read('TreasureMarketplace', 'hasRole', TREASURE_MARKETPLACE_ADMIN_ROLE, newOwner))) {
      await execute(
        'TreasureMarketplace',
        { from: deployer, log: true },
        'grantRole',
        TREASURE_MARKETPLACE_ADMIN_ROLE,
        newOwner
      );
    }

    // if new owner is set, remove original owner
    if(await read('TreasureMarketplace', 'hasRole', TREASURE_MARKETPLACE_ADMIN_ROLE, deployer) && newOwner != deployer) {
      await execute(
        'TreasureMarketplace',
        { from: deployer, log: true },
        'renounceRole',
        TREASURE_MARKETPLACE_ADMIN_ROLE,
        deployer
      );
    }

    const feeFromContract = await read('TreasureMarketplace', 'fee');
    const feeWithCollectionOwnerFromContrat = await read('TreasureMarketplace', 'feeWithCollectionOwner');
    if(feeFromContract.toNumber() != fee || feeWithCollectionOwnerFromContrat.toNumber() != feeWithCollectionOwner) {
        await execute(
            'TreasureMarketplace',
            { from: deployer, log: true },
            'setFee',
            fee,
            feeWithCollectionOwner
          );
    }

    const DefaultProxyAdmin = await deployments.get('DefaultProxyAdmin');

    const entries = [
      { name: 'DefaultProxyAdmin.address', value: DefaultProxyAdmin.address },
      { name: 'DefaultProxyAdmin.getProxyAdmin("TreasureMarketplace")', value: await read('DefaultProxyAdmin', 'getProxyAdmin', treasureMarketplace.address) },
      { name: 'DefaultProxyAdmin.owner()', value: await read('DefaultProxyAdmin', 'owner') },
      { name: `TreasureMarketplace.hasRole(${newOwner})`, value: await read('TreasureMarketplace', 'hasRole', TREASURE_MARKETPLACE_ADMIN_ROLE, newOwner) },
      { name: `TreasureMarketplace.hasRole(${deployer})`, value: await read('TreasureMarketplace', 'hasRole', TREASURE_MARKETPLACE_ADMIN_ROLE, deployer) },
      { name: `TreasureMarketplace.feeReceipient()`, value: await read('TreasureMarketplace', 'feeReceipient') },
      { name: `TreasureMarketplace.fee()`, value: (await read('TreasureMarketplace', 'fee')).toNumber() },
    ];

    console.log(`---- TreasureMarketplace Config ----`);
    console.table(entries);
};
export default func;
func.tags = ['marketplace'];
