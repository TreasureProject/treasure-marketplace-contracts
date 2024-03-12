import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const isUnitTests = hre.network.name === 'hardhat';

    if (isUnitTests) {
        return;
    }

    try {
        await hre.run('etherscan-verify', { sleep: true });
    } catch (error) {
        console.log(`Error verifying: ${error}`);
    }
};
export default func;
func.tags = ['VerifyContracts'];
func.dependencies = [];
func.runAtTheEnd = true;
