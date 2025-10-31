// src/components/v1/InstantWithdrawButton.tsx

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
  Select,
  Input,
  FormControl,
  Flex,
  FormHelperText,
  ModalHeader,
  ModalFooter,
  Avatar,
  useToast,
} from "@chakra-ui/react";
import { useBoringVaultV1 } from "../../contexts/v1/BoringVaultContextV1";
import { Token } from "../../types";
import { useEthersSigner } from "../../hooks/ethers";
import { useAccount } from "wagmi";

interface InstantWithdrawButtonProps {
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
  inputProps?: any;
}

const InstantWithdrawButton: React.FC<InstantWithdrawButtonProps> = ({
  buttonText,
  buttonProps,
  modalProps,
  modalOverlayProps,
  modalContentProps,
  modalBodyProps,
  modalCloseButtonProps,
  inputProps,
  title,
  bottomText,
  ...withdrawButtonProps
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    withdrawTokens,
    ethersProvider,
    instantWithdraw,
    instantWithdrawStatus,
    fetchUserShares,
  } = useBoringVaultV1();

  const [selectedToken, setSelectedToken] = React.useState<Token>(
    withdrawTokens[0]
  );
  const [balance, setBalance] = React.useState(0.0);
  const [withdrawAmount, setWithdrawAmount] = React.useState("");
  const signer = useEthersSigner();

  useEffect(() => {
    async function fetchBalance() {
      if (!signer || !ethersProvider) return;

      try {
        const shareBalance = await fetchUserShares(
          await signer.getAddress()
        );
        setBalance(shareBalance);
      } catch (error) {
        console.error("Failed to fetch share balance:", error);
        setBalance(0);
      }
    }

    fetchBalance();
  }, [signer, ethersProvider, fetchUserShares]);

  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newTokenAddress = event.target.value;
    const newSelectedToken = withdrawTokens.find(
      (token) => token.address === newTokenAddress
    );
    setSelectedToken(newSelectedToken || withdrawTokens[0]);
  };

  const toast = useToast();
  useEffect(() => {
    if (instantWithdrawStatus.loading) {
      toast({
        title: "Processing instant withdraw...",
        status: "info",
        duration: 5000,
        isClosable: true,
      });
    } else if (instantWithdrawStatus.success) {
      toast({
        title: "Instant withdraw successful",
        description: `Transaction hash: ${instantWithdrawStatus.tx_hash}`,
        status: "success",
        duration: 5000,
        isClosable: true,
      });
    } else if (instantWithdrawStatus.error) {
      toast({
        title: "Failed to withdraw",
        description: instantWithdrawStatus.error,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
  }, [instantWithdrawStatus, toast]);

  const isButtonDisabled =
    !signer ||
    !withdrawAmount ||
    parseFloat(withdrawAmount || "0") <= 0 ||
    parseFloat(withdrawAmount || "0") > balance ||
    instantWithdrawStatus.loading;

  return (
    <>
      <Button onClick={onOpen} isDisabled={!useAccount().isConnected} {...buttonProps}>
        {buttonText}
      </Button>
      <Modal isOpen={isOpen} onClose={onClose} isCentered {...modalProps}>
        <ModalOverlay {...modalOverlayProps} />
        <ModalContent {...modalContentProps}>
          {title && <ModalHeader>{title}</ModalHeader>}
          <ModalCloseButton {...modalCloseButtonProps} />
          <ModalBody {...modalBodyProps}>
            <Flex
              alignItems="center"
              justifyContent="space-between"
              width={"100%"}
              gap={4}
            >
              <Select
                onChange={handleSelectChange}
                value={selectedToken.address}
                icon={
                  <Avatar
                    size="lg"
                    src={selectedToken.image}
                  />
                }
              >
                {withdrawTokens.map((token) => (
                  <option key={token.address} value={token.address}>
                    {token.displayName}
                  </option>
                ))}
              </Select>
              <FormControl>
                <Input
                  placeholder="0.00"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  type="number"
                  min="0"
                  step="any"
                  {...inputProps}
                />
                <FormHelperText textAlign="right">
                  Shares: {balance.toFixed(6)}
                  <Button
                    size="xs"
                    ml={2}
                    onClick={() => setWithdrawAmount(balance.toString())}
                  >
                    MAX
                  </Button>
                </FormHelperText>
              </FormControl>
            </Flex>
            <Flex justifyContent="flex-end" mt={4}>
              <Button
                onClick={() => instantWithdraw(signer!, withdrawAmount, selectedToken)}
                isDisabled={isButtonDisabled}
                isLoading={instantWithdrawStatus.loading}
                loadingText="Withdrawing..."
                colorScheme="blue"
                width="full"
                {...withdrawButtonProps}
              >
                Instant Withdraw
              </Button>
            </Flex>
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

export default InstantWithdrawButton;
