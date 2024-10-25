// src/components/v1/BoringQueueButton.tsx

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
  HStack,
  VStack,
  Box,
  Image,
  Select,
  InputGroup,
  Input,
  InputRightElement,
  FormControl,
  Flex,
  FormHelperText,
  FormLabel,
  InputProps,
  ButtonGroup,
  ModalHeader,
  ModalFooter,
  Avatar,
  useToast,
} from "@chakra-ui/react";
import { useBoringVaultV1 } from "../../contexts/v1/BoringVaultContextV1";
import { Token } from "../../types";
import { Contract, formatUnits } from "ethers";
import { erc20Abi } from "viem";
import { useEthersSigner } from "../../hooks/ethers";
import { useAccount } from "wagmi";

interface BoringQueueButtonProps {
  buttonText: string;
  popupText: string;
  title?: string; // Optional title
  bottomText?: string; // Optional bottom text (e.g. disclaimer, etc.)
  buttonProps?: ButtonProps;
  modalProps?: ModalProps;
  modalOverlayProps?: ModalOverlayProps;
  modalContentProps?: ModalContentProps;
  modalBodyProps?: ModalBodyProps;
  modalCloseButtonProps?: ModalCloseButtonProps;
  inputProps?: any;
}

const BoringQueueButton: React.FC<BoringQueueButtonProps> = ({
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
    withdrawStatus,
    queueBoringWithdraw,
    fetchUserShares,
  } = useBoringVaultV1();

  const [selectedToken, setSelectedToken] = React.useState<Token>(
    withdrawTokens[0]
  );
  const [balance, setBalance] = React.useState(0.0);
  const [withdrawAmount, setWithdrawAmount] = React.useState("");
  const [discountPercent, setDiscountPercent] = React.useState("");
  const [daysValid, setDaysValid] = React.useState("");
  const signer = useEthersSigner();

  useEffect(() => {
    async function fetchBalance() {
      if (!signer || !ethersProvider) return;

      try {
        const shareBalance = await fetchUserShares(
          await signer.getAddress(),
        );
        setBalance(shareBalance);
      } catch (error) {
        console.error("Failed to fetch share balance:", error);
        setBalance(0); // Optionally reset balance on error
      }
    }

    fetchBalance();
  }, [signer, ethersProvider]);

  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newTokenAddress = event.target.value;
    console.log("New token address:", newTokenAddress);
    console.log("Withdraw tokens:", withdrawTokens);
    const newSelectedToken = withdrawTokens.find(
      (token) => token.address === newTokenAddress
    );
    setSelectedToken(newSelectedToken || withdrawTokens[0]);
  };

  // TODO: Allow people to pass in a toast to allow for custom toast branding
  const toast = useToast();
  useEffect(() => {
    if (withdrawStatus.loading) {
      toast({
        title: "Processing withdraw...",
        status: "info",
        duration: 5000,
        isClosable: true,
      });
    } else if (withdrawStatus.success) {
      toast({
        title: "Intent successful",
        // Add link to etherscan
        description: `Transaction hash: ${withdrawStatus.tx_hash}`,
        status: "success",
        duration: 5000,
        isClosable: true,
      });
    } else if (withdrawStatus.error) {
      toast({
        title: "Failed to initiate withdraw",
        description: withdrawStatus.error,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
  }, [withdrawStatus, toast]);

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
            >
              <VStack spacing="2" width={"100%"} align={"right"}>
                <HStack spacing="2">
                  <Text whiteSpace="nowrap" fontWeight={"bold"}>
                    Asset Out:{" "}
                  </Text>
                  <Select
                    onChange={handleSelectChange}
                    value={selectedToken.address}
                    icon={
                      <Avatar
                        size="lg"
                        src={selectedToken.image}
                        onChange={handleSelectChange}
                      />
                    }
                  >
                    {withdrawTokens.map((token) => (
                      <>
                        <Avatar size="l" src={token.image} />
                        <option key={token.address} value={token.address}>
                          {token.displayName}
                        </option>
                      </>
                    ))}
                  </Select>
                </HStack>
                <FormControl>
                  <HStack spacing="2">
                    <Text whiteSpace="nowrap" fontWeight={"bold"}>
                      Shares to Redeem:{" "}
                    </Text>
                    {/* TODO: Sterilize input to only allow positive numbers */}
                    <Input
                      placeholder="0.00"
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      {...inputProps}
                    />
                  </HStack>
                  <FormHelperText textAlign="right">
                    Share Balance: {balance} <Button size="xs">MAX</Button>
                  </FormHelperText>
                </FormControl>
                <FormControl>
                  <VStack spacing="10">
                    <Text fontWeight={"bold"} height={"20px"} width={"100%"}>
                      Discount Percent (if share value is 1, a discount of 1%
                      means you'll accept a share price of 0.99):{" "}
                    </Text>
                    {/* TODO: Sterilize input to only allow positive numbers */}
                    <Input
                      placeholder="0.00"
                      onChange={(e) => setDiscountPercent(e.target.value)}
                      {...inputProps}
                    />
                  </VStack>
                </FormControl>
                <FormControl>
                  <HStack spacing="2">
                    <Text whiteSpace="nowrap" fontWeight={"bold"}>
                      Days Valid (until order expires if unfulfilled):{" "}
                    </Text>
                    {/* TODO: Sterilize input to only allow positive numbers */}
                    <Input
                      placeholder="0"
                      onChange={(e) => setDaysValid(e.target.value)}
                      {...inputProps}
                    />
                  </HStack>
                </FormControl>
              </VStack>
            </Flex>
            <Flex justifyContent="space-between" mt={2}>
              {/* Example static value, replace with actual conversion */}
              <Button
                mt={4}
                onClick={() =>
                  queueBoringWithdraw(
                    signer!,
                    withdrawAmount,
                    selectedToken,
                    discountPercent,
                    daysValid
                  )
                }
                isDisabled={
                  !withdrawAmount ||
                  !discountPercent ||
                  !daysValid ||
                  parseFloat(withdrawAmount) > balance
                }
                {...withdrawButtonProps}
              >
                Initiate Withdraw
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

export default BoringQueueButton;
