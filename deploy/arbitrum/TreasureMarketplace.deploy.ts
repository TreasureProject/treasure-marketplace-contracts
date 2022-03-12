import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, execute, read } = deployments;
    const { deployer } = await getNamedAccounts();

    const magicArbitrum = "0x539bdE0d7Dbd336b79148AA742883198BBF60342";
    const fee = 500; // 5%
    const feeRecipient = "0xDb6Ab450178bAbCf0e467c1F3B436050d907E233";
    const newOwner = "0xB013ABD83F0bD173E9F14ce7d6e420Ad711483b4";
    const newProxyOwner = "0xB013ABD83F0bD173E9F14ce7d6e420Ad711483b4";
    const nftApprovedList = [
      {
        name: "consumable",
        address: "0xF3d00A2559d84De7aC093443bcaAdA5f4eE4165C",
        status: 2,
      },
      {
        name: "unpilgrimaged_legion",
        address: "0x658365026D06F00965B5bb570727100E821e6508",
        status: 2,
      },
      {
        name: "unpilgrimaged_legion_genesis",
        address: "0xE83c0200E93Cb1496054e387BDdaE590C07f0194",
        status: 2,
      },
      {
        name: "legion",
        address: "0xfE8c1ac365bA6780AEc5a985D989b327C27670A1",
        status: 1,
      },
      {
        name: "treasure",
        address: "0xEBba467eCB6b21239178033189CeAE27CA12EaDf",
        status: 2,
      },
      {
        name: "seed_of_life",
        address: "0x3956C81A51FeAed98d7A678d53F44b9166c8ed66",
        status: 2,
      },
      {
        name: "extra_life",
        address: "0x21e1969884D477afD2Afd4Ad668864a0EebD644c",
        status: 2,
      },
      {
        name: "keys",
        address: "0xf0a35bA261ECE4FC12870e5B7b9E7790202EF9B5",
        status: 2
      },
      {
        name: "smol_brains",
        address: "0x6325439389E0797Ab35752B4F43a14C004f22A9c",
        status: 1,
      },
      {
        name: "smol_brains_land",
        address: "0xd666d1CC3102cd03e07794A61E5F4333B4239F53",
        status: 1,
      },
      {
        name: "smol_brains_pets",
        address: "0xf6cc57c45ce730496b4d3df36b9a4e4c3a1b9754",
        status: 1,
      },
      {
        name: "smol_cars",
        address: "0xB16966daD2B5a5282b99846B23dcDF8C47b6132C",
        status: 1,
      },
      {
        name: "smol_bodies",
        address: "0x17DaCAD7975960833f374622fad08b90Ed67D1B5",
        status: 1,
      },
      {
        name: "smol_bodies_pets",
        address: "0xae0d0c4cc3335fd49402781e406adf3f02d41bca",
        status: 1,
      },
      {
        name: "smol_treasures",
        address: "0xc5295C6a183F29b7c962dF076819D44E0076860E",
        status: 2,
      },

      {
        name: "battlefly",
        address: "0x0af85a5624d24e2c6e7af3c0a0b102a28e36cea3",
        status: 1,
      },
      {
        name: "battlefly_founders",
        address: "0xc43104775bd9f6076808b5f8df6cbdbeac96d7de",
        status: 1,
      },
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
            args: [fee, feeRecipient, magicArbitrum]
          }
        }
      }
    })

    for (const nft of nftApprovedList) {
      if ((await read('TreasureMarketplace', 'tokenApprovals', nft.address)) == 0) {
        console.log('setting:', nft.name, nft.address);
        await execute(
          'TreasureMarketplace',
          { from: deployer, log: true },
          'setTokenApprovalStatus',
          nft.address,
          nft.status
        );
      }
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
