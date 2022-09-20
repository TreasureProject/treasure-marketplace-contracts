import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import 'dotenv/config';
import {HardhatUserConfig} from 'hardhat/types';
import 'hardhat-deploy';
import 'hardhat-deploy-ethers';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import 'hardhat-contract-sizer';

// A 32-byte private key.
const privateKey = process.env.DEV_PRIVATE_KEY;

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      forking: {
        enabled: process.env.FORKING === "true",
        url: `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
        blockNumber: 7754848
      },
      live: false,
      saveDeployments: true,
      tags: ["test", "local"],
      chainId : 1337
    },
    localhost: {
      url: "http://localhost:8545",
      chainId : 61337
    },
    rinkeby: {
      url: `https://eth-rinkeby.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [`${privateKey}`],
      chainId: 4,
      live: true,
      saveDeployments: true,
      tags: ["staging"]
    },
    kovan: {
      url: `https://eth-kovan.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [`${privateKey}`],
      chainId: 42,
      live: true,
      saveDeployments: true,
      tags: ["staging"]
    },
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [`${privateKey}`],
      chainId: 1,
      live: true,
      saveDeployments: true,
      gasMultiplier: 2,
      deploy: ["deploy/mainnet"]
    },
    polygon: {
      url: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [`${privateKey}`],
      chainId: 137,
      live: true,
      saveDeployments: true,
      gasMultiplier: 2,
    },
    arbitrum: {
      url: process.env.ARBITRUM_MAINNET_URL,
      accounts: [`${process.env.ARBITRUM_MAINNET_PK}`],
      chainId: 42161,
      live: true,
      saveDeployments: true,
      gasMultiplier: 2,
      deploy: ["deploy/arbitrum"]
    },
    arbitrumRinkeby: {
      url: process.env.ARBITRUM_TESTNET_URL,
      accounts: [`${process.env.ARBITRUM_MAINNET_PK}`],
      chainId: 421611,
      live: false,
      saveDeployments: true,
      gasMultiplier: 2,
      deploy: ["deploy/arbitrumRinkeby"]
    },
    arbitrumGoerli: {
      url: process.env.ARBITRUM_GOERLI_URL,
      accounts: [`${privateKey}`],
      chainId: 421613,
      live: false,
      saveDeployments: true,
      gasMultiplier: 2,
      deploy: ["deploy/arbitrumGoerli"]
    }
  },
  solidity: {
    compilers: [
      {
        version: "0.8.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      },
      {
        version: "0.7.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      },
    ],
  },
  namedAccounts: {
    deployer: 0,
    staker1: 1,
    staker2: 2,
    staker3: 3,
    hacker: 4,
    admin: 5
  },
  mocha: {
    timeout: 60000,
  },
  gasReporter: {
    currency: 'USD',
    enabled: false,
  },
  paths: {
    artifacts: "artifacts",
    cache: "cache",
    deploy: "deploy/arbitrum",
    deployments: "deployments",
    imports: "imports",
    sources: "contracts",
    tests: "test",
  },
  contractSizer: {
    runOnCompile: true
  },
  etherscan: {
    apiKey: {
        arbitrumGoerli: process.env.ETHERSCAN_API_KEY,
    },
    customChains: [
        {
            network: 'arbitrumGoerli',
            chainId: 421613,
            urls: {
                apiURL: 'https://goerli-rollup-explorer.arbitrum.io/api?module=contract&action=verifysourcecode',
                browserURL: 'https://goerli-rollup-explorer.arbitrum.io',
            },
        },
    ],
  },
};

export default config;
