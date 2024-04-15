import 'dotenv/config';
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomicfoundation/hardhat-ethers';
import '@nomicfoundation/hardhat-foundry';
import '@nomicfoundation/hardhat-verify';
import 'hardhat-contract-sizer';
import 'hardhat-deploy';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import { HardhatUserConfig } from 'hardhat/types';
import './hardhat-extra';

// Prod deployer: 0x086a11794a945fb10a6199cca4e0d7ff6d25513b
const prodKmsKey = 'arn:aws:kms:us-east-1:884078395586:key/mrk-d163b366670f455fa8a9df6d1854d5be';

// Dev deployer: 0xc51f27cf93531be66671dd0543cf22b475d00873
const devKmsKey = 'arn:aws:kms:us-east-1:665230337498:key/mrk-5a1618d2c69c4986b414b617fac6bfd1';

const config: HardhatUserConfig = {
    defaultNetwork: 'hardhat',
    networks: {
        hardhat: {
            forking: {
                enabled: process.env.FORKING === 'true',
                url: `${process.env.ARBITRUM_SEPOLIA_URL}`,
                blockNumber: parseInt(process.env.FORKING_BLOCK || '12821000', 10),
            },
            live: false,
            saveDeployments: true,
            tags: ['test', 'local'],
            chainId: 1337,
        },
        localhost: {
            url: 'http://localhost:8545',
            chainId: 61337,
        },
        mainnet: {
            url: `${process.env.ETHEREUM_MAINNET_URL}`,
            kmsKeyId: prodKmsKey,
            chainId: 1,
            live: true,
            saveDeployments: true,
            gasMultiplier: 2,
            deploy: ['deploy/mainnet'],
        },
        sepolia: {
            url: `${process.env.SEPOLIA_URL}`,
            kmsKeyId: devKmsKey,
            chainId: 11155111,
            live: false,
            saveDeployments: true,
            gasMultiplier: 2,
            deploy: ['deploy/sepolia'],
        },
        arbitrum: {
            url: `${process.env.ARBITRUM_MAINNET_URL}`,
            kmsKeyId: prodKmsKey,
            chainId: 42161,
            live: true,
            saveDeployments: true,
            gasMultiplier: 2,
            deploy: ['deploy/arbitrum'],
        },
        arbitrumNova: {
            url: `${process.env.ARBITRUM_NOVA_URL}`,
            kmsKeyId: prodKmsKey,
            chainId: 42170,
            live: true,
            saveDeployments: true,
            gasMultiplier: 2,
            deploy: ['deploy/arbitrumNova'],
        },
        arbitrumSepolia: {
            url: `${process.env.ARBITRUM_SEPOLIA_URL}`,
            kmsKeyId: devKmsKey,
            chainId: 421614,
            live: false,
            saveDeployments: true,
            gasMultiplier: 2,
            deploy: ['deploy/arbitrumSepolia'],
        },
    },
    solidity: {
        compilers: [
            {
                version: '0.8.12',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
            {
                version: '0.7.6',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 999999,
                    },
                },
            },
        ],
    },
    namedAccounts: {
        deployer: 0,
        staker1: 1,
        staker2: 2,
        staker3: 3,
        hacker: 4,
        admin: 5,
    },
    mocha: {
        timeout: 60000,
    },
    gasReporter: {
        currency: 'USD',
        enabled: false,
    },
    paths: {
        artifacts: 'artifacts',
        cache: 'cache',
        deploy: 'deploy/arbitrum',
        deployments: 'deployments',
        imports: 'imports',
        sources: 'contracts',
        tests: 'test',
    },
    contractSizer: {
        runOnCompile: true,
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY,
        customChains: [
            {
                network: 'arbitrumNova',
                chainId: 42170,
                urls: {
                    apiURL: 'https://api-nova.arbiscan.io/api',
                    browserURL: 'https://nova.arbiscan.io',
                },
            },
            {
                network: 'arbitrumSepolia',
                chainId: 421614,
                urls: {
                    apiURL: 'https://api-sepolia.arbiscan.io/api',
                    browserURL: 'https://sepolia.arbiscan.io',
                },
            },
        ],
    },
};

export default config;
