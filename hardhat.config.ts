import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import 'dotenv/config';
import {HardhatUserConfig} from 'hardhat/types';
import 'hardhat-deploy';
import 'hardhat-deploy-ethers';
import 'hardhat-gas-reporter';
import 'solidity-coverage';

const privateKey = process.env.DEV_PRIVATE_KEY || "4201af59da6a5aed59c21cd6542f92d7a5e34e6c3b6f8e0903766ae4edb1f894"; // address: 0xA226293acbC7817d24c4b587Bc4568e4D624612E
const INFURA_ID = process.env.INFURA_ID;
const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      forking: {
        enabled: process.env.FORKING === "true",
        url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
        blockNumber: 13334370
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
      gasMultiplier: 2
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
      url: "https://arb1.arbitrum.io/rpc",
      accounts: [`${privateKey}`],
      chainId: 42161,
      live: true,
      saveDeployments: true,
      gasMultiplier: 2,
      deploy: ["deploy/arbitrum"]
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
    ],
  },
  namedAccounts: {
    deployer: 0,
    staker1: 1,
    staker2: 2,
    staker3: 3,
    hacker: 4
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
  }
};

export default config;
