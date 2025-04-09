import { ethers } from 'ethers';

/*
    SOURCE CODE -> https://github.com/felinaprotocol/permit-checker/tree/main
*/

// internals
import { hasPermitFunction } from './has-permit-function';
import { getImplementationAddress } from './get-implementation-address';

// types
import { Token } from '../../types';


export async function checkContractForPermit(provider: ethers.Provider, token: Token): Promise<{ token: string; address: string; hasPermit: string }> {
    try {
        let addressToCheck = token.address;
        const implementationAddress = await getImplementationAddress(provider, token.address);

        if (implementationAddress !== null) {
            addressToCheck = implementationAddress;
        }

        const hasPermit = await hasPermitFunction(provider, addressToCheck);
        return {
            token: `${token.displayName}`,
            address: addressToCheck,
            hasPermit: hasPermit ? 'Yes' : 'No'
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            token: `${token.displayName}`,
            address: token.address,
            hasPermit: 'Error'
        };
    }
}
