import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, execute, read } = deployments;
    const { deployer } = await getNamedAccounts();

    await deploy('TreasureMarketplaceBuyer', {
      from: deployer,
      log: true,
      args: [(await deployments.get("TreasureMarketplace")).address]
    })
};

export default func;
func.tags = ['TreasureMarketplaceBuyer'];
