// src/components/v1/PendingDelayedWithdraws.tsx
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

interface DelayWithdrawButtonProps {
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

const DelayWithdrawButton: React.FC<DelayWithdrawButtonProps> = ({
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
    isConnected,
    userAddress,
    ethersProvider,
    withdrawStatus,
    delayWithdraw,
    fetchUserShares,
  } = useBoringVaultV1();

  const [selectedToken, setSelectedToken] = React.useState<Token>(
    withdrawTokens[0]
  );
  const [balance, setBalance] = React.useState(0.0);
  const [withdrawAmount, setWithdrawAmount] = React.useState("");
  const [maxLossPercent, setMaxLossPercent] = React.useState("");
  const signer = useEthersSigner();

  useEffect(() => {
    async function fetchBalance() {
      if (!userAddress || !ethersProvider) return;

      try {
        const shareBalance = await fetchUserShares();
        setBalance(shareBalance);
      } catch (error) {
        console.error("Failed to fetch share balance:", error);
        setBalance(0); // Optionally reset balance on error
      }
    }

    fetchBalance();
  }, [userAddress, ethersProvider]);

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
        duration: 3000,
        isClosable: true,
      });
    } else if (withdrawStatus.success) {
      toast({
        title: "Withdraw Intent successful",
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
      <Button onClick={onOpen} isDisabled={!isConnected} {...buttonProps}>
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
                  <HStack spacing="2">
                    <Text whiteSpace="nowrap" fontWeight={"bold"}>
                      Max Loss Percent (share price delta):{" "}
                    </Text>
                    {/* TODO: Sterilize input to only allow positive numbers */}
                    <Input
                      placeholder="0.00"
                      onChange={(e) => setMaxLossPercent(e.target.value)}
                      {...inputProps}
                    />
                  </HStack>
                  <FormHelperText textAlign="right">
                    Deviation from current share price before withdrawl becomes
                    invalid. Setting to 0 will use default value of the contract
                  </FormHelperText>
                </FormControl>
              </VStack>
            </Flex>
            <Flex justifyContent="space-between" mt={2}>
              {/* Example static value, replace with actual conversion */}
              <Button
                mt={4}
                onClick={() =>
                  delayWithdraw(
                    signer!,
                    withdrawAmount,
                    selectedToken,
                    maxLossPercent,
                    false
                  )
                }
                isDisabled={
                  !withdrawAmount ||
                  !maxLossPercent ||
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

export default DelayWithdrawButton;
