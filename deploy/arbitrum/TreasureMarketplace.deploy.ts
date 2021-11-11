import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, execute, read } = deployments;
    const { deployer } = await getNamedAccounts();

    const magicArbitrum = "0x539bdE0d7Dbd336b79148AA742883198BBF60342";
    const fee = 500; // 5%
    const feeRecipient = "0xDb6Ab450178bAbCf0e467c1F3B436050d907E233";
    const oracle = (await deployments.get("TreasureNFTOracle")).address;
    const newOwner = feeRecipient;

    const treasureMarketplace = await deploy('TreasureMarketplace', {
      from: deployer,
      log: true,
      args: [fee, feeRecipient, oracle, magicArbitrum]
    })

    if ((await read('TreasureNFTOracle', 'owner')) != treasureMarketplace.address) {
      await execute(
        'TreasureNFTOracle',
        { from: deployer, log: true },
        'transferOwnership',
        treasureMarketplace.address
      );
    }

    if ((await read('TreasureMarketplace', 'owner')) != newOwner) {
      await execute(
        'TreasureMarketplace',
        { from: deployer, log: true },
        'transferOwnership',
        newOwner
      );
    }
};
export default func;
func.tags = ['marketplace'];
func.dependencies = ['oracle']
