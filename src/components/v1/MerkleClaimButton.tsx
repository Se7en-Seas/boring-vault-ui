import React, { useEffect } from "react";
import {
    Button,
    Modal,
    ModalOverlay,
    ModalContent,
    ModalBody,
    ModalCloseButton,
    useDisclosure,
    ButtonProps,
    ModalProps,
    ModalOverlayProps,
    ModalContentProps,
    ModalBodyProps,
    ModalCloseButtonProps,
    Text,
    VStack,
    useToast,
    ModalHeader,
    ModalFooter,
    Spinner,
} from "@chakra-ui/react";
import { useBoringVaultV1 } from "../../contexts/v1/BoringVaultContextV1";
import { useEthersSigner } from "../../hooks/ethers";
import { useAccount } from "wagmi";
import { Token } from "../../types";

interface MerkleClaimButtonProps {
    buttonText: string;
    popupText: string;
    title?: string;
    bottomText?: string;
    buttonProps?: ButtonProps;
    modalProps?: ModalProps;
    modalOverlayProps?: ModalOverlayProps;
    modalContentProps?: ModalContentProps;
    modalBodyProps?: ModalBodyProps;
    modalCloseButtonProps?: ModalCloseButtonProps;
    merkleData: {
        rootHashes: string[];
        tokens: string[];
        balances: string[];
        merkleProofs: string[][];
    };
    claimAmount: string;
    claimToken: Token;
}

const MerkleClaimButton: React.FC<MerkleClaimButtonProps> = ({
    buttonText,
    popupText,
    buttonProps,
    modalProps,
    modalOverlayProps,
    modalContentProps,
    modalBodyProps,
    modalCloseButtonProps,
    title,
    bottomText,
    merkleData,
    claimAmount,
    claimToken,
}) => {
    const { isOpen, onOpen, onClose } = useDisclosure();
    const { merkleClaim, merkleClaimStatus } = useBoringVaultV1();
    const signer = useEthersSigner();
    const { isConnected } = useAccount();

    const toast = useToast();
    useEffect(() => {
        if (merkleClaimStatus.loading) {
            toast({
                title: "Processing claim...",
                status: "info",
                duration: 5000,
                isClosable: true,
            });
        } else if (merkleClaimStatus.success) {
            toast({
                title: "Claim successful",
                description: `Transaction hash: ${merkleClaimStatus.tx_hash}`,
                status: "success",
                duration: 5000,
                isClosable: true,
            });
            onClose(); // Close modal on success
        } else if (merkleClaimStatus.error) {
            toast({
                title: "Failed to claim",
                description: merkleClaimStatus.error,
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        }
    }, [merkleClaimStatus, toast, onClose]);

    const handleClaim = async () => {
        if (!signer || !merkleData) {
            console.error("Signer or merkle data not available");
            return;
        }

        try {
            await merkleClaim(signer, merkleData);
        } catch (error) {
            console.error("Error during claim:", error);
        }
    };

    return (
        <>
            <Button
                onClick={onOpen}
                isDisabled={!isConnected || !merkleData || merkleClaimStatus.loading}
                {...buttonProps}
            >
                {buttonText}
            </Button>
            <Modal isOpen={isOpen} onClose={onClose} isCentered {...modalProps}>
                <ModalOverlay {...modalOverlayProps} />
                <ModalContent {...modalContentProps}>
                    {title && <ModalHeader>{title}</ModalHeader>}
                    <ModalCloseButton {...modalCloseButtonProps} />
                    <ModalBody {...modalBodyProps}>
                        <VStack spacing={4} align="center">
                            <Text>{popupText}</Text>
                            {claimAmount && (
                                <Text fontSize="xl" fontWeight="bold">
                                    Amount to claim: {Number(claimAmount).toFixed(2)} {claimToken?.displayName}
                                </Text>
                            )}
                            <Button
                                onClick={handleClaim}
                                isLoading={merkleClaimStatus.loading}
                                loadingText="Claiming..."
                                colorScheme="blue"
                                width="full"
                            >
                                Confirm Claim
                            </Button>
                        </VStack>
                    </ModalBody>
                    {bottomText && (
                        <ModalFooter justifyContent="center">
                            <Text fontSize="sm">{bottomText}</Text>
                        </ModalFooter>
                    )}
                </ModalContent>
            </Modal>
        </>
    );
};

export default MerkleClaimButton;