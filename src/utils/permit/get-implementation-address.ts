import { hexStripZeros } from '@ethersproject/bytes';
import { Provider, getAddress } from 'ethers';

export async function getImplementationAddress(provider: Provider, proxyAddress: string): Promise<string | null> {
    const contractByteCode = await provider.getCode(proxyAddress);

    if (contractByteCode.startsWith('0x363d3d373d3d3d363d73')) {
        const endSequence = '5af43d82803e903d91602b57fd5bf3';
        const endSequenceIndex = contractByteCode.indexOf(endSequence);

        if (endSequenceIndex > -1) {
            const implementationAddress = '0x' + contractByteCode.substring(endSequenceIndex - 40, endSequenceIndex);
            return getAddress(implementationAddress);
        }
    }

    const storageSlots = [
        '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc', // EIP-1967
        '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3'  // OpenZeppelin
    ];

    for (const slot of storageSlots) {
        try {
            const implementationAddress = await provider.getStorage(proxyAddress, slot);
            if (implementationAddress !== '0x0000000000000000000000000000000000000000') {
                return getAddress(hexStripZeros(implementationAddress));
            }
        } catch (error) {
            continue;
        }
    }

    return null;
}
