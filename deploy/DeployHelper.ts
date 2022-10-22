import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { keccak256, toUtf8Bytes } from "ethers/lib/utils";

export module DeployHelper {

    export async function getDeployConfig(hre: HardhatRuntimeEnvironment, contractName: string): Promise<{ name: string, value: string}[]> {
        const ret: { name: string, value: string}[] = [];
        const contract = await hre.deployments.getOrNull(contractName);
        if(contract !== null) {
            ret.push({
                name: `${contractName} Address`,
                value: contract.address
            });
            if(contract.implementation) {
                ret.push({
                    name: `${contractName} Impl Address`,
                    value: contract.implementation
                });
            }
        }
        return ret;
    }

    export async function setRoleIfNeeded(hre: HardhatRuntimeEnvironment, contract: string, role: string, ...args: any[]) {
        const { deployer } = await hre.getNamedAccounts();
        for(var i = 0; i < args.length; i++) {
            let address = args[i];
    
            if(address === "") {
                continue;
            }
            const isDeployerRoleGranterOrOwner = 
                await hre.deployments.read(contract, 'hasRole', getRoleWithName("ROLE_GRANTER"), deployer)
                || await hre.deployments.read(contract, 'hasRole', getRoleWithName("OWNER"), deployer);
            if(isDeployerRoleGranterOrOwner && !(await hre.deployments.read(contract, 'hasRole', getRoleWithName(role), address))) {
                await hre.deployments.execute(
                    contract,
                    { from: deployer, log: true },
                    `grantRole`,
                    getRoleWithName(role),
                    address
                );
            } else if(!isDeployerRoleGranterOrOwner) {
                console.log();
                console.log(`SKIPPED GRANTING ROLE BECAUSE THE DEPLOYER CANNOT GRANT ROLES\n${JSON.stringify({
                    deployer,
                    role,
                    address
                }, null, 3)}`);
                console.log();
            }
        }
    }
    
    export function getRoleWithName(name: string): string {
        return keccak256(toUtf8Bytes(name));
    }
}

