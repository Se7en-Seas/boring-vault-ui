// src/components/v1/DepositAndBridgeButton.tsx
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
  Avatar,
  useToast,
} from "@chakra-ui/react";
import { useBoringVaultV1 } from "../../contexts/v1/BoringVaultContextV1";
import { Token } from "../../types";
import { Contract, formatUnits } from "ethers";
import { erc20Abi } from "viem";
import { useEthersSigner } from "../../hooks/ethers";
import { useAccount } from "wagmi";
import { 
  LayerZeroChain, 
  LAYERZERO_CHAIN_IDS, 
  getChainDisplayName 
} from "../../utils/layerzero-chains";

interface DepositAndBridgeButtonProps {
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

const DepositAndBridgeButton: React.FC<DepositAndBridgeButtonProps> = ({
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
  ...depositAndBridgeButtonProps
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    depositTokens,
    ethersProvider,
    depositAndBridge,
    depositAndBridgeStatus,
  } = useBoringVaultV1();

  const { address } = useAccount();
  const [selectedToken, setSelectedToken] = React.useState<Token>(
    depositTokens[0]
  );
  const [balance, setBalance] = React.useState(0.0);
  const [depositAmount, setDepositAmount] = React.useState("");
  const [minimumMint, setMinimumMint] = React.useState("");
  const [destinationChain, setDestinationChain] = React.useState<LayerZeroChain>("ethereum");
  const [maxFee, setMaxFee] = React.useState("0.01"); // Default max fee in ETH
  const signer = useEthersSigner();

  // Available destination chains
  const availableChains = Object.keys(LAYERZERO_CHAIN_IDS) as LayerZeroChain[];

  useEffect(() => {
    async function fetchBalance() {
      if (!signer || !selectedToken || !ethersProvider) return;

      try {
        const tokenContract = new Contract(
          selectedToken.address,
          erc20Abi,
          ethersProvider
        );

        const tokenBalance = await tokenContract.balanceOf(await signer.getAddress());
        const formattedBalance = parseFloat(
          formatUnits(tokenBalance, selectedToken.decimals)
        );
        setBalance(formattedBalance);
      } catch (error) {
        console.error("Failed to fetch token balance:", error);
        setBalance(0);
      }
    }

    fetchBalance();
  }, [signer, selectedToken, ethersProvider]);

  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newTokenAddress = event.target.value;
    const newSelectedToken = depositTokens.find(
      (token) => token.address === newTokenAddress
    );
    setSelectedToken(newSelectedToken || depositTokens[0]);
  };

  const handleDepositAndBridge = async () => {
    if (!signer || !depositAmount || !minimumMint || !destinationChain) return;

    // ETH as fee token with 18 decimals
    const feeToken: Token = {
      address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      decimals: 18,
      displayName: "ETH"
    };

    await depositAndBridge(
      signer,
      selectedToken.address,
      depositAmount,
      minimumMint,
      destinationChain,
      maxFee,
      feeToken
    );
  };

  const toast = useToast();
  useEffect(() => {
    if (depositAndBridgeStatus.loading) {
      toast({
        title: "Processing deposit and bridge...",
        status: "info",
        duration: 5000,
        isClosable: true,
      });
    } else if (depositAndBridgeStatus.success) {
      toast({
        title: "Deposit and bridge successful",
        description: `Transaction hash: ${depositAndBridgeStatus.tx_hash}`,
        status: "success",
        duration: 5000,
        isClosable: true,
      });
      onClose(); // Close modal on success
    } else if (depositAndBridgeStatus.error) {
      toast({
        title: "Failed to deposit and bridge",
        description: depositAndBridgeStatus.error,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
  }, [depositAndBridgeStatus, toast, onClose]);

  const isValidAmount = parseFloat(depositAmount || "0") > 0 && parseFloat(depositAmount || "0") <= balance;
  const isValidMinimumMint = parseFloat(minimumMint || "0") >= 0;
  // Recipient is always the connected wallet, so no validation needed
  const isValidFee = parseFloat(maxFee || "0") > 0;

  return (
    <>
      <Button onClick={onOpen} {...buttonProps}>
        {buttonText}
      </Button>

      <Modal isOpen={isOpen} onClose={onClose} size="md" {...modalProps}>
        <ModalOverlay {...modalOverlayProps} />
        <ModalContent {...modalContentProps}>
          <ModalHeader>{title || "Deposit & Bridge"}</ModalHeader>
          <ModalCloseButton {...modalCloseButtonProps} />
          <ModalBody {...modalBodyProps}>
            <VStack spacing={4}>
              <Text fontSize="md" textAlign="center">
                {depositAndBridgeButtonProps.popupText}
              </Text>

              {/* Token Selection */}
              <FormControl>
                <FormLabel>Deposit Token</FormLabel>
                <HStack>
                  <Avatar
                    size="sm"
                    src={selectedToken?.image}
                    name={selectedToken?.displayName}
                  />
                  <Select value={selectedToken?.address} onChange={handleSelectChange}>
                    {depositTokens.map((token) => (
                      <option key={token.address} value={token.address}>
                        {token.displayName}
                      </option>
                    ))}
                  </Select>
                </HStack>
              </FormControl>

              {/* Deposit Amount */}
              <FormControl>
                <FormLabel>Deposit Amount</FormLabel>
                <InputGroup>
                  <Input
                    placeholder="0.00"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    type="number"
                    {...inputProps}
                  />
                  <InputRightElement width="4.5rem">
                    <Button
                      h="1.75rem"
                      size="sm"
                      onClick={() => setDepositAmount(balance.toString())}
                    >
                      MAX
                    </Button>
                  </InputRightElement>
                </InputGroup>
                <FormHelperText>
                  Balance: {balance.toFixed(6)} {selectedToken?.displayName}
                </FormHelperText>
              </FormControl>

              {/* Minimum Mint */}
              <FormControl>
                <FormLabel>Minimum Shares to Mint</FormLabel>
                <Input
                  placeholder="0.00"
                  value={minimumMint}
                  onChange={(e) => setMinimumMint(e.target.value)}
                  type="number"
                  {...inputProps}
                />
                <FormHelperText>
                  Slippage protection - minimum shares you'll accept
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
                  Maximum fee willing to pay for bridging. Note: You'll also need native tokens on the destination chain to pay for gas.
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
              onClick={handleDepositAndBridge}
              isDisabled={!isValidAmount || !isValidMinimumMint || !isValidFee || depositAndBridgeStatus.loading}
              isLoading={depositAndBridgeStatus.loading}
              loadingText="Processing..."
              mr={3}
            >
              Deposit & Bridge
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

export default DepositAndBridgeButton;