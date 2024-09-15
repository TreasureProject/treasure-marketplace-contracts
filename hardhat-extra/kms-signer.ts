import { KMS } from '@aws-sdk/client-kms';
import { ethers } from 'ethers';
import * as asn1 from 'asn1-ts';
import { rpcTransactionRequest } from 'hardhat/internal/core/jsonrpc/types/input/transactionRequest';
import { validateParams } from 'hardhat/internal/core/jsonrpc/types/input/validation';
import { ProviderWrapperWithChainId } from 'hardhat/internal/core/providers/chainId';
import { EIP1193Provider, RequestArguments } from 'hardhat/types';
import { HardhatError } from 'hardhat/internal/core/errors';
import { ERRORS } from 'hardhat/internal/core/errors-list';

const assert: (value: any, errorMessage: string) => asserts value = (
    value: any,
    errorMessage: string,
): asserts value => {
    if (!value) {
        throw new Error(errorMessage);
    }
};

/**
 * CONSTANTS AND DECODERS
 */
const secp256k1 = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');

const decodeEcdsaPublicKey = (bytes: Uint8Array): { algorithm: string; parameters: string; publicKey: Uint8Array } => {
    const element = new asn1.DERElement();
    element.fromBytes(bytes);

    // Refer to https://datatracker.ietf.org/doc/html/rfc5480#section-2 for
    // the ECDSA public key's ASN1 format.
    const algorithm = element.sequence[0].sequence[0].objectIdentifier.toString();
    const parameters = element.sequence[0].sequence[1].objectIdentifier.toString();
    const publicKeyBitString = element.sequence[1].bitString;

    // Convert the bit array into a byte array.
    const publicKeyTemp = publicKeyBitString.reduce(
        (acc: Uint8Array, bit, index) => {
            // eslint-disable-next-line no-bitwise
            acc[index >> 3] += bit << (7 - (index & 0x7));
            return acc;
        },
        new Uint8Array(publicKeyBitString.length / 8),
    );

    // Remove the leading 0x04 byte per https://datatracker.ietf.org/doc/html/rfc5480#section-2.2.
    const publicKey = publicKeyTemp.slice(1);

    return {
        algorithm,
        parameters,
        publicKey,
    };
};

const decodeEcdsaSignature = (bytes: Uint8Array): { r: bigint; s: bigint } => {
    const element = new asn1.DERElement();
    element.fromBytes(bytes);

    // Refer to https://datatracker.ietf.org/doc/html/rfc3279#section-2.2.3 for
    // the ECDSA signature's ASN1 format.
    const r = BigInt(element.sequence[0].integer);
    const s = BigInt(element.sequence[1].integer);

    return { r, s };
};

const toHex = (value: string | Buffer): string => (typeof value === 'string' ? `0x${value}` : ethers.hexlify(value));

/**
 * KMS SIGNER
 */
/* eslint-disable no-underscore-dangle */
export class KmsSigner extends ProviderWrapperWithChainId {
    readonly kms: KMS;

    readonly keyId: string;

    address: string | undefined;

    constructor(keyId: string, provider: EIP1193Provider) {
        super(provider);

        assert(process.env.AWS_PROFILE, `Must define environment variable AWS_PROFILE.`);
        assert(process.env.AWS_REGION, `Must define environment variable AWS_REGION.`);
        this.kms = new KMS({ region: process.env.AWS_REGION });
        this.keyId = keyId;
    }

    async getAddress(): Promise<string> {
        // If needed, cache the ethereum address.
        if (!this.address) {
            // Fetch public key from KMS and ASN1-decode it.
            const { PublicKey: kmsPublicKey } = await this.kms.getPublicKey({ KeyId: this.keyId });
            assert(kmsPublicKey, 'KMS PublicKey was unavailable.');

            // Hash the key, keep the last 20 bytes, normalize to checksum form.
            const { publicKey } = decodeEcdsaPublicKey(kmsPublicKey);
            this.address = ethers.getAddress(`0x${ethers.keccak256(publicKey).slice(-40)}`);
        }
        return this.address;
    }

    async getNonce(address: string): Promise<number> {
        const response = await this._wrappedProvider.request({
            method: 'eth_getTransactionCount',
            params: [address, 'pending'],
        });

        return Number(response);
    }

