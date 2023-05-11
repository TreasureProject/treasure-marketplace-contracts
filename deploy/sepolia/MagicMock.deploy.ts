import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, execute, read } = deployments;
    const { deployer } = await getNamedAccounts();

    const magicMock = await deploy('MagicMock', {
        from: deployer,
        log: true,
    });

    console.log(`---- MagicMock Config ----`);
    const entries = [
        { name: 'MagicMock address', value: magicMock.address },
    ];
    console.table(entries);
};
export default func;
func.tags = ['MagicMock'];
