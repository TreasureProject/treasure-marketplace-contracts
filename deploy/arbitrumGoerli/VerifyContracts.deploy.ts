import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    let isUnitTests = hre.network.name === "hardhat";

    if(isUnitTests) {
        return;
    }

    const apiKey = process.env.ETHERSCAN_API_KEY;

    try {
        switch (hre.network.name) {
            case 'arbitrumGoerli':
                await hre.run("etherscan-verify", {"apiKey": apiKey, "apiUrl": "https://api-goerli.arbiscan.io", sleep: true});
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
func.tags = ['VerifyContracts'];
func.dependencies = [];
func.runAtTheEnd = true;