    // The message hash is a 32-byte hex string with a leading '0x'.
    async signMessageHash(messageHash: string): Promise<string> {
        // KMS-sign the message digest.
        const { Signature: kmsSignature } = await this.kms.sign({
            Message: ethers.getBytes(messageHash),
            MessageType: 'DIGEST',
            KeyId: this.keyId,
            SigningAlgorithm: 'ECDSA_SHA_256',
        });
        assert(kmsSignature, 'KMS Signature was unavailable.');

        // Finalize r and s. Per EIP-2, if s is too big, flip it to the other side of the curve.
        const { r: rTemp, s: sTemp } = decodeEcdsaSignature(kmsSignature);
        const r = `0x${rTemp.toString(16)}`;
        const s = `0x${(sTemp > secp256k1 / 2n ? secp256k1 - sTemp : sTemp).toString(16)}`;

        // Determine v by comparing candidate addresses with the expected address.
        const address = await this.getAddress();
        const addressFromV27 = ethers.recoverAddress(messageHash, { r, s, v: 27 });
        const addressFromV28 = ethers.recoverAddress(messageHash, { r, s, v: 28 });
        const v = address === addressFromV27 ? 27 : 28;
        assert(
            v !== 28 || address === addressFromV28,
            `Expected address ${address} but got ${addressFromV27} (v = 27) and ${addressFromV28} (v = 28).`,
        );

        return ethers.Signature.from({ v, r, s }).serialized;
    }

    async request(args: RequestArguments): Promise<unknown> {
        const { method } = args;
        const params = this._getParams(args);
        const sender = await this.getAddress();

        if (method === 'eth_sendTransaction') {
            // Populate transaction arguments.
            const [txRequest] = validateParams(params, rpcTransactionRequest);
            const hasGasPrice = txRequest.gasPrice !== undefined;
            const hasEip1559Fields =
                txRequest.maxFeePerGas !== undefined || txRequest.maxPriorityFeePerGas !== undefined;
            if (!hasGasPrice && !hasEip1559Fields) {
                throw new HardhatError(ERRORS.NETWORK.MISSING_FEE_PRICE_FIELDS);
            }
            if (hasGasPrice && hasEip1559Fields) {
                throw new HardhatError(ERRORS.NETWORK.INCOMPATIBLE_FEE_PRICE_FIELDS);
            }

            const tx: ethers.Transaction = ethers.Transaction.from({
                chainId: await this._getChainId(),
                gasLimit: txRequest.gas,
                gasPrice: txRequest.gasPrice,
                maxFeePerGas: txRequest.maxFeePerGas,
                maxPriorityFeePerGas: txRequest.maxPriorityFeePerGas,
                nonce: txRequest.nonce ? Number(txRequest.nonce) : await this.getNonce(sender),
                value: txRequest.value,
                to: txRequest.to ? toHex(txRequest.to) : undefined,
                data: txRequest.data ? toHex(txRequest.data) : undefined,
                from: null,
            });

            // Sign and pass on to the wrapped provider.
            tx.signature = ethers.Signature.from(await this.signMessageHash(tx.unsignedHash));

            return this._wrappedProvider.request({
                method: 'eth_sendRawTransaction',
                params: [tx.serialized],
            });
        }

        if (method === 'eth_signTypedData_v4') {
            const {
                domain,
                types: typesRaw,
                primaryType,
                message,
            }: {
                domain: ethers.TypedDataDomain;
                types: Record<string, Array<ethers.TypedDataField>>;
                primaryType?: string;
                message: Record<string, any>;
            } = JSON.parse(params[1]);

            // If primaryType is defined, traverse the types graph starting at primaryType
            // to find all required types for the signature (ethers will throw an error if
            // any unused types are included).
            //
            // If primaryType is not defined, just use the provided types as-is.
            let types: Record<string, Array<ethers.TypedDataField>> = typesRaw;
            if (primaryType) {
                types = {}; // Reset and reconstruct.
                let typesToVerify = [primaryType];
                while (typesToVerify.length) {
                    const nextTypesToVerify: Set<string> = new Set();

                    typesToVerify.forEach((typeName) => {
                        const typeValue = typesRaw[typeName];

                        if (typeValue) {
                            // The typeName is a valid, so include it in the final types.
                            types[typeName] = typeValue;

                            // Include the subfield types among the types to verify in the next round.
                            Object.values(typeValue).forEach(({ type }) => nextTypesToVerify.add(type));
                        }
                    });

                    assert(
                        !nextTypesToVerify.has(primaryType),
                        `Cycle detected in types: ${JSON.stringify(types, null, 4)}`,
                    );

                    typesToVerify = Array.from(nextTypesToVerify);
                }
            }

            const signature = await this.signMessageHash(ethers.TypedDataEncoder.hash(domain, types, message));
            return signature;
        }

        if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
            return [sender];
        }

        return this._wrappedProvider.request(args);
    }
}
/* eslint-enable no-underscore-dangle */
