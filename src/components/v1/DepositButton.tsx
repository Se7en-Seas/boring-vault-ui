// src/components/v1/DepositButton.tsx
import React from "react";
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
} from "@chakra-ui/react";

import { useBoringVaultV1 } from "../../contexts/v1/BoringVaultContextV1";

interface DepositButtonProps {
  buttonText: string;
  popupText: string;
  buttonProps?: ButtonProps;
  modalProps?: ModalProps;
  modalOverlayProps?: ModalOverlayProps;
  modalContentProps?: ModalContentProps;
  modalBodyProps?: ModalBodyProps;
  modalCloseButtonProps?: ModalCloseButtonProps;
}
// src/components/v1/DepositButton.tsx
const DepositButton: React.FC<DepositButtonProps> = ({
  buttonText,
  popupText,
  buttonProps,
  modalOverlayProps,
  modalContentProps,
  modalBodyProps,
  modalCloseButtonProps,
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { depositTokens, isConnected } = useBoringVaultV1();

  return (
    <>
      <Button onClick={onOpen} disabled={!isConnected} {...buttonProps}>
        {buttonText}
      </Button>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        motionPreset="slideInBottom"
        isCentered={true}
      >
        <ModalOverlay {...modalOverlayProps} />
        <ModalContent {...modalContentProps}>
          <ModalCloseButton {...modalCloseButtonProps} />
          <ModalBody {...modalBodyProps}>
            <Text>{popupText}</Text>
            <Select placeholder="Select Deposit Asset" mb={4}>
              {depositTokens.map((token) => (
                <Box as="option" key={token.address} value={token.address}>
                  <Image
                    src={token.image}
                    alt={token.address}
                    boxSize="20px"
                    mr={2}
                  />
                  {token.displayName}
                </Box>
              ))}
            </Select>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

export default DepositButton;
