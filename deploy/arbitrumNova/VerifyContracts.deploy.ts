import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const isUnitTests = hre.network.name === "hardhat";

    if (isUnitTests) {
        return;
    }

    const apiKey = process.env.NOVA_ARBISCAN_API_KEY;
    if (!apiKey) {
        throw new Error(`NOVA_ARBISCAN_API_KEY was undefined`);
    }

    try {
        switch (hre.network.name) {
            case 'arbitrumNova':
                await hre.run("etherscan-verify", {"apiKey": apiKey, "apiUrl": "https://api-nova.arbiscan.io", sleep: true});
                break;
            default:
                await hre.run("etherscan-verify");
                break;
        }
    } catch (error) {
        console.log(`Error verifying: ${error}`);
    }
    
};
export default func;
func.tags = ['verify'];
func.dependencies = [];
func.runAtTheEnd = true;
