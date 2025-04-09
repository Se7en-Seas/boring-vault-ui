import { type Provider, keccak256, toUtf8Bytes } from 'ethers';

export async function hasPermitFunction(provider: Provider, contractAddress: string): Promise<boolean> {
    const permitSignature = 'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)';
    const permitSelector = keccak256(toUtf8Bytes(permitSignature)).slice(2, 10);

    const permiteSignatureDai = 'permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)';
    const permiteSelectorDai = keccak256(toUtf8Bytes(permiteSignatureDai)).slice(2, 10);

    try {
        const contractByteCode = await provider.getCode(contractAddress);
        return contractByteCode.includes(permitSelector) || contractByteCode.includes(permiteSelectorDai);
    } catch (error) {
        console.error(`Error checking permit function for address ${contractAddress}:`, error);
        return false;
    }
}
