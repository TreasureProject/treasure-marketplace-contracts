import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { DeployHelper } from '../DeployHelper';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { read, getOrNull } = deployments;
    const spacer = { name: '------------------------------', value: '----------------------------------------------', };

    // const claimer = await getOrNull('TroveClaimer');
    const badgeEntries = await DeployHelper.getDeployConfig(hre, 'TroveBadges');
    const claimerEntries = await DeployHelper.getDeployConfig(hre, 'TroveClaimer');
    if(claimerEntries.length > 0) {
        claimerEntries.push({
            name: 'TroveClaimer Validator',
            value: await read('TroveClaimer', 'validator'),
        })
    }
    const entries = [
        ...badgeEntries,
        spacer,
        ...claimerEntries
    ];

    console.log(`---- Configs ----`);
    console.table(entries);

    const settings = [
        {
            name: 'Is TroveClaimer ADMIN for Trove Badges?',
            value: await read('TroveBadges', 'hasRole',DeployHelper.getRoleWithName("ADMIN"), (await getOrNull('TroveClaimer'))?.address)
        }
    ]
    console.log(`---- Settings ----`);
    console.table(settings);
};
export default func;
func.tags = ['PrintConfigs'];
func.dependencies = [];
func.runAtTheEnd = true;
