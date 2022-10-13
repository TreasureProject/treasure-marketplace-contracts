import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { keccak256, toUtf8Bytes } from "ethers/lib/utils";

export module DeployHelper {

    export async function setRoleIfNeeded(hre: HardhatRuntimeEnvironment, contract: string, role: string, ...args: any[]) {
        const { deployer } = await hre.getNamedAccounts();
        for(var i = 0; i < args.length; i++) {
            let address = args[i];
    
            if(address === "") {
                continue;
            }
    
            if(!(await hre.deployments.read(contract, 'hasRole', getRoleWithName(role), address))) {
                await hre.deployments.execute(
                    contract,
                    { from: deployer, log: true },
                    `grantRole`,
                    getRoleWithName(role),
                    address
                );
            }
        }
    }
    
    function getRoleWithName(name: string): string {
        return keccak256(toUtf8Bytes(name));
    }
}

