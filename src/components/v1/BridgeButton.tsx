// src/components/v1/BridgeButton.tsx
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
  Select,
  InputGroup,
  Input,
  InputRightElement,
  FormControl,
  Flex,
  FormHelperText,
  FormLabel,
  InputProps,
  ModalHeader,
  ModalFooter,
  useToast,
} from "@chakra-ui/react";
import { useBoringVaultV1 } from "../../contexts/v1/BoringVaultContextV1";
import { Token } from "../../types";
import { Contract, formatUnits } from "ethers";
import { erc20Abi } from "viem";
import { useEthersSigner } from "../../hooks/ethers";
import { 
  LayerZeroChain, 
  LAYERZERO_CHAIN_IDS, 
  getChainDisplayName 
} from "../../utils/layerzero-chains";

interface BridgeButtonProps {
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

const BridgeButton: React.FC<BridgeButtonProps> = ({
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
  ...bridgeButtonProps
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    ethersProvider,
    bridge,
    bridgeStatus,
    vaultEthersContract,
  } = useBoringVaultV1();

  const [shareBalance, setShareBalance] = React.useState<number>(0.0);
  const [shareAmount, setShareAmount] = React.useState<string>("");
  const [destinationChain, setDestinationChain] = React.useState<LayerZeroChain>("ethereum");
  const [maxFee, setMaxFee] = React.useState<string>("0.003"); // Default max fee in ETH
  const signer = useEthersSigner();

  // Available destination chains (excluding current chain)
  const availableChains = Object.keys(LAYERZERO_CHAIN_IDS) as LayerZeroChain[];

  useEffect(() => {
    async function fetchShareBalance() {
      if (!signer || !vaultEthersContract || !ethersProvider) return;

      try {
        const userAddress = await signer.getAddress();
        const [balance, decimals] = await Promise.all([
          vaultEthersContract.balanceOf(userAddress), 
          vaultEthersContract.decimals();
        ]);
        const formattedBalance = parseFloat(formatUnits(balance, decimals));
        setShareBalance(formattedBalance);
      } catch (error) {
        console.error("Failed to fetch share balance:", error);
        setShareBalance(0);
      }
    }

    fetchShareBalance();
  }, [signer, vaultEthersContract, ethersProvider]);

  const handleBridge = async () => {
    if (!signer || !shareAmount || !destinationChain) return;

    // ETH as fee token with 18 decimals
    const feeToken: Token = {
      address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      decimals: 18,
      displayName: "ETH"
    };

    await bridge(
      signer,
      shareAmount,
      destinationChain,
      maxFee,
      feeToken
    );
  };

  const toast = useToast();
  useEffect(() => {
    if (bridgeStatus.loading) {
      toast({
        title: "Processing bridge...",
        status: "info",
        duration: 5000,
        isClosable: true,
      });
    } else if (bridgeStatus.success) {
      toast({
        title: "Bridge successful",
        description: `Transaction hash: ${bridgeStatus.tx_hash}`,
        status: "success",
        duration: 5000,
        isClosable: true,
      });
      onClose(); // Close modal on success
    } else if (bridgeStatus.error) {
      toast({
        title: "Failed to bridge",
        description: bridgeStatus.error,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
  }, [bridgeStatus, toast, onClose]);

  const isValidAmount = parseFloat(shareAmount || "0") > 0 && parseFloat(shareAmount || "0") <= shareBalance;
  const isValidFee = parseFloat(maxFee || "0") > 0;

  return (
    <>
      <Button onClick={onOpen} {...buttonProps}>
        {buttonText}
      </Button>

      <Modal isOpen={isOpen} onClose={onClose} size="md" {...modalProps}>
        <ModalOverlay {...modalOverlayProps} />
        <ModalContent {...modalContentProps}>
          <ModalHeader>{title || "Bridge Shares"}</ModalHeader>
          <ModalCloseButton {...modalCloseButtonProps} />
          <ModalBody {...modalBodyProps}>
            <VStack spacing={4}>
              <Text fontSize="md" textAlign="center">
                {bridgeButtonProps.popupText}
              </Text>

              {/* Share Amount Input */}
              <FormControl>
                <FormLabel>Share Amount</FormLabel>
                <InputGroup>
                  <Input
                    placeholder="0.00"
                    value={shareAmount}
                    onChange={(e) => setShareAmount(e.target.value)}
                    type="number"
                    {...inputProps}
                  />
                  <InputRightElement width="4.5rem">
                    <Button
                      h="1.75rem"
                      size="sm"
                      onClick={() => setShareAmount(shareBalance.toString())}
                    >
                      MAX
                    </Button>
                  </InputRightElement>
                </InputGroup>
                <FormHelperText>
                  Balance: {shareBalance.toFixed(6)} shares
                </FormHelperText>
              </FormControl>

              {/* Destination Chain */}
              <FormControl>
                <FormLabel>Destination Chain</FormLabel>
                <Select
                  value={destinationChain}
                  onChange={(e) => setDestinationChain(e.target.value as LayerZeroChain)}
                >
                  {availableChains.map((chain) => (
                    <option key={chain} value={chain}>
                      {getChainDisplayName(chain)}
                    </option>
                  ))}
                </Select>
              </FormControl>


              {/* Max Fee */}
              <FormControl>
                <FormLabel>Max Bridge Fee (ETH)</FormLabel>
                <Input
                  placeholder="0.01"
                  value={maxFee}
                  onChange={(e) => setMaxFee(e.target.value)}
                  type="number"
                  step="0.001"
                  {...inputProps}
                />
                <FormHelperText>
                  Maximum fee willing to pay for bridging.
                </FormHelperText>
              </FormControl>

              {bottomText && (
                <Text fontSize="sm" color="gray.500" textAlign="center">
                  {bottomText}
                </Text>
              )}
            </VStack>
          </ModalBody>

          <ModalFooter>
            <Button
              colorScheme="blue"
              onClick={handleBridge}
              isDisabled={!isValidAmount || !isValidFee || bridgeStatus.loading}
              isLoading={bridgeStatus.loading}
              loadingText="Bridging..."
              mr={3}
            >
              Bridge Shares
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default BridgeButton;