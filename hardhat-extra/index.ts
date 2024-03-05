import { extendConfig, extendEnvironment } from 'hardhat/config';
import { BackwardsCompatibilityProviderAdapter } from 'hardhat/internal/core/providers/backwards-compatibility';
import { AutomaticGasProvider, AutomaticGasPriceProvider } from 'hardhat/internal/core/providers/gas-providers';
import { HttpProvider } from 'hardhat/internal/core/providers/http';
import { HttpNetworkConfig, HardhatConfig, HardhatUserConfig } from 'hardhat/types';
import { KmsSigner } from './kms-signer';
import './type-extensions';

extendConfig((configIn: HardhatConfig, userConfig: Readonly<HardhatUserConfig>) => {
    const config = configIn;

    // Copy the kmsKeyId to the individual network config.
    Object.entries(userConfig.networks ?? [])
        .filter(([networkName]) => networkName !== 'hardhat')
        .forEach(([networkName, network]) => {
            if (network?.kmsKeyId) {
                if (network.accounts) {
                    throw new Error(`Network config 'account' field must be undefined if using 'kmsKeyId'.`);
                }
                config.networks[networkName].kmsKeyId = network?.kmsKeyId;
            }
        });
});

extendEnvironment((hreIn) => {
    const hre = hreIn;
    const networkConfig = hre.network.config as HttpNetworkConfig;
    if (networkConfig.kmsKeyId) {
        // Override the provider with a KmsSigner.
        hre.network.provider = new BackwardsCompatibilityProviderAdapter(
            new AutomaticGasPriceProvider(
                new AutomaticGasProvider(
                    new KmsSigner(
                        networkConfig.kmsKeyId,
                        new HttpProvider(
                            networkConfig.url ?? '',
                            hre.network.name,
                            networkConfig.httpHeaders,
                            networkConfig.timeout,
                        ),
                    ),
                    networkConfig.gasMultiplier,
                ),
            ),
        );
    }
});
