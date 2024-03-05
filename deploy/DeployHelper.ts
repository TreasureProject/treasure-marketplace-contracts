import { ethers } from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

export const getDeployConfig = async (
    hre: HardhatRuntimeEnvironment,
    contractName: string,
): Promise<{ name: string; value: string }[]> => {
    const ret: { name: string; value: string }[] = [];
    const contract = await hre.deployments.getOrNull(contractName);
    if (contract) {
        ret.push({
            name: `${contractName} Address`,
            value: contract.address,
        });
        if (contract.implementation) {
            ret.push({
                name: `${contractName} Impl Address`,
                value: contract.implementation,
            });
        }
    }
    return ret;
};

export const getRoleWithName = (name: string): string => ethers.id(name);

export const setRoleIfNeeded = async (
    hre: HardhatRuntimeEnvironment,
    contract: string,
    role: string,
    ...args: any[]
): Promise<void> => {
    const { deployer } = await hre.getNamedAccounts();
    for (let i = 0; i < args.length; i += 1) {
        const address = args[i];
        if (address !== '') {
            const isDeployerRoleGranterOrOwner =
                (await hre.deployments.read(contract, 'hasRole', getRoleWithName('ROLE_GRANTER'), deployer)) ||
                (await hre.deployments.read(contract, 'hasRole', getRoleWithName('OWNER'), deployer));
            if (
                isDeployerRoleGranterOrOwner &&
                !(await hre.deployments.read(contract, 'hasRole', getRoleWithName(role), address))
            ) {
                await hre.deployments.execute(
                    contract,
                    { from: deployer, log: true },
                    `grantRole`,
                    getRoleWithName(role),
                    address,
                );
            } else if (!isDeployerRoleGranterOrOwner) {
                console.log();
                console.log(
                    `SKIPPED GRANTING ROLE BECAUSE THE DEPLOYER CANNOT GRANT ROLES\n${JSON.stringify(
                        {
                            deployer,
                            role,
                            address,
                        },
                        null,
                        3,
                    )}`,
                );
                console.log();
            }
        }
    }
};

